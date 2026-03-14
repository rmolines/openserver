# OpenServer — Agent Notes

## Pitfalls

### Port 3333 is hardcoded — `PORT` env var is ignored
`server.ts` hardcodes `Bun.serve({ port: 3333, ... })`. The `PORT` env var is never
read. The smoke test sets `PORT=3444` but the server always binds to 3333; the test
degrades to a warning instead of failing. Do not expect `PORT=XXXX bun run dev` to
change the listening port without editing `server.ts` directly.

### Auto-refresh WebSocket URL is also hardcoded to port 3333
`views.ts` injects `new WebSocket('ws://localhost:3333')` into every HTML view.
Changing the port in `server.ts` without updating this constant breaks live-reload
silently — the page loads but never refreshes on file change.

### `console.log` corrupts MCP stdio — use `process.stderr.write` exclusively
The MCP server communicates over stdio. Any `console.log` call writes to stdout and
interleaves with MCP protocol frames, causing the client to receive malformed JSON-RPC
messages. The failure is silent. All logging must use `process.stderr.write("[tag] message\n")`.

### Zod v4 requires `z.record(z.string(), z.any())` — not `z.record(z.any())`
Zod v4 changed the `z.record()` signature: the key type must be explicit. Calling
`z.record(z.any())` throws at runtime. Always use `z.record(z.string(), z.any())` for
open-ended key-value schemas.

### `create_tool` emits a plain JSON object as `inputSchema`, not a Zod shape
The code written to `src/tools/<name>.ts` exports `inputSchema` as a raw JSON object
(`export const inputSchema = { ... }`). But `server.tool()` expects a Zod shape
(a record of `ZodType` values). Passing a plain JSON object is silently accepted at
registration time, but any call that triggers input validation will fail or pass
unvalidated data. When writing tool files manually or via `create_tool`, always export
a proper Zod shape, not a JSON literal.

### Startup IIFE re-registers schemas/tools without notifying the MCP client
`schemas.ts` and `tools.ts` each run an async IIFE at startup that loads existing
files and calls `server.tool(...)` for each. Neither IIFE calls
`server.sendToolListChanged()` after re-registering. If the MCP client connects before
or during startup, it sees only the tools registered before the IIFE finishes; clients
that connected early will not auto-discover the reloaded tools until they explicitly
re-list them.

### `import.meta.url` depth assumes exact file location `src/meta-tools/*.ts`
Every meta-tool resolves `projectRoot` via `new URL("../../..", import.meta.url).pathname`.
This assumes the file lives exactly at `src/meta-tools/<name>.ts` (three levels up = project
root). Moving or symlinking a meta-tool file shifts the resolved root without any error,
causing all file I/O (tool writes, schema writes, view writes) to silently target the wrong
directory.

### `template/node_modules` is copied verbatim into every new project
`create-openserver.mjs` calls `fs.cpSync(templateDir, targetDir, { recursive: true })`,
which copies the entire `template/` directory including `node_modules`. Then `bun install`
runs again in the new project. The double-copy wastes disk space and time. There is no
`.gitignore` or exclusion list in the copy. If `node_modules` inside `template/` is
stale or corrupted, the new project inherits the problem before `bun install` can fix it.

### Auto-discovery requires `register(server)` export — missing export is silent
`server.ts` globs `src/meta-tools/*.ts` and calls `mod.register(server)` only if
`typeof mod.register === "function"`. A file without that export is logged as
"skipped" but causes no error. If a new meta-tool file is added without exporting
`register`, it will never be loaded and its tools will never appear — the only signal
is the stderr skip message at startup.
