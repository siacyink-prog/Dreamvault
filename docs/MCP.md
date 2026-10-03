# Dreamvault remote MCP

The server exposes Streamable HTTP at `/mcp` on the same host and port as the web app. It provides:

- `dream_write`: create a page with `title` (optional), `content`, and `visibility` (`public` or `sealed`).
- `dream_list`: return only `id`, `title`, `visibility`, and `created`, newest first. It never returns content.
- `dream_read`: return one page by ID. An authenticated MCP client can read sealed content, but this does not reveal it in the web app.
- `dream_reveal`: explicitly change a sealed page to public.
- `dream_rename`: change a page title without changing its visibility.

Set `MCP_TOKEN` to a long, random value in the deployment environment. The MCP endpoint returns 503 until this variable is set. Give the same token to your MCP client as a bearer token in the `Authorization` header. Do not put the token in the repository or a URL.

For Zeabur, keep `npm start` as the start command and use the app's public HTTPS address followed by `/mcp` as the MCP server URL. When the platform supplies `PORT`, the server binds to `0.0.0.0` automatically. The included JSON file is demo storage; use persistent storage before relying on saved title changes across redeployments.

The project has no user accounts or per-user authorization. Treat the MCP token as access to the entire shared journal, including sealed page content; do not distribute it to other users. The regular `/api/dream` endpoint remains a public demo endpoint and continues to mask sealed entry content.

