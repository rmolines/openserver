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

## API reference

### `createServer(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `schemas` | `ResolvedSchema[]` | required | Schemas returned by `defineSchema` |
| `transport` | `"stdio" \| "http"` | `"stdio"` | MCP transport mode |
| `port` | `number` | `3333` | HTTP port (http transport only) |
| `dataDir` | `string` | `"data"` | Filesystem path for stored records |
| `viewsDir` | `string` | `"src/views"` | Directory for HTML view files |
| `name` | `string` | `"openserver"` | MCP server name |
| `version` | `string` | `"1.0.0"` | MCP server version |
| `tools` | `CustomToolDef[]` | `[]` | Additional custom tools |

Returns `{ start(): Promise<void> }`.

### `defineSchema({ name, fields })`

| Property | Type | Description |
|---|---|---|
| `name` | `string` | Collection name (also used as filename convention) |
| `fields` | `Record<string, FieldDef>` | Field definitions |

Auto-generates for each schema:
- MCP tools: `create_<name>`, `read_<name>`, `list_<name>s`, `update_<name>`
- REST routes: `GET/POST /api/<name>s`, `GET/PUT/DELETE /api/<name>s/:slug`
- HTML view: `/<name>s`

### Field types (`FieldDef`)

| Type | Extra properties | Notes |
|---|---|---|
| `string` | `required?`, `default?` | |
| `number` | `required?`, `default?` | |
| `boolean` | `required?`, `default?` | |
| `date` | `required?` | Stored as ISO date string (`YYYY-MM-DD`) |
| `enum` | `values: string[]`, `required?`, `default?` | |
| `array` | `required?`, `default?` | Array of strings |
| `ref` | `collection: string`, `required?` | Stored as slug string |

Shorthand: a bare string (`"string"`, `"boolean"`, etc.) is also accepted as a field value.

### `CustomToolDef`

```ts
interface CustomToolDef {
  name: string;
  description?: string;
  inputSchema: Record<string, ZodType>; // Zod shape (not a JSON object)
  handler: (args: any) => Promise<any>;
}
```

## When to use what

| Choice | Use when | Example |
|---|---|---|
| Transport: `stdio` | The MCP client spawns the server as a child process. Zero config, auto-connects. | Claude Code local project via `mcpServers` config |
| Transport: `http` | The server runs as a standalone daemon; clients connect remotely. Needed for multi-client or remote access. | Deployed service, multiple agents hitting one backend |
| CLI scaffold (`npx create-openserver`) | Starting a new standalone project. Gets file structure, dev server, and meta-tools ready immediately. | `npx create-openserver my-app` |
| Programmatic (`bun add openserver`) | Embedding openserver into an existing project. Define schemas and call `createServer` in your own code. | Adding MCP + REST to an existing Bun app |

## Meta-tools

- **create_tool** — generates a new MCP tool with handler and input schema
- **create_view** — writes an HTML view served at `/<name>`
- **create_schema** — creates a Zod schema and registers CRUD tools for it
- **list_tools** — lists all registered tools and their current status

## Demo

<!-- TODO: demo GIF -->

## License

MIT
