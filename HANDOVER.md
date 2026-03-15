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

## v0.2.0 — Document DB Layer (Framework) — 2026-03-14

### What was done
OpenServer evolved from a flat CRUD toolkit into a document database framework. Apps can now declare typed schemas (including enums, arrays, refs, and hierarchical parent/child relationships) and get CRUD MCP tools plus read-only REST API endpoints generated automatically — no hand-written tool or route code. The launchpad's 7 schemas and 3-level hierarchy (mission/stage/module) can now be expressed declaratively using `defineSchema()` instead of ~800 lines of custom parser and route code.

### Key decisions
- Schema definitions use TypeScript (`defineSchema()`) — not JSON or YAML — for type safety and IDE support
- Queries are full-scan + in-memory filter (no index files); acceptable for filesystem scale (<1000 docs per collection)
- REST API is read-only (GET only); all mutations stay MCP-only — the agent writes, HTTP serves views
- Hierarchical collections map `parent: "mission"` to directory nesting: `data/<parent-slug>/<collection>/`
- Reference fields stored as slug strings in frontmatter; no foreign key enforcement
- `create_schema` meta-tool updated to call `defineSchema()` internally — v0.1 flat schemas continue to work unchanged

### Pitfalls discovered
- Zod v4 `z.enum()` requires a non-empty tuple literal (`[string, ...string[]]`), not a plain `string[]` — requires a type assertion when building the enum dynamically from a runtime array
- Route pattern matching for parameterized paths (`/api/<collection>/<slug>`) must be handled separately from exact-match routes; storing both `/api/tasks` and `/api/tasks/:slug` as Map keys and doing a regex fallback is the cleanest approach
- `server.sendToolListChanged()` must be called after dynamically registering tools, or MCP clients won't see the new tools — this applies to `registerAllCollections` at startup too
- When merging fields in `updateDocument`, the raw merged object (not the Zod-validated output) must be written back to preserve unknown frontmatter fields that the schema doesn't declare

### Key files changed
- `template/src/schema-engine.ts` (new) — `defineSchema()`, field type registry, Zod generation, schema registry
- `template/src/query.ts` (new) — `query()` with where/sort filters, `getDocument()`, hierarchy-aware `queryCollection()`
- `template/src/fs-db.ts` (rewritten) — CRUD using `ResolvedSchema`, `createInCollection()`, `updateInCollection()`
- `template/src/auto-mcp.ts` (new) — `registerCollectionTools()`, `registerAllCollections()`
- `template/src/auto-api.ts` (new) — `registerCollectionRoutes()`, `registerAllRoutes()`
- `template/src/server.ts` (extended) — wires auto-API routes and auto-MCP tool registration at startup
- `template/src/meta-tools/schemas.ts` (refactored) — delegates to schema-engine; removes duplicate Zod-building logic
- `test/integration.ts` (new) — validates all 7 launchpad schemas, CRUD, query filters, hierarchy, backward compat

### Next steps
- Migrate launchpad: Phase 1 — express 7 schemas with `defineSchema()`; Phase 2 — replace `src/schemas.ts` + `src/parser.ts`; Phase 3 — replace hand-written API routes with auto-API; Phase 4 — replace hand-written MCP tools with auto-generated ones
- Add hierarchy-aware REST routes (`GET /api/missions/fl/modules`) — currently only flat routes are generated
- Add `?expand=<ref-field>` support to REST API for resolving reference fields on read
- Make port configurable via env var (carried forward from v0.1)

## v0.2.1 — Child Schema Auto-Registration — 2026-03-14

### What was done
Child schemas with `parent` field now automatically get CRUD MCP tools and REST routes, just like root schemas. Previously they were silently skipped. The `create_schema` meta-tool now accepts an optional `parent` field, and the startup IIFE handles child schemas on boot.

### Key decisions
- Separate `registerChildCollectionTools` function (not modifying existing `registerCollectionTools`) — keeps root schema path unchanged
- Child MCP tools require `parent_slug` as mandatory parameter — dataDir computed at runtime
- REST API remains read-only for child schemas (same as root) — mutations via MCP only
- Two-pass registration: root schemas first, child schemas second — ensures parent schemas exist before children register

### Pitfalls discovered
- Route matching order matters: 4-segment nested slug routes must be checked before 3-segment nested list routes, both before existing 2-segment flat routes
- Child schema REST routes use `url.pathname.split("/")` to extract parent_slug — tightly coupled to path structure

