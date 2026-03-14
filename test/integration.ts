/**
 * Integration test for OpenServer framework layer.
 * Tests schema registration, CRUD, query filters, hierarchy, and backward compatibility.
 */

import path from "path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { mkdir } from "node:fs/promises";

import {
  defineSchema,
  schemaRegistry,
  getSchema,
} from "../template/src/schema-engine";

import {
  createDocument,
  readDocument,
  updateDocument,
} from "../template/src/fs-db";

import { query } from "../template/src/query";

// ─── helpers ──────────────────────────────────────────────────────────────────

function pass(msg: string) {
  console.log(`PASS: ${msg}`);
}

function fail(msg: string, err?: unknown) {
  console.error(`FAIL: ${msg}${err ? " — " + err : ""}`);
  process.exit(1);
}

function assert(condition: boolean, message: string) {
  if (!condition) fail(message);
}

// ─── Part 1 — Schema registration ─────────────────────────────────────────────

function part1_schemaRegistration() {
  // Clear registry to avoid cross-run state
  schemaRegistry.clear();

  // Define all 7 launchpad schemas
  defineSchema({
    name: "draft",
    fields: {
      id: { type: "string", required: true },
      mission: { type: "string", required: true },
      created: { type: "date" },
      updated: { type: "date" },
      priority: { type: "enum", values: ["critical", "high", "medium", "low"], default: "medium" },
      tags: { type: "array", items: "string", default: [] },
      supersedes: { type: "string" },
    },
  });

  defineSchema({
    name: "prd",
    fields: {
      id: { type: "string", required: true },
      mission: { type: "string", required: true },
      created: { type: "date", required: true },
      updated: { type: "date", required: true },
      tags: { type: "array", items: "string", default: [] },
    },
  });

  defineSchema({
    name: "mission",
    fields: {
      id: { type: "string", required: true },
      status: { type: "enum", values: ["draft", "validated", "active", "paused", "archived"] },
      created: { type: "date", required: true },
      updated: { type: "date", required: true },
      tags: { type: "array", items: "string", default: [] },
    },
  });

  defineSchema({
    name: "plan",
    fields: {
      id: { type: "string", required: true },
      mission: { type: "string", required: true },
      created: { type: "date", required: true },
    },
  });

  defineSchema({
    name: "review",
    fields: {
      decision: {
        type: "enum",
        values: ["approved", "back-to-delivery", "back-to-planning", "back-to-discovery"],
      },
    },
  });

  defineSchema({
    name: "cycle",
    fields: {
      type: { type: "enum", values: ["framing", "research", "analysis", "spike", "mockup", "interview"] },
      date: { type: "date", required: true },
      module: { type: "string" },
    },
  });

  defineSchema({
    name: "stage",
    fields: {
      id: { type: "string" },
      name: { type: "string" },
      hypothesis: { type: "string" },
    },
  });

  // Verify all 7 schemas are registered
  const expected = ["draft", "prd", "mission", "plan", "review", "cycle", "stage"];
  for (const name of expected) {
    assert(schemaRegistry.has(name), `schema "${name}" should be registered`);
  }
  assert(schemaRegistry.size === expected.length, `registry should have exactly ${expected.length} schemas`);

  // Zod validation tests — positive cases
  const draftSchema = getSchema("draft")!.zodSchema;
  const validDraft = draftSchema.safeParse({ id: "d1", mission: "fl", created: "2024-01-01", updated: "2024-01-01" });
  assert(validDraft.success, "valid draft should parse successfully");

  const prdSchema = getSchema("prd")!.zodSchema;
  const validPrd = prdSchema.safeParse({ id: "p1", mission: "fl", created: "2024-01-01", updated: "2024-01-01" });
  assert(validPrd.success, "valid prd should parse successfully");

  const missionSchema = getSchema("mission")!.zodSchema;
  const validMission = missionSchema.safeParse({ id: "fl", created: "2024-01-01", updated: "2024-01-01", status: "active" });
  assert(validMission.success, "valid mission should parse successfully");

  const planSchema = getSchema("plan")!.zodSchema;
  const validPlan = planSchema.safeParse({ id: "plan1", mission: "fl", created: "2024-01-01" });
  assert(validPlan.success, "valid plan should parse successfully");

  const reviewSchema = getSchema("review")!.zodSchema;
  const validReview = reviewSchema.safeParse({ decision: "approved" });
  assert(validReview.success, "valid review should parse successfully");

  const cycleSchema = getSchema("cycle")!.zodSchema;
  const validCycle = cycleSchema.safeParse({ type: "framing", date: "2024-01-01" });
  assert(validCycle.success, "valid cycle should parse successfully");

  const stageSchema = getSchema("stage")!.zodSchema;
  const validStage = stageSchema.safeParse({ id: "s1", name: "discovery" });
  assert(validStage.success, "valid stage should parse successfully");

  // Negative cases — invalid data should fail
  const invalidDraft = draftSchema.safeParse({ mission: "fl" }); // missing required id
  assert(!invalidDraft.success, "draft without id should fail validation");

  const invalidMission = missionSchema.safeParse({ id: "fl", created: "2024-01-01", updated: "2024-01-01", status: "invalid-status" });
  assert(!invalidMission.success, "mission with invalid status should fail validation");

  const invalidReview = reviewSchema.safeParse({ decision: "bad-decision" });
  assert(!invalidReview.success, "review with invalid decision should fail validation");

  const invalidCycle = cycleSchema.safeParse({ type: "unknown-type", date: "2024-01-01" });
  assert(!invalidCycle.success, "cycle with invalid type should fail validation");

  const invalidPrd = prdSchema.safeParse({ id: "p1", mission: "fl" }); // missing required created/updated
  assert(!invalidPrd.success, "prd without required dates should fail validation");

  pass("All 7 schemas registered and validated");
}

