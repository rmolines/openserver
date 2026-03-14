# Handover

## v0.1.0 — Initial release — 2026-03-14

### What was done
OpenServer is a companion server for Claude Code that lets the agent build local applications from a user description. The agent uses 4 meta-tools (create_tool, create_view, create_schema, list_tools) to scaffold tools, views, and data schemas at runtime — no restart needed.

### Key decisions
- Bun as runtime (not Node) — native TS, built-in HTTP, built-in file watcher
- Markdown + frontmatter YAML as sole storage format — no SQLite, no JSON
- Auto-discovery pattern: server.ts globs src/meta-tools/*.ts and calls register(server)
- Dynamic tool registration via McpServer.tool() + sendToolListChanged()
- Scaffolder runs on Node.js (npx compatibility), generated project runs on Bun

### Pitfalls
- Port 3333 is hardcoded — conflicts with other local servers on the same port
- Zod v4 uses z.record(keySchema, valueSchema) — not z.record(valueSchema)
- McpServer API: use server.sendToolListChanged() not server.server.sendNotification()
- Dynamic import cache: re-importing same path may serve stale module

### Next steps
- Create demo GIF for README (R8)
- Add MCP-protocol-level test (current smoke test only checks HTTP)
- Make port configurable via env var
- Publish to npm as create-openserver
