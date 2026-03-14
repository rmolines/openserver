import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs/promises";
import { type ResolvedSchema, getAllSchemas, resolveDataDir } from "./schema-engine.js";
import { createDocument, updateDocument } from "./fs-db.js";
import { query, getDocument, type QueryOptions } from "./query.js";

export function registerCollectionTools(
  server: McpServer,
  schema: ResolvedSchema,
  dataDir: string
): string[] {
  const name = schema.name;
  const createName = `create_${name}`;
  const readName = `read_${name}`;
  const listName = `list_${name}s`;
  const updateName = `update_${name}`;

  server.tool(
    createName,
    {
      slug: z.string(),
      fields: z.record(z.string(), z.any()),
      body: z.string().optional(),
    },
    async ({ slug, fields, body }) => {
      await fs.mkdir(dataDir, { recursive: true });
      await createDocument(dataDir, schema, slug, fields, body);
      return {
        content: [{ type: "text" as const, text: `Created '${slug}' in ${name}` }],
      };
    }
  );

  server.tool(
    readName,
    { slug: z.string() },
    async ({ slug }) => {
      const doc = await getDocument(dataDir, slug);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(doc, null, 2) }],
      };
    }
  );

  server.tool(
    listName,
    {
      where: z.record(z.string(), z.any()).optional(),
      sort_field: z.string().optional(),
      sort_order: z.enum(["asc", "desc"]).optional(),
    },
    async ({ where, sort_field, sort_order }) => {
      const options: QueryOptions = {};
      if (where) options.where = where;
      if (sort_field) options.sort = { field: sort_field, order: sort_order ?? "asc" };
      const results = await query(dataDir, options);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.tool(
    updateName,
    {
      slug: z.string(),
      fields: z.record(z.string(), z.any()),
      body: z.string().optional(),
    },
    async ({ slug, fields, body }) => {
      await updateDocument(dataDir, schema, slug, fields, body);
      return {
        content: [{ type: "text" as const, text: `Updated '${slug}' in ${name}` }],
      };
    }
  );

  server.sendToolListChanged();

  const toolNames = [createName, readName, listName, updateName];
  process.stderr.write(`[auto-mcp] registered tools for "${name}": ${toolNames.join(", ")}\n`);
  return toolNames;
}

export function registerAllCollections(server: McpServer): void {
  for (const schema of getAllSchemas()) {
    let dataDir: string;
    try {
      dataDir = resolveDataDir(schema);
    } catch {
      // schema has a parent — skip top-level registration (no parentSlug available)
      process.stderr.write(
        `[auto-mcp] skipping "${schema.name}" — requires parentSlug (has parent: "${schema.parent}")\n`
      );
      continue;
    }
    registerCollectionTools(server, schema, dataDir);
  }
}
