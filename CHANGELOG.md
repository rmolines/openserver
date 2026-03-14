# Changelog

## OpenServer v0.1.0 — Initial release — 2026-03-14
**Type:** feat
**PRD:** ~/.claude/initiatives/fl/initiatives-standalone/prd.md
**Commits:**
```
318cbbd chore(openserver): simplify — fix incorrect names, ports, and formats
e2e55b4 test(openserver): D7 — E2E smoke test
209bda8 feat(openserver): D6 — Scaffolder + README
121d932 feat(openserver): D5 — Plugin + build-app skill
1068b4d feat(openserver): D4 — File watcher + WebSocket auto-refresh
f24eb36 feat(openserver): D3 — create_schema + filesystem DB
9253c94 feat(openserver): D2 — create_tool + list_tools + create_view + hot reload
4eaef59 feat(openserver): D1 — Runtime template with auto-discovery
```

### What's included
- MCP server + HTTP + WebSocket runtime on Bun
- 4 meta-tools: create_tool, create_view, create_schema, list_tools
- Filesystem DB with markdown + frontmatter + Zod validation
- File watcher with 500ms debounce + WebSocket auto-refresh
- Claude Code plugin with /build-app skill
- npx create-openserver scaffolder
- E2E smoke test
