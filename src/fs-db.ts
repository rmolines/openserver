import matter from "gray-matter";
import { z } from "zod";
import { Glob } from "bun";
import path from "path";
import { mkdir } from "node:fs/promises";
import type { ResolvedSchema } from "./schema-engine.js";
import { getSchema, resolveDataDir } from "./schema-engine.js";

// Accept either a ResolvedSchema or a raw ZodObject for backward compatibility
type SchemaArg = ResolvedSchema | z.ZodObject<any>;

function getZodSchema(schema: SchemaArg): z.ZodObject<any> {
  if ("zodSchema" in schema) {
    return schema.zodSchema;
  }
  return schema;
}

/**
 * Creates a new document in <dataDir>/<slug>.md with frontmatter + body.
 * Throws if fields fail schema validation.
 */
export async function createDocument(
  dataDir: string,
  schema: SchemaArg,
  slug: string,
  fields: Record<string, any>,
  body?: string
): Promise<void> {
  const zodSchema = getZodSchema(schema);
  const validatedFields = zodSchema.parse(fields);

  const filePath = path.join(dataDir, `${slug}.md`);
  const content = matter.stringify(body ?? "", validatedFields);
  await Bun.write(filePath, content);
  process.stderr.write(`[fs-db] created: ${filePath}\n`);
}

/**
 * Reads a document, returns parsed frontmatter fields and body.
 */
export async function readDocument(
  dataDir: string,
  slug: string
): Promise<{ fields: Record<string, any>; body: string }> {
  const filePath = path.join(dataDir, `${slug}.md`);
  const file = Bun.file(filePath);
  const raw = await file.text();
  const parsed = matter(raw);
  return { fields: parsed.data, body: parsed.content };
}

/**
 * Lists all documents in dataDir, returning slug + parsed frontmatter for each.
 */
export async function listDocuments(
  dataDir: string
): Promise<Array<{ slug: string; fields: Record<string, any> }>> {
  const results: Array<{ slug: string; fields: Record<string, any> }> = [];

  const glob = new Glob("*.md");
  try {
    for await (const file of glob.scan({ cwd: dataDir })) {
      const filePath = path.join(dataDir, file);
      try {
        const raw = await Bun.file(filePath).text();
        const parsed = matter(raw);
        const slug = file.replace(/\.md$/, "");
        results.push({ slug, fields: parsed.data });
      } catch (err) {
        process.stderr.write(`[fs-db] failed to read ${filePath}: ${err}\n`);
      }
    }
  } catch {
    // dataDir may not exist yet
  }

  return results;
}

/**
 * Updates an existing document by merging new fields over existing ones.
 * Validates merged result against schema. Optionally replaces body.
 */
export async function updateDocument(
  dataDir: string,
  schema: SchemaArg,
  slug: string,
  fields: Record<string, any>,
  body?: string
): Promise<void> {
  const zodSchema = getZodSchema(schema);
  const existing = await readDocument(dataDir, slug);
  const merged = { ...existing.fields, ...fields };
  const validatedFields = zodSchema.parse(merged);

  const newBody = body !== undefined ? body : existing.body;
  const content = matter.stringify(newBody, validatedFields);
  const filePath = path.join(dataDir, `${slug}.md`);
  await Bun.write(filePath, content);
  process.stderr.write(`[fs-db] updated: ${filePath}\n`);
}

/**
 * Creates a document in a named collection, resolving the dataDir automatically.
 * Ensures the target directory exists before writing.
 */
export async function createInCollection(
  schemaName: string,
  slug: string,
  fields: Record<string, any>,
  body?: string,
  parentSlug?: string
): Promise<void> {
  const schema = getSchema(schemaName);
  if (!schema) {
    throw new Error(`[fs-db] schema not found: "${schemaName}"`);
  }

  const dataDir = resolveDataDir(schema, parentSlug);
  await mkdir(dataDir, { recursive: true });
  await createDocument(dataDir, schema, slug, fields, body);
}

/**
 * Updates a document in a named collection, resolving the dataDir automatically.
 */
export async function updateInCollection(
  schemaName: string,
  slug: string,
  fields: Record<string, any>,
  body?: string,
  parentSlug?: string
): Promise<void> {
  const schema = getSchema(schemaName);
  if (!schema) {
    throw new Error(`[fs-db] schema not found: "${schemaName}"`);
  }

  const dataDir = resolveDataDir(schema, parentSlug);
  await updateDocument(dataDir, schema, slug, fields, body);
}
