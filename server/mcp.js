import { timingSafeEqual } from "node:crypto";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod/v4";
import { cleanTitle, dreamMetadata, trustedDream } from "./lib/dreams.js";

export function createDreamMcpHandler(store) {
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "dreamvault", version: "0.1.0" });

    server.registerTool("dream_write", {
      description: "Write a new dream as a public or sealed page.",
      inputSchema: z.object({
        title: z.string().optional(),
        content: z.string().min(1),
        visibility: z.enum(["public", "sealed"]),
      }),
    }, async ({ title, content, visibility }) => {
      const cleanedTitle = title === undefined ? null : cleanTitle(title);
      const created = store.create({ title: cleanedTitle || null, content, visibility });
      return { content: [{ type: "text", text: JSON.stringify(dreamMetadata(created)) }] };
    });

    server.registerTool("dream_list", {
      description: "List dream metadata newest first. This tool never returns page content.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    }, async () => {
      const entries = store.all()
        .slice()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(dreamMetadata);
      return { content: [{ type: "text", text: JSON.stringify(entries) }] };
    });

    server.registerTool("dream_read", {
      description: "Read one dream by ID, including sealed content. Reading does not reveal it in the user-facing app.",
      inputSchema: z.object({ id: z.string().regex(/^dream_[a-zA-Z0-9_-]+$/) }),
      annotations: { readOnlyHint: true },
    }, async ({ id }) => {
      const entry = store.get(id);
      if (!entry) return { isError: true, content: [{ type: "text", text: "dream not found" }] };
      return { content: [{ type: "text", text: JSON.stringify(trustedDream(entry)) }] };
    });

    server.registerTool("dream_reveal", {
      description: "Reveal a sealed dream in the user-facing app by changing its visibility to public.",
      inputSchema: z.object({ id: z.string().regex(/^dream_[a-zA-Z0-9_-]+$/) }),
    }, async ({ id }) => {
      const entry = store.get(id);
      if (!entry) return { isError: true, content: [{ type: "text", text: "dream not found" }] };
      if (dreamMetadata(entry).visibility !== "sealed") {
        return { isError: true, content: [{ type: "text", text: "dream is already public" }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(dreamMetadata(store.reveal(id))) }] };
    });

    server.registerTool("dream_rename", {
      description: "Change the title of a dream by ID without changing its visibility.",
      inputSchema: z.object({
        id: z.string().regex(/^dream_[a-zA-Z0-9_-]+$/),
        title: z.string().min(1),
      }),
    }, async ({ id, title }) => {
      const cleaned = cleanTitle(title);
      if (!cleaned) return { isError: true, content: [{ type: "text", text: "title is required" }] };
      const updated = store.rename(id, cleaned);
      if (!updated) return { isError: true, content: [{ type: "text", text: "dream not found" }] };
      return { content: [{ type: "text", text: JSON.stringify(dreamMetadata(updated)) }] };
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

