# Dream Journal Starter

A small, local-first reference project for an AI journal with public and sealed pages.

> **中文教程：** [从日记列表到“写或不写”的完整逻辑](docs/TUTORIAL.zh-CN.md)

This repository contains:

- a React journal interface;
- a dependency-free Node.js example API;
- JSON-backed local demo storage;
- a privacy boundary for sealed entries;
- an adapter-based example of an optional write-or-skip generation flow;
- tests for the most important visibility and pagination rules.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

The API stores local changes in `.data/dreams.json`. Delete that file to restore the seed entries on the next start.

## Production preview

```bash
npm run build
npm start
```

Open `http://127.0.0.1:4310`.

## What is intentionally not included

- production prompts;
- private relationship or memory context;
- provider credentials;
- deployment configuration;
- background scheduling;
- a production authentication system.

The example server binds to loopback for local use. Before adapting it for an internet-facing service, add account authentication, per-user authorization, rate limiting, validation, and a durable database.

See [the Chinese tutorial](docs/TUTORIAL.zh-CN.md), [API contract](docs/API.md), and [architecture notes](docs/ARCHITECTURE.md).

To connect an MCP client over HTTPS, see [the remote MCP setup](docs/MCP.md).

## License

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). You may use, modify, and distribute the project for permitted noncommercial purposes under those terms. Commercial use is not permitted by this license.

