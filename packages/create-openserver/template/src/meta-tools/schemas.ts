import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Glob } from "bun";
import path from "path";
import fs from "fs/promises";
import { defineSchema, getSchema, type SchemaDef, type FieldDef } from "openserver/schema-engine";
import { registerCollectionTools, registerChildCollectionTools } from "openserver/auto-mcp";
import { addSchemaRoutes } from "openserver/auto-api";
import { sharedApiRoutes } from "openserver";

function generateSchemaSource(name: string, fields: Record<string, FieldDef>, parent?: string): string {
  const def: SchemaDef = { name, ...(parent ? { parent } : {}), fields };
  return `// Auto-generated schema for '${name}'\nimport { defineSchema } from "openserver/schema-engine";\n\ndefineSchema(${JSON.stringify(def, null, 2)});\n`;
}

export function register(server: McpServer) {
  const projectRoot = new URL("../..", import.meta.url).pathname;

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
      const schema = defineSchema({ name, fields: fields as Record<string, FieldDef>, ...(parent ? { parent } : {}) });

      await fs.mkdir(schemasDir, { recursive: true });
      const schemaFilePath = path.join(schemasDir, `${name}.ts`);
      await fs.writeFile(schemaFilePath, generateSchemaSource(name, fields as Record<string, FieldDef>, parent), "utf-8");
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

      // Also register HTTP routes into the shared mutable route map so the
      // new collection is reachable via REST without a server restart.
      if (sharedApiRoutes) {
        addSchemaRoutes(sharedApiRoutes, schema);
        process.stderr.write(`[openserver] registered HTTP routes for schema: ${name}\n`);
      } else {
        process.stderr.write(`[openserver] sharedApiRoutes not yet initialised — HTTP routes for ${name} will be missing until restart\n`);
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
