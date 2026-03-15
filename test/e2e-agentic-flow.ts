/**
 * E2E Agentic Flow — capstone integration test.
 *
 * Exercises the complete agentic lifecycle in a single uninterrupted MCP session:
 *
 *   Phase 1 — SCHEMA
 *     1.  Connect to the template server via MCP stdio transport
 *     2.  Call create_schema with a unique timestamped name
 *     3.  Verify tools/list_changed was received and all 4 CRUD tools appear
 *     4.  create_<X> to insert a record, read_<X> to verify
 *     5.  HTTP POST /api/<collection> and GET /api/<collection>/<slug> to verify REST routes
 *
 *   Phase 2 — TOOL
 *     6.  Call create_tool with a unique name and typed inputs
 *     7.  Wait for tools/list_changed notification
 *     8.  Invoke the tool with real arguments and verify the response
 *
 *   Phase 3 — VIEW
 *     9.  Call create_view with a unique name and HTML content
 *     10. HTTP GET /<viewname> — assert status 200, correct content, WebSocket injection
 *
 *   Cleanup
 *     11. Remove schema .ts file, tool .ts file, view .html file, and data directory
 *
 * Run with: bun run test/e2e-agentic-flow.ts
 */

import path from "path";
import { rm } from "node:fs/promises";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function pass(msg: string) {
  process.stdout.write(`PASS: ${msg}\n`);
}

function fail(msg: string, err?: unknown) {
  process.stdout.write(`FAIL: ${msg}${err ? " — " + err : ""}\n`);
  process.exit(1);
}

function assert(condition: boolean, message: string) {
  if (!condition) fail(message);
}

function getTextContent(result: { content: unknown[] }): string {
  const first = result.content[0] as { type: string; text?: string };
  assert(first?.type === "text", "expected text content in tool result");
  return first.text ?? "";
}

// ─── setup / teardown ─────────────────────────────────────────────────────────

const TEMPLATE_DIR = path.resolve(import.meta.dir, "../template");
const TS = Date.now();

// Phase 1 — schema
const SCHEMA_NAME = `item_${TS}`;
const SCHEMA_PLURAL = `${SCHEMA_NAME}s`;
const TOOL_CREATE = `create_${SCHEMA_NAME}`;
const TOOL_READ = `read_${SCHEMA_NAME}`;
const TOOL_LIST = `list_${SCHEMA_PLURAL}`;
const TOOL_UPDATE = `update_${SCHEMA_NAME}`;
const BASE_URL = "http://localhost:3333";
const COLLECTION_URL = `${BASE_URL}/api/${SCHEMA_PLURAL}`;
const RECORD_SLUG = "e2e-001";

const schemaFile = path.join(TEMPLATE_DIR, "src", "schemas", `${SCHEMA_NAME}.ts`);
const dataDir = path.join(TEMPLATE_DIR, "data", SCHEMA_PLURAL);

// Phase 2 — tool
const TOOL_NAME = `echo_${TS}`;
const toolFile = path.join(TEMPLATE_DIR, "src", "tools", `${TOOL_NAME}.ts`);

// Phase 3 — view
const VIEW_NAME = `e2eview_${TS}`;
const viewFile = path.join(TEMPLATE_DIR, "src", "views", `${VIEW_NAME}.html`);

