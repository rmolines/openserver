/**
 * Contract test — create_schema via MCP then exercise CRUD tools in the same session.
 *
 * Flow:
 *   1. Start the template server via MCP stdio transport
 *   2. Call create_schema with name "widget"
 *   3. Verify tools/list_changed notification was received (tool list grew)
 *   4. Call create_widget to insert a record
 *   5. Call read_widget to fetch it back
 *   6. Call list_widgets to list all
 *   7. Call update_widget to modify it
 *
 * Run with: bun run test/contract-schema-crud.ts
 */

import path from "path";
import { rm, mkdir } from "node:fs/promises";

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
// Unique schema name to avoid collision with any pre-existing schema files
const SCHEMA_NAME = `widget_${Date.now()}`;
const SCHEMA_PLURAL = `${SCHEMA_NAME}s`;
const TOOL_CREATE = `create_${SCHEMA_NAME}`;
const TOOL_READ = `read_${SCHEMA_NAME}`;
const TOOL_LIST = `list_${SCHEMA_PLURAL}`;
const TOOL_UPDATE = `update_${SCHEMA_NAME}`;

const schemaFile = path.join(TEMPLATE_DIR, "src", "schemas", `${SCHEMA_NAME}.ts`);
const dataDir = path.join(TEMPLATE_DIR, "data", SCHEMA_PLURAL);

