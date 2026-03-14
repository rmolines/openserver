import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Glob } from "bun";
import path from "path";
import fs from "fs/promises";
import { createDocument, readDocument, listDocuments, updateDocument } from "../fs-db.js";

// Maps field type strings to Zod schema builders
function fieldTypeToZod(type: string, required: boolean): z.ZodTypeAny {
  let base: z.ZodTypeAny;
  switch (type) {
    case "number":
      base = z.number();
      break;
    case "boolean":
      base = z.boolean();
      break;
    case "date":
      base = z.string(); // dates stored as ISO strings
      break;
    case "string":
    default:
      base = z.string();
      break;
  }
  return required ? base : base.optional();
}

// Build a Zod object schema from a field definitions record
function buildZodSchema(
  fields: Record<string, { type: string; required?: boolean }>
): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, def] of Object.entries(fields)) {
    shape[key] = fieldTypeToZod(def.type, def.required ?? false);
  }
  return z.object(shape);
}

// Generate TypeScript source for a schema file
function generateSchemaSource(
  name: string,
  fields: Record<string, { type: string; required?: boolean }>
): string {
  const lines: string[] = [`// Auto-generated schema for '${name}'`, `import { z } from "zod";`, ``];

  lines.push(`export const name = ${JSON.stringify(name)};`);
  lines.push(`export const fields = ${JSON.stringify(fields, null, 2)} as const;`);
  lines.push(``);
  lines.push(`export const schema = z.object({`);
  for (const [key, def] of Object.entries(fields)) {
    const required = def.required ?? false;
    let zodExpr: string;
    switch (def.type) {
      case "number":
        zodExpr = required ? "z.number()" : "z.number().optional()";
        break;
      case "boolean":
        zodExpr = required ? "z.boolean()" : "z.boolean().optional()";
        break;
      case "date":
        zodExpr = required ? "z.string()" : "z.string().optional()";
        break;
      default:
        zodExpr = required ? "z.string()" : "z.string().optional()";
    }
    lines.push(`  ${key}: ${zodExpr},`);
  }
  lines.push(`});`);
  lines.push(``);
  lines.push(`export type Schema = z.infer<typeof schema>;`);

  return lines.join("\n");
}

// Register 4 CRUD tools for a given schema name + zod schema
function registerCrudTools(
  server: McpServer,
  name: string,
  zodSchema: z.ZodObject<any>,
  dataDir: string
): string[] {
  const createName = `create_${name}`;
  const readName = `read_${name}`;
  const listName = `list_${name}s`;
  const updateName = `update_${name}`;

  server.tool(
    createName,
    {
      slug: z.string(),
      fields: z.record(z.string(), z.any()),
      body: z.string().optional().default(""),
    },
    async ({ slug, fields, body }) => {
      await fs.mkdir(dataDir, { recursive: true });
      await createDocument(dataDir, zodSchema, slug, fields, body);
      return {
        content: [{ type: "text" as const, text: `Created '${slug}' in ${name}` }],
      };
    }
  );

  server.tool(
    readName,
    { slug: z.string() },
    async ({ slug }) => {
      const doc = await readDocument(dataDir, slug);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(doc, null, 2),
          },
        ],
      };
    }
  );

  server.tool(listName, async () => {
    const docs = await listDocuments(dataDir);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(docs, null, 2),
        },
      ],
    };
  });

  server.tool(
    updateName,
    {
      slug: z.string(),
      fields: z.record(z.string(), z.any()),
      body: z.string().optional(),
    },
    async ({ slug, fields, body }) => {
      await updateDocument(dataDir, zodSchema, slug, fields, body);
      return {
        content: [{ type: "text" as const, text: `Updated '${slug}' in ${name}` }],
      };
    }
  );

  return [createName, readName, listName, updateName];
}

export function register(server: McpServer) {
  const projectRoot = new URL("../../..", import.meta.url).pathname;

  // create_schema tool
  server.tool(
    "create_schema",
    {
      name: z.string(),
      fields: z.record(
        z.string(),
        z.object({
          type: z.enum(["string", "number", "boolean", "date"]),
          required: z.boolean().optional(),
        })
      ),
    },
    async ({ name, fields }) => {
      const schemasDir = path.join(projectRoot, "src/schemas");
      const dataDir = path.join(projectRoot, "data", name);

      // Write schema file for persistence
      await fs.mkdir(schemasDir, { recursive: true });
      const schemaFilePath = path.join(schemasDir, `${name}.ts`);
      const typedFields = fields as Record<string, { type: string; required?: boolean }>;
      const source = generateSchemaSource(name, typedFields);
      await fs.writeFile(schemaFilePath, source, "utf-8");
      process.stderr.write(`[openserver] wrote schema file: ${schemaFilePath}\n`);

      // Create data directory
      await fs.mkdir(dataDir, { recursive: true });
      process.stderr.write(`[openserver] created data dir: ${dataDir}\n`);

      // Build Zod schema and register CRUD tools
      const zodSchema = buildZodSchema(typedFields);
      const toolNames = registerCrudTools(server, name, zodSchema, dataDir);

      // Notify MCP client that tool list changed
      server.sendToolListChanged();

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
          const mod = await import(filePath + "?t=" + Date.now());
          if (mod.name && mod.fields) {
            const zodSchema = buildZodSchema(mod.fields);
            const dataDir = path.join(projectRoot, "data", mod.name);
            await fs.mkdir(dataDir, { recursive: true });
            registerCrudTools(server, mod.name, zodSchema, dataDir);
            process.stderr.write(`[openserver] loaded existing schema: ${mod.name}\n`);
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
