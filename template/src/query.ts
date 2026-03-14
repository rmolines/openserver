import matter from "gray-matter";
import { Glob } from "bun";
import path from "path";
import { getSchema, resolveDataDir } from "./schema-engine.js";

export interface QueryOptions {
  where?: Record<string, any>; // { field: value } or { field: { in: [...] } }
  sort?: { field: string; order?: "asc" | "desc" };
}

export interface QueryResult {
  slug: string;
  fields: Record<string, any>;
  body: string;
}

function matchesWhere(fields: Record<string, any>, where: Record<string, any>): boolean {
  for (const [key, condition] of Object.entries(where)) {
    const value = fields[key];

    if (condition !== null && typeof condition === "object" && "in" in condition) {
      // in operator
      const candidates: any[] = condition.in;
      if (Array.isArray(value)) {
        // array field: check if any element is in candidates
        if (!value.some((v) => candidates.includes(v))) return false;
      } else {
        if (!candidates.includes(value)) return false;
      }
    } else {
      // simple equality
      if (Array.isArray(value)) {
        // array field: check if array includes the value
        if (!value.includes(condition)) return false;
      } else {
        if (value !== condition) return false;
      }
    }
  }
  return true;
}

export async function query(dataDir: string, options?: QueryOptions): Promise<QueryResult[]> {
  const results: QueryResult[] = [];

  const glob = new Glob("*.md");
  try {
    for await (const file of glob.scan({ cwd: dataDir })) {
      const filePath = path.join(dataDir, file);
      try {
        const raw = await Bun.file(filePath).text();
        const parsed = matter(raw);
        const slug = file.replace(/\.md$/, "");
        results.push({ slug, fields: parsed.data, body: parsed.content });
      } catch (err) {
        process.stderr.write(`[query] failed to read ${filePath}: ${err}\n`);
      }
    }
  } catch {
    // dataDir may not exist
  }

  let filtered = results;

  if (options?.where) {
    const where = options.where;
    filtered = results.filter((doc) => matchesWhere(doc.fields, where));
  }

  if (options?.sort) {
    const { field, order = "asc" } = options.sort;
    filtered.sort((a, b) => {
      const av = a.fields[field];
      const bv = b.fields[field];
      if (av === bv) return 0;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      const cmp = av < bv ? -1 : 1;
      return order === "asc" ? cmp : -cmp;
    });
  }

  return filtered;
}

export async function getDocument(dataDir: string, slug: string): Promise<QueryResult> {
  const filePath = path.join(dataDir, `${slug}.md`);
  const raw = await Bun.file(filePath).text();
  const parsed = matter(raw);
  return { slug, fields: parsed.data, body: parsed.content };
}

/**
 * Query a named collection by schema name.
 * If the schema has a parent, parentSlug scopes the query to a specific parent directory.
 * If parentSlug is omitted and schema has parent, aggregates across ALL parent dirs.
 */
export async function queryCollection(
  schemaName: string,
  options?: QueryOptions & { parentSlug?: string }
): Promise<QueryResult[]> {
  const schema = getSchema(schemaName);
  if (!schema) {
    throw new Error(`[query] schema not found: "${schemaName}"`);
  }

  const { parentSlug, ...queryOptions } = options ?? {};

  // If schema has a parent and no parentSlug: aggregate across all parent dirs
  if (schema.parent && !parentSlug) {
    const collectionDir = `${schema.name}s`;
    const parentGlob = new Glob(`*/${collectionDir}/`);
    const allResults: QueryResult[] = [];

    try {
      for await (const dir of parentGlob.scan({ cwd: "data" })) {
        const fullDir = path.join("data", dir);
        const partial = await query(fullDir, { sort: queryOptions.sort });
        allResults.push(...partial);
      }
    } catch {
      // data dir may not exist
    }

    let filtered = allResults;
    if (queryOptions.where) {
      const where = queryOptions.where;
      filtered = allResults.filter((doc) => matchesWhere(doc.fields, where));
    }

    if (queryOptions.sort) {
      const { field, order = "asc" } = queryOptions.sort;
      filtered.sort((a, b) => {
        const av = a.fields[field];
        const bv = b.fields[field];
        if (av === bv) return 0;
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        const cmp = av < bv ? -1 : 1;
        return order === "asc" ? cmp : -cmp;
      });
    }

    return filtered;
  }

  const dataDir = resolveDataDir(schema, parentSlug);
  return query(dataDir, queryOptions);
}

/**
 * Retrieve a single document from a named collection by schema name and slug.
 */
export async function getFromCollection(
  schemaName: string,
  slug: string,
  parentSlug?: string
): Promise<QueryResult> {
  const schema = getSchema(schemaName);
  if (!schema) {
    throw new Error(`[query] schema not found: "${schemaName}"`);
  }

  const dataDir = resolveDataDir(schema, parentSlug);
  return getDocument(dataDir, slug);
}
