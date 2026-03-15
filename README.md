# OpenServer

A Bun framework for building MCP servers. Connects to any MCP client — Claude Code,
Cursor, custom agents — and gives them a live local backend they can extend at runtime.

## What it does

One call spins up an MCP server (stdio + HTTP/SSE), a REST API, WebSocket live reload,
and a filesystem-backed database:

```ts
import { createServer, defineSchema } from "openserver";

const tasks = defineSchema({ name: "task", fields: { title: "string", done: "boolean" } });
const server = createServer({ schemas: [tasks] });
await server.start();
```

CRUD tools, REST routes, and HTML views are auto-generated from schemas. The agent can
also extend the server itself at runtime via meta-tools (`create_tool`, `create_view`,
`create_schema`).

**Who is this for:** developers who want an AI agent to build and operate a real local
backend without manual scaffolding.

## Prerequisites

Requires [Bun](https://bun.sh) v1.0+.

## Quickstart

Scaffold a full project with the CLI:

```bash
npx create-openserver my-app
cd my-app
bun run dev
```

Point any MCP client at the project and start describing what you want to build.

## Programmatic usage

Install the package:

```bash
bun add openserver
```

Create a `server.ts`:

```ts
import { createServer, defineSchema } from "openserver";

const tasks = defineSchema({
  name: "task",
  fields: { title: { type: "string", required: true }, done: { type: "boolean" } },
});

const server = createServer({ schemas: [tasks], transport: "http", port: 3000 });
await server.start();
```

Run it:

```bash
bun run server.ts
```

The server exposes MCP over HTTP at `http://localhost:3000/mcp`, REST routes under
`/api/tasks`, and a view at `/tasks`.

## Meta-tools

- **create_tool** — generates a new MCP tool with handler and input schema
- **create_view** — writes an HTML view served at `/<name>`
- **create_schema** — creates a Zod schema and registers CRUD tools for it
- **list_tools** — lists all registered tools and their current status

## Demo

<!-- TODO: demo GIF -->

## License

MIT