// ─── Part 2 — CRUD operations ──────────────────────────────────────────────────

async function part2_crud(tmpDir: string) {
  const missionSchema = getSchema("mission")!;
  const dataDir = path.join(tmpDir, "missions");
  await mkdir(dataDir, { recursive: true });

  // Create
  await createDocument(dataDir, missionSchema, "fl", {
    id: "fl",
    status: "active",
    created: "2024-01-01",
    updated: "2024-06-01",
    tags: ["core", "platform"],
  });

  await createDocument(dataDir, missionSchema, "openserver", {
    id: "openserver",
    status: "validated",
    created: "2024-03-01",
    updated: "2024-09-01",
    tags: ["infra"],
  });

  // Read back and verify
  const fl = await readDocument(dataDir, "fl");
  assert(fl.fields.id === "fl", "fl.id should match");
  assert(fl.fields.status === "active", "fl.status should be active");
  assert(Array.isArray(fl.fields.tags), "fl.tags should be an array");

  const openserver = await readDocument(dataDir, "openserver");
  assert(openserver.fields.id === "openserver", "openserver.id should match");
  assert(openserver.fields.status === "validated", "openserver.status should be validated");

  // Update and verify merge
  await updateDocument(dataDir, missionSchema, "fl", { status: "paused", updated: "2024-12-01" });
  const flUpdated = await readDocument(dataDir, "fl");
  assert(flUpdated.fields.status === "paused", "fl.status should be paused after update");
  assert(flUpdated.fields.id === "fl", "fl.id should persist after update");

  pass("CRUD operations work");
}

// ─── Part 3 — Query with filters ──────────────────────────────────────────────

async function part3_queryFilters(tmpDir: string) {
  const missionSchema = getSchema("mission")!;
  const dataDir = path.join(tmpDir, "query-test");
  await mkdir(dataDir, { recursive: true });

  const docs = [
    { id: "m1", status: "active", created: "2024-01-01", updated: "2024-01-01" },
    { id: "m2", status: "active", created: "2024-02-01", updated: "2024-02-01" },
    { id: "m3", status: "paused", created: "2024-03-01", updated: "2024-03-01" },
    { id: "m4", status: "archived", created: "2024-04-01", updated: "2024-04-01" },
    { id: "m5", status: "draft", created: "2024-05-01", updated: "2024-05-01" },
  ];

  for (const doc of docs) {
    await createDocument(dataDir, missionSchema, doc.id, doc);
  }

  // Equality filter
  const activeResults = await query(dataDir, { where: { status: "active" } });
  assert(activeResults.length === 2, `should find 2 active missions, got ${activeResults.length}`);

  // In filter
  const activeOrPaused = await query(dataDir, { where: { status: { in: ["active", "paused"] } } });
  assert(activeOrPaused.length === 3, `should find 3 active/paused missions, got ${activeOrPaused.length}`);

  // Sort desc
  const sorted = await query(dataDir, { sort: { field: "created", order: "desc" } });
  assert(sorted.length === 5, "should return all 5 docs when sorting");
  // Verify descending order: first item should have the latest created date
  const createdDates = sorted.map(d => d.fields.created as string);
  for (let i = 0; i < createdDates.length - 1; i++) {
    assert(
      createdDates[i] >= createdDates[i + 1],
      `sort order wrong at index ${i}: ${createdDates[i]} >= ${createdDates[i + 1]}`
    );
  }

  pass("Query filters work");
}

// ─── Part 4 — Hierarchy ────────────────────────────────────────────────────────

