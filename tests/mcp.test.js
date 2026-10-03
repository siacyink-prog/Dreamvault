import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createDreamMcpHandler } from "../server/mcp.js";

test("remote MCP requires a token and never reveals hidden dream content", async () => {
  const previousToken = process.env.MCP_TOKEN;
  process.env.MCP_TOKEN = "test-secret";
  const store = {
    all: () => [{
      id: "private-1", title: "Folded", content: "private body",
      hidden_reason: "private reason", visibility: "hidden",
      created_at: "2026-09-27T00:00:00.000Z",
    }],
    rename: () => null,
  };
  const server = createServer(createDreamMcpHandler(store));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  const body = JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "list_dreams", arguments: {} },
  });
  try {
    const request = (headers = {}) => fetch(url, {
      method: "POST", headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      }, body,
    });
    assert.equal((await request()).status, 401);
    assert.equal((await request({ Origin: "https://example.com", Authorization: "Bearer test-secret" })).status, 403);
    const result = await request({ Authorization: "Bearer test-secret" });
    assert.equal(result.status, 200);
    const responseText = await result.text();
    assert.doesNotMatch(responseText, /private body|private reason/);
    const message = JSON.parse(responseText.match(/^data: (.+)$/m)[1]);
    const page = JSON.parse(message.result.content[0].text);
    assert.equal(page.entries[0].content, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousToken === undefined) delete process.env.MCP_TOKEN;
    else process.env.MCP_TOKEN = previousToken;
  }
});

