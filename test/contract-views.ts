/**
 * Contract test — create_view via MCP then verify HTTP serving.
 *
 * Flow:
 *   1. Start the template server via MCP stdio transport
 *   2. Call create_view with a unique timestamped name and HTML content
 *   3. Make an HTTP GET to http://localhost:3333/<viewname> and assert:
 *      - Status 200
 *      - Content-Type includes text/html
 *      - Body contains the original HTML content
 *      - Body contains WebSocket auto-refresh script
 *   4. Create a second view and verify it's accessible at its own URL
 *   5. Clean up generated view files on exit
 *
 * Run with: bun run test/contract-views.ts
 */

import path from "path";
import { rm } from "node:fs/promises";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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
const VIEW1_NAME = `testview_${TS}_1`;
const VIEW2_NAME = `testview_${TS}_2`;
const VIEWS_DIR = path.join(TEMPLATE_DIR, "src", "views");

const view1File = path.join(VIEWS_DIR, `${VIEW1_NAME}.html`);
const view2File = path.join(VIEWS_DIR, `${VIEW2_NAME}.html`);

async function cleanup() {
  await rm(view1File, { force: true });
  await rm(view2File, { force: true });
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = new Client({ name: "contract-test-views", version: "0.0.1" });

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

    // ── Step 2: Verify create_view is registered ───────────────────────────────
    const initialTools = await client.listTools();
    const initialToolNames = initialTools.tools.map((t) => t.name);
    assert(
      initialToolNames.includes("create_view"),
      `create_view should be registered at startup (tools: ${initialToolNames.join(", ")})`
    );
    pass(`create_view tool is registered (${initialTools.tools.length} total tools)`);

    // ── Step 3: Create first view ──────────────────────────────────────────────
    const view1Html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Test View 1</title></head>
<body>
  <h1>Hello World</h1>
  <p>This is test view one.</p>
</body>
</html>`;

    const createView1Result = await client.callTool({
      name: "create_view",
      arguments: {
        name: VIEW1_NAME,
        html: view1Html,
      },
    });

    const createView1Text = getTextContent(createView1Result as { content: unknown[] });
    assert(
      createView1Text.includes(VIEW1_NAME),
      `create_view response should mention '${VIEW1_NAME}': ${createView1Text}`
    );
    pass(`create_view created view '${VIEW1_NAME}'`);

    // Give the file system a moment to settle
    await Bun.sleep(200);

    // ── Step 4: HTTP GET view1 ─────────────────────────────────────────────────
    const resp1 = await fetch(`http://localhost:3333/${VIEW1_NAME}`);
    assert(resp1.status === 200, `GET /${VIEW1_NAME} should return 200, got ${resp1.status}`);
    pass(`GET /${VIEW1_NAME} returned status 200`);

    const contentType1 = resp1.headers.get("Content-Type") ?? "";
    assert(
      contentType1.includes("text/html"),
      `Content-Type should include text/html, got: ${contentType1}`
    );
    pass(`Content-Type includes text/html: ${contentType1}`);

    const body1 = await resp1.text();
    assert(
      body1.includes("<h1>Hello World</h1>"),
      `Body should contain '<h1>Hello World</h1>', got body of length ${body1.length}`
    );
    pass(`Body contains original HTML content (<h1>Hello World</h1>)`);

    assert(
      body1.includes("WebSocket"),
      `Body should contain WebSocket auto-refresh script, got body of length ${body1.length}`
    );
    pass(`Body contains WebSocket auto-refresh script`);

    // ── Step 5: Create second view ─────────────────────────────────────────────
    const view2Html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Test View 2</title></head>
<body>
  <h1>Second View</h1>
  <p>This is test view two.</p>
</body>
</html>`;

    const createView2Result = await client.callTool({
      name: "create_view",
      arguments: {
        name: VIEW2_NAME,
        html: view2Html,
      },
    });

    const createView2Text = getTextContent(createView2Result as { content: unknown[] });
    assert(
      createView2Text.includes(VIEW2_NAME),
      `create_view response should mention '${VIEW2_NAME}': ${createView2Text}`
    );
    pass(`create_view created view '${VIEW2_NAME}'`);

    await Bun.sleep(200);

    // ── Step 6: HTTP GET view2 ─────────────────────────────────────────────────
    const resp2 = await fetch(`http://localhost:3333/${VIEW2_NAME}`);
    assert(resp2.status === 200, `GET /${VIEW2_NAME} should return 200, got ${resp2.status}`);
    pass(`GET /${VIEW2_NAME} returned status 200`);

    const contentType2 = resp2.headers.get("Content-Type") ?? "";
    assert(
      contentType2.includes("text/html"),
      `Content-Type for view2 should include text/html, got: ${contentType2}`
    );
    pass(`View2 Content-Type includes text/html`);

    const body2 = await resp2.text();
    assert(
      body2.includes("<h1>Second View</h1>"),
      `View2 body should contain '<h1>Second View</h1>', got body of length ${body2.length}`
    );
    pass(`View2 body contains original HTML content (<h1>Second View</h1>)`);

    assert(
      body2.includes("WebSocket"),
      `View2 body should contain WebSocket auto-refresh script`
    );
    pass(`View2 body contains WebSocket auto-refresh script`);

    // ── Step 7: Verify view1 still accessible (no collision with view2) ────────
    const resp1Again = await fetch(`http://localhost:3333/${VIEW1_NAME}`);
    assert(resp1Again.status === 200, `GET /${VIEW1_NAME} still returns 200 after view2 created`);
    const body1Again = await resp1Again.text();
    assert(
      body1Again.includes("<h1>Hello World</h1>"),
      `View1 still contains its original content after view2 created`
    );
    pass(`View1 still accessible and correct after view2 created`);

    // ── Step 8: Non-existent view returns 404 ─────────────────────────────────
    const respMissing = await fetch(`http://localhost:3333/nonexistent_view_${TS}`);
    assert(respMissing.status === 404, `GET for non-existent view should return 404, got ${respMissing.status}`);
    pass(`Non-existent view returns 404`);

    process.stdout.write("\n=== ALL CONTRACT-VIEWS TESTS PASSED ===\n");
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
