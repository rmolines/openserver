/**
 * Contract test: MCP tool-call works over HTTP streamable transport.
 *
 * Flow:
 *   1. Start OpenServer with transport: "http" on port 3456
 *   2. Connect a single MCP client via StreamableHTTPClientTransport
 *   3. listTools()      — assert create_note is present
 *   4. create_note(…)   — assert success
 *   5. list_notes()     — assert returns the created note
 *
 * One client is shared across all tests because WebStandardStreamableHTTPServerTransport
 * is stateful: it rejects a second initialize request from a new session on the same
 * transport instance. Tests run sequentially in declaration order.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { defineSchema, createServer } from "../src/index.js";

const PORT = 3456;
const DATA_DIR = `/tmp/os-transport-test-${Date.now()}`;

// ─── Schema ───────────────────────────────────────────────────────────────────

const note = defineSchema({
  name: "note",
  fields: {
    title: { type: "string", required: true },
    body: { type: "string" },
  },
});

// ─── Shared state ─────────────────────────────────────────────────────────────

let client: Client;

function extractText(content: unknown): string {
  return (content as Array<{ type: string; text?: string }>)
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const server = createServer({
    schemas: [note],
    transport: "http",
    port: PORT,
    dataDir: DATA_DIR,
  });

  await server.start();

  // Give Bun.serve a moment to bind the port
  await Bun.sleep(150);

  // Connect a single client — reused across all tests
  client = new Client({ name: "test-client", version: "1.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://localhost:${PORT}/mcp`)
  );
  await client.connect(transport);
});

afterAll(async () => {
  await client.close().catch(() => {});
  await rm(DATA_DIR, { recursive: true, force: true });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MCP over HTTP streamable transport", () => {
  test("listTools includes create_note", async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("create_note");
    expect(toolNames).toContain("list_notes");
  });

  test("create_note creates a note successfully", async () => {
    // create_note expects { slug, fields } — slug is the document ID,
    // fields contains the schema fields (title, body, …)
    const result = await client.callTool({
      name: "create_note",
      arguments: {
        slug: "note-http-transport",
        fields: { title: "hello from http transport" },
      },
    });

    expect(result.isError).toBeFalsy();
    expect(Array.isArray(result.content)).toBe(true);

    const text = extractText(result.content);

    // Response is "Created '<slug>' in note"
    expect(text).toContain("note-http-transport");
  });

  test("list_notes returns the previously created note", async () => {
    const result = await client.callTool({
      name: "list_notes",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(Array.isArray(result.content)).toBe(true);

    const text = extractText(result.content);

    // The listed document should contain our note's title
    expect(text.toLowerCase()).toContain("hello from http transport");
  });
});