async function cleanup() {
  await rm(schemaFile, { force: true });
  await rm(dataDir, { recursive: true, force: true });
  await rm(toolFile, { force: true });
  await rm(viewFile, { force: true });
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let toolListChangedCount = 0;

  const client = new Client({ name: "e2e-agentic-flow", version: "0.0.1" });

  client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
    toolListChangedCount++;
    process.stderr.write(`[test] tools/list_changed notification #${toolListChangedCount}\n`);
  });

  const transport = new StdioClientTransport({
    command: "bun",
    args: ["run", "src/server.ts"],
    cwd: TEMPLATE_DIR,
    stderr: "pipe",
  });

  transport.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[server] ${chunk.toString()}`);
  });

  try {
    // ══════════════════════════════════════════════════════════════════════════
    // Step 1 — Connect
    // ══════════════════════════════════════════════════════════════════════════
    await client.connect(transport);
    pass("Connected to MCP server via stdio");

    // Give startup IIFEs (schemas.ts, schema-loader.ts) time to finish
    await Bun.sleep(500);

    // ── Verify baseline tools ─────────────────────────────────────────────────
    const initialTools = await client.listTools();
    const initialToolNames = initialTools.tools.map((t) => t.name);
    assert(
      initialToolNames.includes("create_schema"),
      `create_schema should be registered at startup (found: ${initialToolNames.join(", ")})`
    );
    assert(
      initialToolNames.includes("create_tool"),
      `create_tool should be registered at startup`
    );
    assert(
      initialToolNames.includes("create_view"),
      `create_view should be registered at startup`
    );
    pass(
      `Baseline tools verified (${initialTools.tools.length} total — create_schema, create_tool, create_view present)`
    );

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 1 — SCHEMA
    // ══════════════════════════════════════════════════════════════════════════

    process.stdout.write("\n--- Phase 1: SCHEMA ---\n");

    const countBeforeSchema = toolListChangedCount;

    // ── Step 2: create_schema ─────────────────────────────────────────────────
    const createSchemaResult = await client.callTool({
      name: "create_schema",
      arguments: {
        name: SCHEMA_NAME,
        fields: {
          label: { type: "string", required: true },
          score: { type: "number", default: 0 },
          active: { type: "boolean", default: true },
        },
      },
    });

    const createSchemaText = getTextContent(createSchemaResult as { content: unknown[] });
    assert(
      createSchemaText.includes(TOOL_CREATE),
      `create_schema response should mention ${TOOL_CREATE}: ${createSchemaText}`
    );
    assert(
      createSchemaText.includes(TOOL_READ),
      `create_schema response should mention ${TOOL_READ}`
    );
    assert(
      createSchemaText.includes(TOOL_LIST),
      `create_schema response should mention ${TOOL_LIST}`
    );
    assert(
      createSchemaText.includes(TOOL_UPDATE),
      `create_schema response should mention ${TOOL_UPDATE}`
    );
    pass(`create_schema registered CRUD tools for '${SCHEMA_NAME}'`);

    // ── Step 3: Verify tools/list_changed and new tool presence ──────────────
    await Bun.sleep(300);
    assert(
      toolListChangedCount > countBeforeSchema,
      `tools/list_changed should have fired after create_schema (total: ${toolListChangedCount})`
    );
    pass(`tools/list_changed received after create_schema (total: ${toolListChangedCount})`);

    const afterSchemaTools = await client.listTools();
    const afterSchemaToolNames = afterSchemaTools.tools.map((t) => t.name);
    assert(afterSchemaToolNames.includes(TOOL_CREATE), `${TOOL_CREATE} should appear in tool list`);
    assert(afterSchemaToolNames.includes(TOOL_READ), `${TOOL_READ} should appear in tool list`);
    assert(afterSchemaToolNames.includes(TOOL_LIST), `${TOOL_LIST} should appear in tool list`);
    assert(afterSchemaToolNames.includes(TOOL_UPDATE), `${TOOL_UPDATE} should appear in tool list`);
    assert(
      afterSchemaTools.tools.length > initialTools.tools.length,
      `tool count should have grown (was ${initialTools.tools.length}, now ${afterSchemaTools.tools.length})`
    );
    pass(
      `Tool list grew from ${initialTools.tools.length} to ${afterSchemaTools.tools.length} — all 4 CRUD tools present`
    );

    // ── Step 4a: create_<X> via MCP tool ─────────────────────────────────────
    const mcpCreateResult = await client.callTool({
      name: TOOL_CREATE,
      arguments: {
        slug: RECORD_SLUG,
        fields: { label: "E2E Record", score: 77, active: true },
      },
    });
    const mcpCreateText = getTextContent(mcpCreateResult as { content: unknown[] });
    assert(
      mcpCreateText.includes(RECORD_SLUG),
      `${TOOL_CREATE} response should confirm slug '${RECORD_SLUG}': ${mcpCreateText}`
    );
    pass(`${TOOL_CREATE} inserted record '${RECORD_SLUG}' via MCP`);

    // ── Step 4b: read_<X> via MCP tool ───────────────────────────────────────
    const mcpReadResult = await client.callTool({
      name: TOOL_READ,
      arguments: { slug: RECORD_SLUG },
    });
    const mcpReadText = getTextContent(mcpReadResult as { content: unknown[] });
    const mcpReadDoc = JSON.parse(mcpReadText) as { slug: string; fields: Record<string, unknown> };
    assert(mcpReadDoc.slug === RECORD_SLUG, `read slug should be '${RECORD_SLUG}', got: ${mcpReadDoc.slug}`);
    assert(
      mcpReadDoc.fields.label === "E2E Record",
      `label should be 'E2E Record', got: ${mcpReadDoc.fields.label}`
    );
    assert(mcpReadDoc.fields.score === 77, `score should be 77, got: ${mcpReadDoc.fields.score}`);
    pass(`${TOOL_READ} fetched record with correct fields (label, score)`);

    // ── Step 5a: HTTP POST /api/<collection> ──────────────────────────────────
    await Bun.sleep(200);
    const HTTP_SLUG = "e2e-rest-001";
    const postRes = await fetch(COLLECTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: HTTP_SLUG,
        fields: { label: "REST Record", score: 55, active: false },
      }),
    });
    assert(
      postRes.status === 201,
      `POST ${COLLECTION_URL} should return 201, got ${postRes.status}`
    );
    const postBody = (await postRes.json()) as { slug: string; fields: Record<string, unknown> };
    assert(postBody.slug === HTTP_SLUG, `POST response slug should be '${HTTP_SLUG}', got: ${postBody.slug}`);
    assert(
      postBody.fields.label === "REST Record",
      `POST response label should be 'REST Record', got: ${postBody.fields.label}`
    );
    pass(`POST ${COLLECTION_URL} created record '${HTTP_SLUG}' (status 201)`);

    // ── Step 5b: HTTP GET /api/<collection>/<slug> ────────────────────────────
    const getRes = await fetch(`${COLLECTION_URL}/${HTTP_SLUG}`);
    assert(
      getRes.status === 200,
      `GET ${COLLECTION_URL}/${HTTP_SLUG} should return 200, got ${getRes.status}`
    );
    const getBody = (await getRes.json()) as { slug: string; fields: Record<string, unknown> };
    assert(getBody.slug === HTTP_SLUG, `GET single slug should be '${HTTP_SLUG}', got: ${getBody.slug}`);
    assert(
      getBody.fields.score === 55,
      `GET single score should be 55, got: ${getBody.fields.score}`
    );
    assert(
      getBody.fields.active === false,
      `GET single active should be false, got: ${getBody.fields.active}`
    );
    pass(`GET ${COLLECTION_URL}/${HTTP_SLUG} returned correct record (score=55, active=false)`);

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 2 — TOOL
    // ══════════════════════════════════════════════════════════════════════════

    process.stdout.write("\n--- Phase 2: TOOL ---\n");

    const countBeforeTool = toolListChangedCount;

    // ── Step 6: create_tool ───────────────────────────────────────────────────
    const createToolResult = await client.callTool({
      name: "create_tool",
      arguments: {
        name: TOOL_NAME,
        description: "Echo a message back with an optional prefix",
        inputSchema: {
          message: "string",
          prefix: "string",
        },
        handler: `return { content: [{ type: "text", text: (args.prefix ? args.prefix + " " : "") + args.message }] };`,
      },
    });

    const createToolText = getTextContent(createToolResult as { content: unknown[] });
    assert(
      createToolText.includes(TOOL_NAME),
      `create_tool response should mention '${TOOL_NAME}': ${createToolText}`
    );
    pass(`create_tool created and registered '${TOOL_NAME}'`);

    // ── Step 7: Verify tools/list_changed notification ────────────────────────
    await Bun.sleep(300);
    assert(
      toolListChangedCount > countBeforeTool,
      `tools/list_changed should have fired after create_tool (got ${toolListChangedCount - countBeforeTool} new notifications)`
    );
    pass(`tools/list_changed received after create_tool (total: ${toolListChangedCount})`);

    const afterToolList = await client.listTools();
    const afterToolNames = afterToolList.tools.map((t) => t.name);
    assert(
      afterToolNames.includes(TOOL_NAME),
      `'${TOOL_NAME}' should appear in tool list after creation`
    );
    pass(`Tool list includes '${TOOL_NAME}' (${afterToolList.tools.length} total tools)`);

    // ── Step 8: Invoke the created tool ───────────────────────────────────────
    const invokeResult = await client.callTool({
      name: TOOL_NAME,
      arguments: {
        message: "Hello from E2E",
        prefix: "[e2e]",
      },
    });
    const invokeText = getTextContent(invokeResult as { content: unknown[] });
    assert(
      invokeText.includes("Hello from E2E"),
      `Tool output should include 'Hello from E2E': ${invokeText}`
    );
    assert(
      invokeText.includes("[e2e]"),
      `Tool output should include prefix '[e2e]': ${invokeText}`
    );
    pass(`Invoked '${TOOL_NAME}' with string args — got: "${invokeText}"`);

    // Invoke again with only the required arg (no prefix)
    const invokeResult2 = await client.callTool({
      name: TOOL_NAME,
      arguments: {
        message: "Second call",
        prefix: "",
      },
    });
    const invokeText2 = getTextContent(invokeResult2 as { content: unknown[] });
    assert(
      invokeText2.includes("Second call"),
      `Second invocation should include 'Second call': ${invokeText2}`
    );
    pass(`Second invocation of '${TOOL_NAME}' succeeded: "${invokeText2}"`);

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 3 — VIEW
    // ══════════════════════════════════════════════════════════════════════════

    process.stdout.write("\n--- Phase 3: VIEW ---\n");

    const viewHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>E2E Agentic Flow View</title></head>
<body>
  <h1>E2E View Loaded</h1>
  <p>Unique marker: e2e-agentic-${TS}</p>
</body>
</html>`;

    // ── Step 9: create_view ───────────────────────────────────────────────────
    const createViewResult = await client.callTool({
      name: "create_view",
      arguments: {
        name: VIEW_NAME,
        html: viewHtml,
      },
    });

    const createViewText = getTextContent(createViewResult as { content: unknown[] });
    assert(
      createViewText.includes(VIEW_NAME),
      `create_view response should mention '${VIEW_NAME}': ${createViewText}`
    );
    pass(`create_view created view '${VIEW_NAME}'`);

    // Give the file system a moment to settle
    await Bun.sleep(200);

    // ── Step 10a: HTTP GET /<viewname> — status 200 ───────────────────────────
    const viewRes = await fetch(`${BASE_URL}/${VIEW_NAME}`);
    assert(
      viewRes.status === 200,
      `GET /${VIEW_NAME} should return 200, got ${viewRes.status}`
    );
    pass(`GET /${VIEW_NAME} returned status 200`);

    // ── Step 10b: Content-Type ────────────────────────────────────────────────
    const contentType = viewRes.headers.get("Content-Type") ?? "";
    assert(
      contentType.includes("text/html"),
      `Content-Type should include text/html, got: ${contentType}`
    );
    pass(`Content-Type includes text/html: ${contentType}`);

    // ── Step 10c: Correct content ─────────────────────────────────────────────
    const viewBody = await viewRes.text();
    assert(
      viewBody.includes("<h1>E2E View Loaded</h1>"),
      `Body should contain original <h1>, got body of length ${viewBody.length}`
    );
    assert(
      viewBody.includes(`e2e-agentic-${TS}`),
      `Body should contain unique marker 'e2e-agentic-${TS}'`
    );
    pass(`Body contains correct original HTML content`);

    // ── Step 10d: WebSocket injection ─────────────────────────────────────────
    assert(
      viewBody.includes("WebSocket"),
      `Body should contain WebSocket auto-refresh script`
    );
    pass(`Body contains WebSocket auto-refresh script`);

    process.stdout.write("\n=== E2E AGENTIC FLOW — ALL PHASES PASSED ===\n");
  } catch (err) {
    process.stdout.write(`\nUnexpected error: ${err}\n`);
    process.exit(1);
  } finally {
    await client.close().catch(() => {});
    await cleanup();
    process.exit(0);
  }
}

main().catch((err) => {
  process.stdout.write(`\nFatal: ${err}\n`);
  process.exit(1);
});