async function cleanup() {
  // Remove generated schema file and data dir created by the test
  await rm(schemaFile, { force: true });
  await rm(dataDir, { recursive: true, force: true });
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Track tools/list_changed notifications
  let toolListChangedCount = 0;
  let lastToolListChangedTime = 0;

  // Set up the MCP client before connecting
  const client = new Client({ name: "contract-test-schema-crud", version: "0.0.1" });

  // Register notification handler before connect
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
    toolListChangedCount++;
    lastToolListChangedTime = Date.now();
    process.stderr.write(`[test] tools/list_changed notification #${toolListChangedCount}\n`);
  });

  const transport = new StdioClientTransport({
    command: "bun",
    args: ["run", "src/server.ts"],
    cwd: TEMPLATE_DIR,
    stderr: "pipe",
  });

  // Pipe server stderr to test stderr for visibility
  transport.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[server] ${chunk.toString()}`);
  });

  try {
    // ── Step 1: Connect ──────────────────────────────────────────────────────
    await client.connect(transport);
    pass("Connected to MCP server via stdio");

    // Give the startup IIFE in schemas.ts time to finish loading existing schemas
    await Bun.sleep(500);

    // ── Step 2: List initial tools ────────────────────────────────────────────
    const initialTools = await client.listTools();
    const initialToolNames = initialTools.tools.map((t) => t.name);
    assert(initialToolNames.includes("create_schema"), "create_schema should be registered at startup");
    pass(`Initial tools listed (${initialTools.tools.length} total, create_schema present)`);

    // Capture baseline count before creating schema
    const initialCount = toolListChangedCount;

    // ── Step 3: Call create_schema ────────────────────────────────────────────
    const createSchemaResult = await client.callTool({
      name: "create_schema",
      arguments: {
        name: SCHEMA_NAME,
        fields: {
          label: { type: "string", required: true },
          count: { type: "number", default: 0 },
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
    pass(`create_schema registered tools: ${TOOL_CREATE}, ${TOOL_READ}, ${TOOL_LIST}, ${TOOL_UPDATE}`);

    // ── Step 4: Verify tools/list_changed notification was received ───────────
    // The server calls sendToolListChanged() inside registerCollectionTools.
    // Wait briefly to let the async notification arrive.
    await Bun.sleep(200);
    assert(
      toolListChangedCount > initialCount,
      `tools/list_changed notification should have been received (got ${toolListChangedCount - initialCount} new notifications)`
    );
    pass(`tools/list_changed notification received (total: ${toolListChangedCount})`);

    // ── Step 5: Verify new tools appear in listTools ──────────────────────────
    const updatedTools = await client.listTools();
    const updatedToolNames = updatedTools.tools.map((t) => t.name);
    assert(updatedToolNames.includes(TOOL_CREATE), `${TOOL_CREATE} should be listed`);
    assert(updatedToolNames.includes(TOOL_READ), `${TOOL_READ} should be listed`);
    assert(updatedToolNames.includes(TOOL_LIST), `${TOOL_LIST} should be listed`);
    assert(updatedToolNames.includes(TOOL_UPDATE), `${TOOL_UPDATE} should be listed`);
    assert(
      updatedTools.tools.length > initialTools.tools.length,
      `tool count should have grown (was ${initialTools.tools.length}, now ${updatedTools.tools.length})`
    );
    pass(`Tool list grew from ${initialTools.tools.length} to ${updatedTools.tools.length} — all 4 CRUD tools present`);

    // ── Step 6: create_widget ─────────────────────────────────────────────────
    const createResult = await client.callTool({
      name: TOOL_CREATE,
      arguments: {
        slug: "w-001",
        fields: { label: "First Widget", count: 42, active: true },
      },
    });
    const createText = getTextContent(createResult as { content: unknown[] });
    assert(
      createText.includes("w-001"),
      `${TOOL_CREATE} response should confirm slug 'w-001': ${createText}`
    );
    pass(`${TOOL_CREATE} inserted record 'w-001'`);

    // ── Step 7: read_widget ───────────────────────────────────────────────────
    const readResult = await client.callTool({
      name: TOOL_READ,
      arguments: { slug: "w-001" },
    });
    const readText = getTextContent(readResult as { content: unknown[] });
    const readDoc = JSON.parse(readText) as { slug: string; fields: Record<string, unknown> };
    assert(readDoc.slug === "w-001", `read slug should be 'w-001', got: ${readDoc.slug}`);
    assert(readDoc.fields.label === "First Widget", `label should be 'First Widget', got: ${readDoc.fields.label}`);
    assert(readDoc.fields.count === 42, `count should be 42, got: ${readDoc.fields.count}`);
    pass(`${TOOL_READ} fetched back record with correct fields`);

    // ── Step 8: list_widgets ──────────────────────────────────────────────────
    const listResult = await client.callTool({
      name: TOOL_LIST,
      arguments: {},
    });
    const listText = getTextContent(listResult as { content: unknown[] });
    const listDocs = JSON.parse(listText) as Array<{ slug: string }>;
    assert(Array.isArray(listDocs), `${TOOL_LIST} should return an array`);
    assert(listDocs.length >= 1, `${TOOL_LIST} should return at least 1 record`);
    assert(
      listDocs.some((d) => d.slug === "w-001"),
      `${TOOL_LIST} should include 'w-001'`
    );
    pass(`${TOOL_LIST} returned ${listDocs.length} record(s) including 'w-001'`);

    // ── Step 9: update_widget ─────────────────────────────────────────────────
    const updateResult = await client.callTool({
      name: TOOL_UPDATE,
      arguments: {
        slug: "w-001",
        fields: { count: 99, active: false },
      },
    });
    const updateText = getTextContent(updateResult as { content: unknown[] });
    assert(
      updateText.includes("w-001"),
      `${TOOL_UPDATE} response should confirm slug 'w-001': ${updateText}`
    );
    pass(`${TOOL_UPDATE} sent update for 'w-001'`);

    // Verify update by reading again
    const readAfterUpdate = await client.callTool({
      name: TOOL_READ,
      arguments: { slug: "w-001" },
    });
    const readAfterText = getTextContent(readAfterUpdate as { content: unknown[] });
    const readAfterDoc = JSON.parse(readAfterText) as { slug: string; fields: Record<string, unknown> };
    assert(readAfterDoc.fields.count === 99, `count should be 99 after update, got: ${readAfterDoc.fields.count}`);
    assert(readAfterDoc.fields.active === false, `active should be false after update, got: ${readAfterDoc.fields.active}`);
    assert(readAfterDoc.fields.label === "First Widget", `label should be unchanged: ${readAfterDoc.fields.label}`);
    pass(`${TOOL_READ} confirmed update: count=99, active=false, label unchanged`);

    process.stdout.write("\n=== ALL CONTRACT-SCHEMA-CRUD TESTS PASSED ===\n");
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
