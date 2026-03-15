/**
 * Contract test — create_schema via MCP then exercise REST HTTP routes in the same session.
 *
 * Flow:
 *   1. Start the template server via MCP stdio transport
 *   2. Call create_schema with a unique timestamped name
 *   3. POST  /api/<collection>       — create a record
 *   4. GET   /api/<collection>       — list records (assert record is present)
 *   5. GET   /api/<collection>/<slug> — read single record
 *   6. PUT   /api/<collection>/<slug> — update record
 *   7. GET   /api/<collection>/<slug> — verify update
 *
 * Run with: bun run test/contract-schema-rest.ts
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

// ─── setup / teardown ─────────────────────────────────────────────────────────

const TEMPLATE_DIR = path.resolve(import.meta.dir, "../template");
const SCHEMA_NAME = `rest_${Date.now()}`;
const SCHEMA_PLURAL = `${SCHEMA_NAME}s`;
const BASE_URL = "http://localhost:3333";
const COLLECTION_URL = `${BASE_URL}/api/${SCHEMA_PLURAL}`;
const SLUG = "r-001";

const schemaFile = path.join(TEMPLATE_DIR, "src", "schemas", `${SCHEMA_NAME}.ts`);
const dataDir = path.join(TEMPLATE_DIR, "data", SCHEMA_PLURAL);

async function cleanup() {
  await rm(schemaFile, { force: true });
  await rm(dataDir, { recursive: true, force: true });
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = new Client({ name: "contract-test-schema-rest", version: "0.0.1" });

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

    // ── Step 2: Call create_schema ────────────────────────────────────────────
    const createSchemaResult = await client.callTool({
      name: "create_schema",
      arguments: {
        name: SCHEMA_NAME,
        fields: {
          title: { type: "string", required: true },
          score: { type: "number", default: 0 },
          active: { type: "boolean", default: true },
        },
      },
    });

    const createSchemaText = (
      (createSchemaResult as { content: Array<{ type: string; text?: string }> }).content[0]
    )?.text ?? "";
    assert(
      createSchemaText.includes(`create_${SCHEMA_NAME}`),
      `create_schema response should mention create_${SCHEMA_NAME}: ${createSchemaText}`
    );
    pass(`create_schema created schema '${SCHEMA_NAME}'`);

    // Give the server a moment to register the routes
    await Bun.sleep(300);

    // ── Step 3: POST /api/<collection> — create a record ─────────────────────
    const postRes = await fetch(COLLECTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: SLUG,
        fields: { title: "First Rest Record", score: 42, active: true },
      }),
    });

    assert(
      postRes.status === 201,
      `POST ${COLLECTION_URL} should return 201, got ${postRes.status}`
    );
    const postBody = await postRes.json() as { slug: string; fields: Record<string, unknown> };
    assert(postBody.slug === SLUG, `POST response slug should be '${SLUG}', got: ${postBody.slug}`);
    assert(
      postBody.fields.title === "First Rest Record",
      `POST response title should be 'First Rest Record', got: ${postBody.fields.title}`
    );
    pass(`POST ${COLLECTION_URL} created record '${SLUG}' (status 201)`);

    // ── Step 4: GET /api/<collection> — list ──────────────────────────────────
    const listRes = await fetch(COLLECTION_URL);
    assert(
      listRes.status === 200,
      `GET ${COLLECTION_URL} should return 200, got ${listRes.status}`
    );
    const listBody = await listRes.json() as { data: Array<{ slug: string }>; count: number };
    assert(Array.isArray(listBody.data), "GET list response should have a data array");
    assert(listBody.count >= 1, `GET list count should be >= 1, got ${listBody.count}`);
    assert(
      listBody.data.some((d) => d.slug === SLUG),
      `GET list should include slug '${SLUG}'`
    );
    pass(`GET ${COLLECTION_URL} returned ${listBody.count} record(s) including '${SLUG}'`);

    // ── Step 5: GET /api/<collection>/:slug — read single record ──────────────
    const getRes = await fetch(`${COLLECTION_URL}/${SLUG}`);
    assert(
      getRes.status === 200,
      `GET ${COLLECTION_URL}/${SLUG} should return 200, got ${getRes.status}`
    );
    const getBody = await getRes.json() as { slug: string; fields: Record<string, unknown> };
    assert(getBody.slug === SLUG, `GET single slug should be '${SLUG}', got: ${getBody.slug}`);
    assert(
      getBody.fields.title === "First Rest Record",
      `GET single title should be 'First Rest Record', got: ${getBody.fields.title}`
    );
    assert(
      getBody.fields.score === 42,
      `GET single score should be 42, got: ${getBody.fields.score}`
    );
    pass(`GET ${COLLECTION_URL}/${SLUG} returned correct record`);

    // ── Step 6: PUT /api/<collection>/:slug — update record ───────────────────
    const putRes = await fetch(`${COLLECTION_URL}/${SLUG}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: { score: 99, active: false },
      }),
    });
    assert(
      putRes.status === 200,
      `PUT ${COLLECTION_URL}/${SLUG} should return 200, got ${putRes.status}`
    );
    const putBody = await putRes.json() as { slug: string; fields: Record<string, unknown> };
    assert(putBody.slug === SLUG, `PUT response slug should be '${SLUG}', got: ${putBody.slug}`);
    assert(
      putBody.fields.score === 99,
      `PUT response score should be 99, got: ${putBody.fields.score}`
    );
    assert(
      putBody.fields.active === false,
      `PUT response active should be false, got: ${putBody.fields.active}`
    );
    assert(
      putBody.fields.title === "First Rest Record",
      `PUT response title should be unchanged: ${putBody.fields.title}`
    );
    pass(`PUT ${COLLECTION_URL}/${SLUG} updated record (score=99, active=false, title unchanged)`);

    // ── Step 7: GET again to verify persisted update ──────────────────────────
    const getAfterPutRes = await fetch(`${COLLECTION_URL}/${SLUG}`);
    assert(
      getAfterPutRes.status === 200,
      `GET after PUT should return 200, got ${getAfterPutRes.status}`
    );
    const getAfterPutBody = await getAfterPutRes.json() as { slug: string; fields: Record<string, unknown> };
    assert(
      getAfterPutBody.fields.score === 99,
      `GET after PUT: score should be 99, got: ${getAfterPutBody.fields.score}`
    );
    assert(
      getAfterPutBody.fields.active === false,
      `GET after PUT: active should be false, got: ${getAfterPutBody.fields.active}`
    );
    assert(
      getAfterPutBody.fields.title === "First Rest Record",
      `GET after PUT: title should be unchanged, got: ${getAfterPutBody.fields.title}`
    );
    pass(`GET after PUT confirmed persisted update: score=99, active=false, title unchanged`);

    process.stdout.write("\n=== ALL CONTRACT-SCHEMA-REST TESTS PASSED ===\n");
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
