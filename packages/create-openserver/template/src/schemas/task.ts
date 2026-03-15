import { defineSchema } from "openserver/schema-engine";
defineSchema({
  name: "task",
  parent: "project",
  fields: {
    title: { type: "string", required: true },
    status: { type: "enum", values: ["todo", "in-progress", "done"], default: "todo" },
    priority: { type: "enum", values: ["low", "medium", "high"], default: "medium" },
    assignee: { type: "string" }
  }
});
