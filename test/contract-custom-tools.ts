/**
 * Contract test — create_tool via MCP, invoke the created tool, and verify
 * pre-registered tools (create_schema) still work in the same session.
 *
 * Flow:
 *   1. Start the template server via MCP stdio transport
 *   2. Verify pre-registered tools are present (create_schema)
 *   3. Call create_tool to create a tool with string and number params
 *   4. Wait for tools/list_changed notification
 *   5. Invoke the created tool with real arguments and verify output
 *   6. Verify no validation errors by passing correct typed inputs
 *   7. Clean up the generated tool file on exit
 *
 * Run with: bun run test/contract-custom-tools.ts
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
// Unique tool name to avoid collision with any pre-existing tool files
const TOOL_NAME = `greet_${Date.now()}`;

const toolFile = path.join(TEMPLATE_DIR, "src", "tools", `${TOOL_NAME}.ts`);

async function cleanup() {
  await rm(toolFile, { force: true });
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let toolListChangedCount = 0;

  const client = new Client({ name: "contract-test-custom-tools", version: "0.0.1" });

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
    // ── Step 1: Connect ────────────────────────────────────────────────────────
    await client.connect(transport);
    pass("Connected to MCP server via stdio");

    // Give startup IIFEs time to finish
    await Bun.sleep(500);

    // ── Step 2: Verify pre-registered tools ────────────────────────────────────
    const initialTools = await client.listTools();
    const initialToolNames = initialTools.tools.map((t) => t.name);
    assert(
      initialToolNames.includes("create_schema"),
      `create_schema should be registered at startup (tools: ${initialToolNames.join(", ")})`
    );
    assert(
      initialToolNames.includes("create_tool"),
      `create_tool should be registered at startup`
    );
    pass(
      `Pre-registered tools present (${initialTools.tools.length} total, create_schema and create_tool found)`
    );

    // Verify create_schema works (pre-registered tool smoke check)
    // We just call it with a unique name but clean it up right after
    const preCheckSchemaName = `precheck_${Date.now()}`;
    const preCheckResult = await client.callTool({
      name: "create_schema",
      arguments: {
        name: preCheckSchemaName,
        fields: { title: { type: "string", required: true } },
      },
    });
    const preCheckText = getTextContent(preCheckResult as { content: unknown[] });
    assert(
      preCheckText.includes(`create_${preCheckSchemaName}`) || preCheckText.includes(preCheckSchemaName),
      `create_schema should respond with the schema name: ${preCheckText}`
    );
    // Clean up precheck schema file
    await rm(
      path.join(TEMPLATE_DIR, "src", "schemas", `${preCheckSchemaName}.ts`),
      { force: true }
    );
    await rm(
      path.join(TEMPLATE_DIR, "data", `${preCheckSchemaName}s`),
      { recursive: true, force: true }
    );
    pass("Pre-registered create_schema tool works correctly");

    const countBeforeCreate = toolListChangedCount;

    // ── Step 3: Call create_tool ───────────────────────────────────────────────
    const createToolResult = await client.callTool({
      name: "create_tool",
      arguments: {
        name: TOOL_NAME,
        description: "Greet a user by name with an optional repeat count",
        inputSchema: {
          username: "string",
          repeat: "number",
        },
        handler: `return { content: [{ type: "text", text: "Hello, " + args.username + "! ".repeat(args.repeat ?? 1) }] };`,
      },
    });

    const createToolText = getTextContent(createToolResult as { content: unknown[] });
    assert(
      createToolText.includes(TOOL_NAME),
      `create_tool response should mention '${TOOL_NAME}': ${createToolText}`
    );
    pass(`create_tool created and registered '${TOOL_NAME}'`);

    // ── Step 4: Verify tools/list_changed notification ─────────────────────────
    await Bun.sleep(300);
    assert(
      toolListChangedCount > countBeforeCreate,
      `tools/list_changed notification should have been received after create_tool (got ${toolListChangedCount - countBeforeCreate} new notifications)`
    );
    pass(`tools/list_changed notification received (total: ${toolListChangedCount})`);

    // ── Step 5: Verify the new tool appears in listTools ──────────────────────
    const updatedTools = await client.listTools();
    const updatedToolNames = updatedTools.tools.map((t) => t.name);
    assert(
      updatedToolNames.includes(TOOL_NAME),
      `'${TOOL_NAME}' should appear in tool list after creation`
    );
    pass(`Tool list includes '${TOOL_NAME}' (${updatedTools.tools.length} total tools)`);

    // ── Step 6: Invoke the created tool with typed inputs ─────────────────────
    const invokeResult = await client.callTool({
      name: TOOL_NAME,
      arguments: {
        username: "Alice",
        repeat: 3,
      },
    });
    const invokeText = getTextContent(invokeResult as { content: unknown[] });
    assert(
      invokeText.includes("Alice"),
      `Tool output should include 'Alice': ${invokeText}`
    );
    assert(
      invokeText.includes("Hello,"),
      `Tool output should include greeting: ${invokeText}`
    );
    pass(`Invoked '${TOOL_NAME}' with string and number args — got: "${invokeText}"`);

    // ── Step 7: Invoke again with minimal args (only required string) ──────────
    const invokeResult2 = await client.callTool({
      name: TOOL_NAME,
      arguments: {
        username: "Bob",
        repeat: 1,
      },
    });
    const invokeText2 = getTextContent(invokeResult2 as { content: unknown[] });
    assert(
      invokeText2.includes("Bob"),
      `Second invocation output should include 'Bob': ${invokeText2}`
    );
    pass(`Second invocation of '${TOOL_NAME}' succeeded: "${invokeText2}"`);

    process.stdout.write("\n=== ALL CONTRACT-CUSTOM-TOOLS TESTS PASSED ===\n");
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