async function part4_hierarchy(tmpDir: string) {
  // Define parent/child schemas
  schemaRegistry.clear();

  defineSchema({
    name: "project",
    fields: {
      id: { type: "string", required: true },
      name: { type: "string" },
    },
  });

  defineSchema({
    name: "module",
    parent: "project",
    fields: {
      id: { type: "string", required: true },
      title: { type: "string" },
    },
  });

  const projectSchema = getSchema("project")!;
  const moduleSchema = getSchema("module")!;

  // Create project dirs
  const flProjectDir = path.join(tmpDir, "data", "fl", "modules");
  const otherProjectDir = path.join(tmpDir, "data", "other", "modules");
  await mkdir(flProjectDir, { recursive: true });
  await mkdir(otherProjectDir, { recursive: true });

  // Create modules under "fl"
  await createDocument(flProjectDir, moduleSchema, "query-layer", { id: "query-layer", title: "Query Layer" });
  await createDocument(flProjectDir, moduleSchema, "bet-bowl", { id: "bet-bowl", title: "Bet Bowl" });

  // Create modules under "other" — should NOT show up in fl query
  await createDocument(otherProjectDir, moduleSchema, "auth", { id: "auth", title: "Auth" });

  // Query modules scoped to "fl"
  const flModules = await query(flProjectDir);
  assert(flModules.length === 2, `should find 2 modules under fl, got ${flModules.length}`);

  const slugs = flModules.map(m => m.slug).sort();
  assert(slugs.includes("query-layer"), "query-layer should be in fl modules");
  assert(slugs.includes("bet-bowl"), "bet-bowl should be in fl modules");

  // Query modules scoped to "other" — should only return auth
  const otherModules = await query(otherProjectDir);
  assert(otherModules.length === 1, `should find 1 module under other, got ${otherModules.length}`);
  assert(otherModules[0].slug === "auth", "auth should be in other modules");

  // Verify fl query doesn't contain auth
  const flSlugs = flModules.map(m => m.slug);
  assert(!flSlugs.includes("auth"), "auth should NOT appear in fl modules");

  pass("Hierarchy works");
}

// ─── Part 5 — Backward compatibility ──────────────────────────────────────────

async function part5_backwardCompatibility(tmpDir: string) {
  schemaRegistry.clear();

  // Simple flat schema with only basic types
  defineSchema({
    name: "item",
    fields: {
      name: { type: "string", required: true },
      count: { type: "number", default: 0 },
      active: { type: "boolean", default: true },
    },
  });

  const itemSchema = getSchema("item");
  assert(itemSchema !== undefined, "item schema should be in registry");

  // Validate the Zod schema
  const zodSchema = itemSchema!.zodSchema;
  const valid = zodSchema.safeParse({ name: "test" });
  assert(valid.success, "valid item should parse");

  const invalid = zodSchema.safeParse({ count: 5 }); // missing required name
  assert(!invalid.success, "item without name should fail");

  // CRUD on flat schema
  const dataDir = path.join(tmpDir, "items");
  await mkdir(dataDir, { recursive: true });

  await createDocument(dataDir, itemSchema!, "item-1", { name: "Widget", count: 42, active: true });
  const doc = await readDocument(dataDir, "item-1");
  assert(doc.fields.name === "Widget", "name should match");
  assert(doc.fields.count === 42, "count should match");
  assert(doc.fields.active === true, "active should match");

  await updateDocument(dataDir, itemSchema!, "item-1", { count: 99 });
  const updated = await readDocument(dataDir, "item-1");
  assert(updated.fields.count === 99, "count should be updated");
  assert(updated.fields.name === "Widget", "name should persist after update");

  pass("v0.1 backward compatibility maintained");
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let tmpDir: string | undefined;

  try {
    tmpDir = await mkdtemp(path.join(tmpdir(), "openserver-test-"));

    // Part 1 — synchronous
    part1_schemaRegistration();

    // Parts 2-5 — async, use fresh registry state as needed
    // Re-register mission schema (cleared at end of part1 — actually NOT cleared, so it's still there)
    // Part 2 uses mission schema registered in part1
    await part2_crud(tmpDir);

    // Part 3 also uses mission schema
    await part3_queryFilters(tmpDir);

    // Part 4 clears registry and adds project/module schemas
    await part4_hierarchy(tmpDir);

    // Part 5 clears registry and uses simple flat schema
    await part5_backwardCompatibility(tmpDir);

    console.log("\n=== ALL INTEGRATION TESTS PASSED ===");
  } catch (err) {
    console.error(`\nUnexpected error: ${err}`);
    process.exit(1);
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }
}

main();
