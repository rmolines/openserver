# OpenServer

The open local server for Claude Code — describe what you need, your agent builds it.

## Quickstart

```bash
npx create-openserver my-app
cd my-app
bun run dev
```

Open Claude Code in the project and describe what you want to build.

## What it does

OpenServer is a pre-wired local server that combines an MCP server (stdio), an HTTP
server, WebSocket for live reload, and a filesystem-backed database — all in a single
`src/server.ts` you can read and modify. Your Claude Code agent connects via MCP and
can scaffold new tools, routes, and schemas on the fly without leaving the editor.

## Meta-tools

- **create_tool** — generates a new MCP tool with handler and input schema
- **create_view** — writes an HTML view served at `/<name>`
- **create_schema** — creates a Zod schema and registers CRUD tools for it
- **list_tools** — lists all registered tools and their current status

## Demo

<!-- TODO: demo GIF -->

## License

MIT
