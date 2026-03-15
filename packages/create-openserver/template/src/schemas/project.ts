import { defineSchema } from "../schema-engine.js";
defineSchema({
  name: "project",
  fields: {
    title: { type: "string", required: true },
    status: { type: "enum", values: ["active", "archived", "planning"], default: "planning" },
    description: { type: "string" },
    tags: { type: "array", items: "string", default: [] }
  }
});