### Next steps
- Prove framework with launchpad migration (parent predicate)
- Add hierarchy-aware views (HTML rendering data from child collections)
- Validate with 3-level hierarchy (mission/stage/module)

### Key files changed
- `template/src/auto-mcp.ts` — `registerChildCollectionTools`, two-pass `registerAllCollections`
- `template/src/auto-api.ts` — `registerChildCollectionRoutes`, two-pass `registerAllRoutes`
- `template/src/server.ts` — nested route matching
- `template/src/meta-tools/schemas.ts` — `parent` in create_schema, startup IIFE fix
- `test/integration.ts` — Parts 6+7 for child schema auto-registration

## v0.2.2 — Views + Collection Data — 2026-03-14

### What was done
Closed the predicate: uma view HTML servida pelo OpenServer consegue listar e exibir dados de uma collection hierárquica usando apenas a REST API auto-gerada — sem código custom de rotas ou CRUD. Created `project` and `task` schemas (with `task` as a child of `project`), seeded sample data, and built `dashboard.html` that fetches hierarchical data from the auto-generated REST API entirely client-side. Along the way, fixed an `import.meta.url` depth bug in `server.ts` and all meta-tools (paths were resolving to the wrong project root), and introduced `schema-loader.ts` to decouple startup timing for schema registration from the main server boot sequence.

### Key decisions
- Dashboard fetches `/api/projects`, then for each project fetches `/api/projects/:slug/tasks` — all from auto-generated routes, zero custom code
- `schema-loader.ts` handles schema import ordering at startup — prevents race between schema registration and route/tool wiring
- `import.meta.url` depth fix applied uniformly: `server.ts` (1 level) and meta-tools (2 levels) use the correct `../..` or `../../..` path relative to their actual file location

### Pitfalls discovered
- `import.meta.url` depth was off-by-one in `server.ts` and all meta-tools after a directory restructure — silently resolved project root to a parent directory, causing all file I/O to target the wrong path with no error thrown
- Schema registration at startup is order-sensitive: if `server.ts` wires routes before schemas finish loading, child routes are never registered — `schema-loader.ts` makes the dependency explicit

### Next steps
- Add write support to views (HTML forms → MCP tool call via fetch proxy endpoint)
- Prove 3-level hierarchy (mission/stage/module) end-to-end in a view
- Migrate launchpad to use auto-generated CRUD + REST, replacing hand-written parser and routes

### Key files changed
- `template/src/schema-loader.ts` (new) — explicit startup sequencing for schema registration
- `template/src/server.ts` — fixed `import.meta.url` depth; wires `schema-loader` before route/tool registration
- `template/src/meta-tools/create_tool.ts`, `create_view.ts`, `create_schema.ts`, `list_tools.ts` — fixed `import.meta.url` depth in all meta-tools
- `template/data/projects/` (new) — seed data for `project` collection
- `template/data/projects/*/tasks/` (new) — seed data for child `task` collection
- `template/views/dashboard.html` (new) — client-side view fetching hierarchical data from auto-generated REST API

## 1-package-npm — 2026-03-15

**PR:** #4 — feat: extract openserver as publishable npm lib package
**Commit:** 965bdb3

**What was done:** Closed the predicate: o package `openserver` é publicável como lib npm — outro projeto consegue instalar e importar seus módulos sem copiar código. The repo was restructured as a Bun monorepo: root `package.json` became the `openserver` lib, the scaffolder moved to `packages/create-openserver/`, core modules (schema-engine, auto-mcp, auto-api, fs-db, query, watcher) were extracted to `src/` at the root, a build pipeline (`bun build` + `tsc`) emits `dist/*.js` and `dist/*.d.ts`, and an integration test confirmed `import { defineSchema, schemaRegistry } from "openserver"` resolves types and runs correctly.

**Key decisions:**
- Root package becomes the lib (`openserver`) and scaffolder moves to `packages/create-openserver/` — cleanest split with Bun workspaces connecting the two
- Build uses `bun build --target=bun` for JS and `tsc --emitDeclarationOnly` for types — avoids fighting tsc's module emit on Bun-specific APIs
- Core modules are copied from `template/src/` to root `src/` (not moved) — template keeps its own copies so existing generated projects continue to work unchanged
- Template `package.json` updated to list `openserver` as a dependency — future scaffolded projects depend on the published package instead of bundling source

