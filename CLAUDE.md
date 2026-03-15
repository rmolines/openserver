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

### `import.meta.url` depth is different for meta-tools vs `server.ts` — depths must not be swapped
Meta-tools resolve `projectRoot` via `new URL("../..", import.meta.url).pathname` (two levels
up from `src/meta-tools/<name>.ts`). `server.ts` resolves it via `new URL("..", import.meta.url).pathname`
(one level up from `src/server.ts`). These depths were previously wrong (`../../..` for meta-tools)
and have been corrected. If a meta-tool is moved outside `src/meta-tools/` or `server.ts` is
moved outside `src/`, the resolved root silently shifts and all file I/O (tool writes, schema
writes, view writes) targets the wrong directory with no error.

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

### Child schemas (with `parent`) get no auto-registered MCP tools or API routes
`registerAllCollections` and `registerAllRoutes` call `resolveDataDir(schema)` with no
`parentSlug`. For any schema that has a `parent` field, this throws, and the schema is
silently skipped. The schema exists in `schemaRegistry` and `getAllSchemas()` returns
it, but zero CRUD tools and zero REST routes are ever created for it. There is no
fallback that registers parent-scoped tools (e.g. `create_<child>` scoped to a parent).
To expose child collections you must call `registerCollectionTools` / `registerCollectionRoutes`
manually with an explicit `parentSlug`.

### `create_schema` tool cannot create child schemas — `parent` is not in its input shape
The `SchemaDef` type has an optional `parent` field, but `schemas.ts`'s `create_schema`
tool only declares `name` and `fields` in its Zod input. There is no way to pass a
`parent` through the MCP interface. Even if a child schema were somehow registered
at runtime, the startup IIFE and `create_schema` both hardcode
`dataDir = data/<name>s/`, which is wrong for a child collection
(correct path: `data/<parentSlug>/<name>s/`).

### Startup IIFE matches schemas by filename, not by the name passed to `defineSchema`
`schemas.ts`'s startup IIFE derives the schema name from the `.ts` filename
(`file.replace(/\.ts$/, "")`) and then calls `getSchema(thatName)`. If the file is named
`task.ts` but internally calls `defineSchema({ name: "todo", ... })`, `getSchema("task")`
returns undefined, the IIFE logs "schema file imported but 'task' not found in registry —
skipping", and no CRUD tools are registered for `todo` at startup — even though `todo` is
correctly present in `schemaRegistry`. Convention: always name the file `<schemaName>.ts`
where `<schemaName>` is the exact string passed to `defineSchema`.

### Nested API routes must be matched before shorter patterns — order matters in `server.ts`
`server.ts` dispatches HTTP requests by testing URL patterns in sequence. The generic
3-segment pattern `/^\/api\/(\w+)\/(.+)$/` matches any path with two or more segments
after `/api/`, including nested child routes like `/api/parents/slug/children/slug`. If
this pattern is evaluated before the 4-segment child route pattern
`/^\/api\/(\w+)\/([^/]+)\/(\w+)\/([^/]+)$/`, it captures the nested path first and
routes it to the wrong handler — silently treating a child-item request as a
parent-item request with a composite slug. Always register more-specific (longer-segment)
patterns before less-specific ones. The correct order is: 4-segment child-item →
3-segment child-collection → 2-segment parent-item → 1-segment parent-collection.

### `schema-loader.ts` must load before `schemas.ts` — alphabetical glob order is load-bearing
`server.ts` globs `src/meta-tools/*.ts` and imports files in alphabetical order. `schema-loader.ts`
(s-c-h-e-m-a-hyphen) sorts before `schemas.ts` (s-c-h-e-m-a-s), so at startup the loader runs
first and populates the registry before `schemas.ts` tries to read it. This ordering is incidental,
not enforced. Renaming `schema-loader.ts` to any name that sorts after `schemas.ts` (e.g.
`zschema-loader.ts`) breaks startup silently: `schemas.ts` IIFE finds no schemas in the registry
and registers no tools, yet no error is thrown.

### `schemas.ts` IIFE re-registers tools already registered by `schema-loader.ts` — noisy but not fatal
At startup, `schema-loader.ts` runs `registerAllCollections`, which registers CRUD tools for every
schema. Then `schemas.ts`'s startup IIFE iterates schema files and calls `registerCollectionTools`
for each one again. The MCP SDK logs "Tool X is already registered" for every duplicate. These
warnings are noisy and can obscure real errors in startup logs, but they do not crash the server or
break tool behavior. The fix is to guard registration with a check (e.g. `getSchema(name)` already
registered) or skip the IIFE re-registration entirely when `schema-loader.ts` has already run.

### `create_schema` silently overwrites an existing schema and registers duplicate MCP tools
`defineSchema` calls `schemaRegistry.set(name, resolved)` unconditionally. Calling
`create_schema` a second time with the same schema name replaces the registry entry and
then calls `registerCollectionTools`, which calls `server.tool(createName, ...)` again.
The `@modelcontextprotocol/sdk` MCP server does not guard against duplicate tool names;
the second registration silently shadows the first and the tool list sent to clients may
contain duplicates or behave unpredictably. Always check `getSchema(name)` before calling
`create_schema`, and avoid calling `defineSchema` more than once for the same name.
