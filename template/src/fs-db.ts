import matter from "gray-matter";
import { z } from "zod";
import { Glob } from "bun";
import path from "path";

/**
 * Creates a new document in <dataDir>/<slug>.md with frontmatter + body.
 * Throws if fields fail schema validation.
 */
export async function createDocument(
  dataDir: string,
  schema: z.ZodObject<any>,
  slug: string,
  fields: Record<string, any>,
  body: string
): Promise<void> {
  schema.parse(fields);

  const filePath = path.join(dataDir, `${slug}.md`);
  const content = matter.stringify(body, fields);
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
  schema: z.ZodObject<any>,
  slug: string,
  fields: Record<string, any>,
  body?: string
): Promise<void> {
  const existing = await readDocument(dataDir, slug);
  const merged = { ...existing.fields, ...fields };
  schema.parse(merged);

  const newBody = body !== undefined ? body : existing.body;
  const content = matter.stringify(newBody, merged);
  const filePath = path.join(dataDir, `${slug}.md`);
  await Bun.write(filePath, content);
  process.stderr.write(`[fs-db] updated: ${filePath}\n`);
}