**Pitfalls discovered:**
- None beyond those already documented; D1–D4 all completed without regressions

**Next steps:**
- Publish `openserver` to npm registry (next fractal node)
- Update scaffolder to reference a pinned version once published (`"openserver": "^0.1.0"`) instead of `"latest"`
- Remove duplicated core modules from `template/src/` once the published package is stable and generated projects can depend on it
- Add `createServer()` convenience wrapper to the lib's public API (deferred from this cycle)

**Key files changed:**
- `package.json` (rewritten — now `openserver` lib with exports map and build scripts)
- `tsconfig.json` (new — lib tsconfig for declaration emit)
- `src/index.ts` (new — public API entry point re-exporting all core modules)
- `src/schema-engine.ts`, `src/auto-mcp.ts`, `src/auto-api.ts`, `src/fs-db.ts`, `src/query.ts`, `src/watcher.ts` (new — core modules at lib root)
- `packages/create-openserver/package.json` (new — scaffolder package)
- `packages/create-openserver/bin/create-openserver.mjs` (moved from `bin/`)
- `packages/create-openserver/template/` (moved from root `template/`)

## 2-create-server — 2026-03-15

**What:** Closed the predicate: `createServer({ schemas, dataDir })` agora substitui o `server.ts` do template — qualquer consumidor da lib pode inicializar MCP+HTTP+WebSocket com schemas declarativos e dataDir configurável sem copiar código de orquestração.

**Key decisions:**
- `createServer` retorna um `ServerHandle` com `start()` assíncrono — separação clara entre configuração e inicialização
- `dataDir` configurável via `setDataDirPrefix()` no `schema-engine.ts` — prefixo global mutável, sem refatorar assinaturas de função em cascata
- Meta-tool auto-discovery excluído da lib — é responsabilidade do consumidor registrar meta-tools antes de chamar `start()`; a lib fornece apenas orquestração de schemas
- Template `server.ts` migrado de 136 linhas de orquestração manual para ~10 linhas: import side-effect de schemas + `createServer(getAllSchemas())` + `server.start()`
- Rota matching order preservada (4-segment nested → 3-segment nested list → 2-segment slug → 1-segment collection) — mesmo comportamento do template original

**Pitfalls:**
- Nenhum novo além dos já documentados; D1–D3 completados sem regressões

**Next steps:**
- 3-custom-tools: API para registrar ferramentas customizadas via `createServer` (irmão pendente no fractal)
- 4-fractal-consumidor: provar consumo end-to-end por outro projeto usando o package publicado
- Publicar `openserver` no npm registry com versão pinada no template
- Remover cópias duplicadas dos módulos core em `template/src/` após estabilização da lib

**Key files:**
- `src/create-server.ts` (new — factory principal)
- `src/schema-engine.ts` — `setDataDirPrefix`, `getDataDirPrefix` adicionados
- `src/index.ts` — exports de `createServer`, `CreateServerOptions`, `ServerHandle`
- `packages/create-openserver/template/src/server.ts` — migrado para usar `createServer`
- `test/import-test.ts` (new — integration test for external import)

## 2026-03-15 — HTTP Streamable Transport (1-transport-sse)

**Problem:** OpenServer only supported stdio MCP transport, preventing standalone server use. Claude Code and external plugins couldn't connect without embedding the lib.

**What was done:**
- Added `transport?: "stdio" | "http"` to `CreateServerOptions` (default: stdio for backward compat)
- Mounted `WebStandardStreamableHTTPServerTransport` at `/mcp` endpoint inside existing Bun.serve()
- Contract test: 3 cases verifying listTools, create, list over HTTP

**Key decisions:**
- Used `WebStandardStreamableHTTPServerTransport` (Web Standard Request/Response) instead of deprecated SSEServerTransport or Node.js StreamableHTTPServerTransport — natural fit for Bun
- Stateful mode with `sessionIdGenerator` — supports session management
- Single transport instance per server — no per-request transport creation

**Pitfalls:**
- `WebStandardStreamableHTTPServerTransport` rejects second `initialize` from same session — clients must share one connection
- `/mcp` route must be matched BEFORE other routes in Bun.serve fetch handler

**Key files:**
- `src/create-server.ts` — transport branching + /mcp route
- `test/transport-http.test.ts` — contract test

**Next steps:**
- Sibling predicates: bin executável (2-bin-executavel), integração Claude Code (3-integracao-claude-code)
