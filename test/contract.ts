/**
 * Contract test — verifies the full API surface openserver exports
 * for the fractal consumer use case.
 *
 * Run with: bun run test/contract.ts
 *
 * Prints PASS/FAIL for each assertion. Exits with code 1 on failure.
 */

import path from "path";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";

import {
  defineSchema,
  createServer,
  schemaRegistry,
} from "../src/index.js";

import type { CustomToolDef } from "../src/create-server.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

const TEST_PORT = 4444;
const TEST_DATA_DIR = path.resolve(import.meta.dir, "../test-data-contract");
const TEST_VIEWS_DIR = path.resolve(import.meta.dir, "../test-views-contract");

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

// ─── Setup ────────────────────────────────────────────────────────────────────

async function setup() {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
  await rm(TEST_VIEWS_DIR, { recursive: true, force: true });
  await mkdir(TEST_DATA_DIR, { recursive: true });
  await mkdir(TEST_VIEWS_DIR, { recursive: true });

  // Create a minimal HTML view file
  await writeFile(
    path.join(TEST_VIEWS_DIR, "hello.html"),
    "<!DOCTYPE html><html><body><h1>Hello</h1></body></html>",
    "utf-8"
  );
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
  await rm(TEST_VIEWS_DIR, { recursive: true, force: true });
}

// ─── Part 1 — Schema and CustomToolDef types ───────────────────────────────────

function part1_exports() {
  // Clear global registry to avoid interference with other tests
  schemaRegistry.clear();

  // defineSchema must be callable and return a ResolvedSchema
  const predicateSchema = defineSchema({
    name: "predicate",
    fields: {
      predicate: "string",
      status: "string",
    },
  });

  assert(predicateSchema !== undefined, "defineSchema should return a ResolvedSchema");
  assert(predicateSchema.name === "predicate", "schema name should be 'predicate'");
  assert(schemaRegistry.has("predicate"), "predicate schema should be in registry");

  pass("defineSchema returns ResolvedSchema and populates registry");

  // CustomToolDef shape is correct
  const treeTool: CustomToolDef = {
    name: "tree_traverse",
    description: "Traverse a tree structure",
    inputSchema: {
      root: z.string(),
      depth: z.number().optional(),
    },
    handler: async ({ root }: { root: string }) => {
      return { content: [{ type: "text" as const, text: `traversed from ${root}` }] };
    },
  };

  assert(typeof treeTool.name === "string", "CustomToolDef.name should be string");
  assert(typeof treeTool.handler === "function", "CustomToolDef.handler should be function");
  assert(treeTool.inputSchema.root !== undefined, "inputSchema.root should be a Zod type");

  pass("CustomToolDef type contract satisfied");

  return { predicateSchema, treeTool };
}

// ─── Part 2 — createServer returns ServerHandle ────────────────────────────────

function part2_createServer(
  predicateSchema: ReturnType<typeof defineSchema>,
  treeTool: CustomToolDef
) {
  const server = createServer({
    schemas: [predicateSchema],
    dataDir: TEST_DATA_DIR,
    tools: [treeTool],
    port: TEST_PORT,
    name: "contract-test-server",
    version: "0.0.1",
    viewsDir: TEST_VIEWS_DIR,
  });

  assert(server !== undefined, "createServer should return a ServerHandle");
  assert(typeof server.start === "function", "ServerHandle should have a start() method");

  pass("createServer returns ServerHandle with start()");
  return server;
}

// ─── Part 3 — HTTP API responds ────────────────────────────────────────────────

async function part3_httpApi() {
  // Wait for the server to be ready by polling
  const baseUrl = `http://localhost:${TEST_PORT}`;
  const maxAttempts = 20;
  let ready = false;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // not ready yet
    }
    await Bun.sleep(100);
  }

  assert(ready, "server should be reachable after start()");
  pass("HTTP server is reachable");

  // GET /api/predicates — should return JSON with data array
  const listRes = await fetch(`${baseUrl}/api/predicates`);
  assert(listRes.ok, `GET /api/predicates should return 2xx, got ${listRes.status}`);

  const listBody = await listRes.json() as { data: unknown[]; count: number };
  assert(Array.isArray(listBody.data), "/api/predicates should return { data: [] }");
  assert(typeof listBody.count === "number", "/api/predicates should return { count: number }");

  pass("GET /api/predicates returns { data, count }");

  // GET /hello — view should be served with WS auto-refresh injected
  const viewRes = await fetch(`${baseUrl}/hello`);
  assert(viewRes.ok, `GET /hello should return 2xx, got ${viewRes.status}`);

  const viewHtml = await viewRes.text();
  assert(viewHtml.includes("<h1>Hello</h1>"), "view should contain original HTML content");
  assert(
    viewHtml.includes(`ws://localhost:${TEST_PORT}`),
    `view should contain WebSocket URL with port ${TEST_PORT}`
  );
  assert(
    !viewHtml.includes("ws://localhost:3333"),
    "view should NOT contain hardcoded port 3333"
  );

  pass(`GET /hello serves view with WebSocket URL ws://localhost:${TEST_PORT}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await setup();

  try {
    // Part 1 — types/exports (synchronous)
    const { predicateSchema, treeTool } = part1_exports();

    // Part 2 — createServer (synchronous)
    const server = part2_createServer(predicateSchema, treeTool);

    // Part 3 — start server and test HTTP (async)
    // Note: start() connects MCP to stdio and starts HTTP. We don't await it fully
    // because it keeps running, but HTTP should be up quickly.
    const startPromise = server.start().catch((err) => {
      // Non-fatal: stdio transport may fail in test context
      process.stderr.write(`[contract-test] start() error (may be expected in test): ${err}\n`);
    });

    await part3_httpApi();

    process.stdout.write("\n=== ALL CONTRACT TESTS PASSED ===\n");
  } finally {
    await cleanup();
    process.exit(0);
  }
}

main().catch((err) => {
  process.stdout.write(`\nUnexpected error: ${err}\n`);
  process.exit(1);
});
