# Dreamvault remote MCP

The server exposes Streamable HTTP at `/mcp` on the same host and port as the web app. It provides:

- `list_dreams`: newest-first, paginated journal entries. Hidden entries have `content: null` and never expose private reasons.
- `rename_dream`: change a journal entry's title by ID.

Set `MCP_TOKEN` to a long, random value in the deployment environment. The MCP endpoint returns 503 until this variable is set. Give the same token to your MCP client as a bearer token in the `Authorization` header. Do not put the token in the repository or a URL.

For Zeabur, keep `npm start` as the start command and use the app's public HTTPS address followed by `/mcp` as the MCP server URL. When the platform supplies `PORT`, the server binds to `0.0.0.0` automatically. The included JSON file is demo storage; use persistent storage before relying on saved title changes across redeployments.

The project has no user accounts or per-user authorization. Treat the MCP token as access to the shared journal; do not distribute it to other users. The regular `/api/dream` endpoint remains a public demo endpoint and continues to mask hidden entry content.

