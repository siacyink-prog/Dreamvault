import { timingSafeEqual } from "node:crypto";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod/v4";
import { cleanTitle, pageOf, publicDream } from "./lib/dreams.js";

export function createDreamMcpHandler(store) {
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "dreamvault", version: "0.1.0" });

    server.registerTool("list_dreams", {
      description: "List journal entries newest first. Hidden entries never include their content or private reason.",
      inputSchema: z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      annotations: { readOnlyHint: true },
    }, async ({ page, limit }) => ({
      content: [{ type: "text", text: JSON.stringify(pageOf(store.all(), page, limit)) }],
    }));

    server.registerTool("rename_dream", {
      description: "Change the title of a journal entry by ID. This does not reveal hidden content.",
      inputSchema: z.object({
        id: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),
        title: z.string().min(1),
      }),
    }, async ({ id, title }) => {
      const cleaned = cleanTitle(title);
      if (!cleaned) return { isError: true, content: [{ type: "text", text: "title is required" }] };
      const updated = store.rename(id, cleaned);
      if (!updated) return { isError: true, content: [{ type: "text", text: "dream not found" }] };
      return { content: [{ type: "text", text: JSON.stringify(publicDream(updated)) }] };
    });

    return server;
  });
  const nodeHandler = toNodeHandler(handler);

  return async (request, response) => {
    const secret = process.env.MCP_TOKEN;
    if (!secret) {
      response.writeHead(503).end("MCP_TOKEN is not configured");
      return;
    }
    // Browser-origin requests are not supported: MCP clients connect directly.
    if (request.headers.origin) {
      response.writeHead(403).end("Forbidden origin");
      return;
    }
    const authorization = request.headers.authorization;
    const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    const actual = Buffer.from(supplied);
    const expected = Buffer.from(secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      response.writeHead(401, { "WWW-Authenticate": "Bearer" }).end("Unauthorized");
      return;
    }
    await nodeHandler(request, response);
  };
}

