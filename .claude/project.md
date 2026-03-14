# Project Spec

## Identity
name: openserver
alias: os
description: Runtime local aberto para Claude Code — document DB sobre filesystem + MCP + HTTP + auto-refresh

## Commands
build: cd template && bunx tsc --noEmit
test: bun run test/integration.ts
smoke: curl -sf http://localhost:3333/ > /dev/null && echo "OK"

## Hot files
- template/src/server.ts
- template/src/schema-engine.ts
- template/src/meta-tools/schemas.ts
- template/src/fs-db.ts
- template/src/query.ts

## Deploy
platform: npm (create-openserver)
verify: npx create-openserver /tmp/os-test && cd /tmp/os-test && bun run dev &

## Paths
learnings: LEARNINGS.md

## Conventions
branch-prefix: feat/
main-branch: master
worktree-dir: .claude/worktrees
ship-docs: full

## Current state (v0.2)

Framework layer shipped. O OpenServer agora é um document DB declarativo:
- `defineSchema()` com 7 field types, registry global, Zod generation
- Hierarquia (`parent: "mission"` → `data/<parent-slug>/<collection>/`)
- Query engine com filtros (equality, `in`, sort) sobre frontmatter
- Auto-MCP: 4 tools por collection (create, read, list, update)
- Auto-API: GET endpoints gerados por schema

### Gaps conhecidos (v0.2 → v0.3)
- Child schemas não ganham tools/routes automaticamente (precisa de parentSlug manual)
- `create_schema` não aceita `parent` no input
- Pluralização naive (`name + "s"`)
- Port 3333 hardcoded
- Sem `?expand=ref` no REST API
- Sem hierarchy-aware REST routes (`GET /api/missions/fl/modules`)

## Next milestone
Migrar o launchpad para rodar sobre OpenServer — provar o framework num app real.
Fases: schemas → parser → API routes → MCP tools.
