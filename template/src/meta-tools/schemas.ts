import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Glob } from "bun";
import path from "path";
import fs from "fs/promises";
import { defineSchema, getSchema, type SchemaDef, type FieldDef } from "../schema-engine.js";
import { registerCollectionTools, registerChildCollectionTools } from "../auto-mcp.js";

// Generate TypeScript source for a schema file using defineSchema()
function generateSchemaSource(name: string, fields: Record<string, FieldDef>, parent?: string): string {
  const lines: string[] = [
    `// Auto-generated schema for '${name}'`,
    `import { defineSchema } from "../schema-engine.js";`,
    ``,
    `defineSchema(${JSON.stringify({ name, ...(parent ? { parent } : {}), fields } satisfies SchemaDef, null, 2)});`,
    ``,
  ];
  return lines.join("\n");
}

export function register(server: McpServer) {
  const projectRoot = new URL("../../..", import.meta.url).pathname;

  // create_schema tool
  server.tool(
    "create_schema",
    {
      name: z.string(),
      parent: z.string().optional(),
      fields: z.record(
        z.string(),
        z.object({
          type: z.enum(["string", "number", "boolean", "date", "enum", "array", "ref"]),
          required: z.boolean().optional(),
          default: z.any().optional(),
          values: z.array(z.string()).optional(),
          items: z.string().optional(),
          collection: z.string().optional(),
        })
      ),
    },
    async ({ name, parent, fields }) => {
      const schemasDir = path.join(projectRoot, "src/schemas");

      // Build SchemaDef with proper FieldDef types
      const schemaDef: SchemaDef = { name, fields: fields as Record<string, FieldDef>, ...(parent ? { parent } : {}) };

      // Register schema in the engine
      const schema = defineSchema(schemaDef);

      // Write schema file for persistence
      await fs.mkdir(schemasDir, { recursive: true });
      const schemaFilePath = path.join(schemasDir, `${name}.ts`);
      const source = generateSchemaSource(name, fields as Record<string, FieldDef>, parent);
      await fs.writeFile(schemaFilePath, source, "utf-8");
      process.stderr.write(`[openserver] wrote schema file: ${schemaFilePath}\n`);

      let toolNames: string[];

      if (parent) {
        // Child schemas: data dirs are created at runtime by tool handlers per parent slug
        toolNames = registerChildCollectionTools(server, schema);
        process.stderr.write(`[openserver] registered child CRUD tools for schema: ${name} (parent: ${parent})\n`);
      } else {
        // Root schemas: create data directory and register standard CRUD tools
        const dataDir = path.join(projectRoot, "data", `${name}s`);
        await fs.mkdir(dataDir, { recursive: true });
        process.stderr.write(`[openserver] created data dir: ${dataDir}\n`);
        toolNames = registerCollectionTools(server, schema, dataDir);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Schema '${name}' created. Tools registered:\n${toolNames.map((t) => `- ${t}`).join("\n")}`,
          },
        ],
      };
    }
  );

  // On startup: load existing schemas and re-register CRUD tools
  (async () => {
    const schemasDir = path.join(projectRoot, "src/schemas");
    const glob = new Glob("*.ts");

    try {
      for await (const file of glob.scan({ cwd: schemasDir })) {
        const filePath = path.join(schemasDir, file);
        try {
          // Importing the schema file calls defineSchema() as a side-effect
          await import(filePath + "?t=" + Date.now());

          // After import, the schema name is derived from the filename (convention)
          const name = file.replace(/\.ts$/, "");
          const schema = getSchema(name);
          if (schema) {
            if (schema.parent) {
              // Child schema: register tools with required parent_slug parameter
              registerChildCollectionTools(server, schema);
              process.stderr.write(`[openserver] loaded existing child schema: ${name} (parent: ${schema.parent})\n`);
            } else {
              // Root schema: create data directory and register standard CRUD tools
              const dataDir = path.join(projectRoot, "data", `${name}s`);
              await fs.mkdir(dataDir, { recursive: true });
              registerCollectionTools(server, schema, dataDir);
              process.stderr.write(`[openserver] loaded existing schema: ${name}\n`);
            }
          } else {
            process.stderr.write(`[openserver] schema file imported but "${name}" not found in registry — skipping\n`);
          }
        } catch (err) {
          process.stderr.write(`[openserver] failed to load schema ${file}: ${err}\n`);
        }
      }
    } catch {
      // schemasDir may not exist yet
    }
  })();
}
