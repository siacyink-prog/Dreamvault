import assert from "node:assert/strict";
import test from "node:test";
import { cleanTitle, pageOf, publicDream } from "../server/lib/dreams.js";

test("sealed entries never expose their body through the public serializer", () => {
  const result = publicDream({
    id: "private-1",
    title: "Folded",
    content: "do not leak this",
    hidden_reason: "also private",
    visibility: "sealed",
    created_at: "2026-09-27T00:00:00.000Z",
  });
  assert.equal(result.content, null);
  assert.equal(result.visibility, "sealed");
  assert.equal(result.hidden, true);
  assert.equal("hidden_reason" in result, false);
  assert.doesNotMatch(JSON.stringify(result), /do not leak|also private/);
});

test("pagination is newest-first and bounded", () => {
  const entries = [
    { id: "old", visibility: "public", created_at: "2026-09-25T00:00:00.000Z" },
    { id: "new", visibility: "public", created_at: "2026-09-27T00:00:00.000Z" },
  ];
  const result = pageOf(entries, 1, 1);
  assert.equal(result.total, 2);
  assert.equal(result.entries[0].id, "new");
  assert.equal(result.limit, 1);
});

test("titles are normalized and length-limited", () => {
  assert.equal(cleanTitle("  “A small page。”  "), "A small page");
  assert.equal(Array.from(cleanTitle("x".repeat(120))).length, 80);
});


