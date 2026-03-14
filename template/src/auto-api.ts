import { type ResolvedSchema, getAllSchemas, resolveDataDir } from "./schema-engine.js";
import { query, getDocument, type QueryOptions } from "./query.js";

export function registerCollectionRoutes(
  schema: ResolvedSchema,
  dataDir: string
): Map<string, (req: Request) => Promise<Response>> {
  const name = schema.name;
  const routes = new Map<string, (req: Request) => Promise<Response>>();

  // GET /api/<collection> — list with optional filters
  routes.set(`/api/${name}s`, async (req: Request) => {
    const url = new URL(req.url);
    const params = url.searchParams;

    const where: Record<string, any> = {};
    let sort: QueryOptions["sort"] | undefined;

    const sortField = params.get("_sort");
    const sortOrder = params.get("_order") as "asc" | "desc" | null;

    for (const [key, value] of params.entries()) {
      if (key === "_sort" || key === "_order") continue;
      where[key] = value;
    }

    if (sortField) {
      sort = { field: sortField, order: sortOrder ?? "asc" };
    }

    const options: QueryOptions = {};
    if (Object.keys(where).length > 0) options.where = where;
    if (sort) options.sort = sort;

    try {
      const results = await query(dataDir, options);
      return new Response(JSON.stringify({ data: results, count: results.length }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      process.stderr.write(`[auto-api] GET /api/${name}s error: ${err}\n`);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  });

  // GET /api/<collection>/:slug — single document
  routes.set(`/api/${name}s/:slug`, async (req: Request) => {
    const url = new URL(req.url);
    // Extract slug from the URL path — e.g. /api/tasks/my-task => "my-task"
    const prefix = `/api/${name}s/`;
    const slug = url.pathname.slice(prefix.length);

    try {
      const doc = await getDocument(dataDir, slug);
      return new Response(JSON.stringify({ slug: doc.slug, fields: doc.fields, body: doc.body }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
  });

  return routes;
}

export function registerAllRoutes(): Map<string, (req: Request) => Promise<Response>> {
  const combined = new Map<string, (req: Request) => Promise<Response>>();

  for (const schema of getAllSchemas()) {
    let dataDir: string;
    try {
      dataDir = resolveDataDir(schema);
    } catch {
      // schema has a parent — skip top-level routes
      process.stderr.write(
        `[auto-api] skipping "${schema.name}" — requires parentSlug (has parent: "${schema.parent}")\n`
      );
      continue;
    }

    const routes = registerCollectionRoutes(schema, dataDir);
    for (const [path, handler] of routes) {
      combined.set(path, handler);
    }
  }

  return combined;
}
