import { defineSchema, schemaRegistry, getSchema, getAllSchemas } from "openserver";
import type { FieldDef, SchemaDef, ResolvedSchema } from "openserver";

// Test 1: defineSchema creates and registers a schema
const testSchema = defineSchema({
  name: "test_item",
  fields: {
    title: { type: "string", required: true },
    count: { type: "number" },
    active: { type: "boolean", default: true },
  },
});

console.assert(testSchema.name === "test_item", "Schema name mismatch");
console.assert(testSchema.zodSchema !== undefined, "Zod schema missing");

// Test 2: schemaRegistry contains the registered schema
const retrieved = getSchema("test_item");
console.assert(retrieved !== undefined, "Schema not found in registry");
console.assert(retrieved === testSchema, "Registry entry mismatch");

// Test 3: getAllSchemas returns at least our schema
const all = getAllSchemas();
console.assert(all.length >= 1, "getAllSchemas returned empty");

// Test 4: Type checking works (compile-time verification)
const fieldDef: FieldDef = { type: "string", required: true };
const schemaDef: SchemaDef = { name: "type_check", fields: { f: fieldDef } };

console.log("All import tests passed ✓");
