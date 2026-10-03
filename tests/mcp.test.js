import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JsonDreamStore } from "../server/lib/store.js";
import { createDreamMcpHandler } from "../server/mcp.js";

function decodeResult(text) {
  const message = JSON.parse(text.match(/^data: (.+)$/m)[1]);
  return JSON.parse(message.result.content[0].text);
}

test("remote MCP implements the five dream tools without leaking sealed pages in lists", async () => {
  const previousToken = process.env.MCP_TOKEN;
  process.env.MCP_TOKEN = "test-secret";
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamvault-mcp-"));
  const seedFile = path.join(directory, "seed.json");
  fs.writeFileSync(seedFile, JSON.stringify([{
    id: "dream_private", title: "Folded", content: "private body",
    visibility: "sealed", created_at: "2026-09-27T00:00:00.000Z",
  }]));
  const store = new JsonDreamStore({ file: path.join(directory, "dreams.json"), seedFile });
  const server = createServer(createDreamMcpHandler(store));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/mcp`;

  async function call(name, args = {}, headers = {}) {
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer test-secret",
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: name, method: "tools/call", params: { name, arguments: args } }),
    });
  }

  try {
    assert.equal((await call("dream_list", {}, { Authorization: "" })).status, 401);
    assert.equal((await call("dream_list", {}, { Origin: "https://example.com" })).status, 403);

    const listed = await call("dream_list");
    assert.equal(listed.status, 200);
    const listText = await listed.text();
    assert.doesNotMatch(listText, /private body/);
    assert.deepEqual(decodeResult(listText), [{
      id: "dream_private", title: "Folded", visibility: "sealed",
      created: "2026-09-27T00:00:00.000Z",
    }]);

    const read = decodeResult(await (await call("dream_read", { id: "dream_private" })).text());
    assert.equal(read.content, "private body");
    assert.equal(store.get("dream_private").visibility, "sealed");

    const written = decodeResult(await (await call("dream_write", {
      title: "  A new page!  ", content: "new body", visibility: "sealed",
    })).text());
    assert.match(written.id, /^dream_[a-f0-9]{16}$/);
    assert.equal(written.title, "A new page");
    assert.equal(written.visibility, "sealed");

    const renamed = decodeResult(await (await call("dream_rename", {
      id: written.id, title: "  Better title。  ",
    })).text());
    assert.equal(renamed.title, "Better title");
    assert.equal(renamed.visibility, "sealed");

    const revealed = decodeResult(await (await call("dream_reveal", { id: written.id })).text());
    assert.equal(revealed.visibility, "public");
    assert.equal(store.get(written.id).content, "new body");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
    if (previousToken === undefined) delete process.env.MCP_TOKEN;
    else process.env.MCP_TOKEN = previousToken;
  }
});

