import { type ResolvedSchema, getAllSchemas, resolveDataDir } from "./schema-engine.js";
import { query, getDocument, type QueryOptions } from "./query.js";

function buildQueryOptions(params: URLSearchParams): QueryOptions {
  const where: Record<string, any> = {};
  const sortField = params.get("_sort");
  const sortOrder = params.get("_order") as "asc" | "desc" | null;

  for (const [key, value] of params.entries()) {
    if (key === "_sort" || key === "_order") continue;
    where[key] = value;
  }

  const options: QueryOptions = {};
  if (Object.keys(where).length > 0) options.where = where;
  if (sortField) options.sort = { field: sortField, order: sortOrder ?? "asc" };
  return options;
}

export function registerCollectionRoutes(
  schema: ResolvedSchema,
  dataDir: string
): Map<string, (req: Request) => Promise<Response>> {
  const name = schema.name;
  const routes = new Map<string, (req: Request) => Promise<Response>>();

  // GET /api/<collection> — list with optional filters
  routes.set(`/api/${name}s`, async (req: Request) => {
    const url = new URL(req.url);
    const options = buildQueryOptions(url.searchParams);

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
      return new Response(JSON.stringify(doc), {
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

export function registerChildCollectionRoutes(
  schema: ResolvedSchema
): Map<string, (req: Request) => Promise<Response>> {
  const routes = new Map<string, (req: Request) => Promise<Response>>();
  const parentPlural = schema.parent + "s";
  const childPlural = schema.name + "s";

  // GET /api/<parentPlural>/:parent_slug/<childPlural> — list children under a parent
  routes.set(`/api/${parentPlural}/:parent_slug/${childPlural}`, async (req: Request) => {
    const url = new URL(req.url);
    const parent_slug = url.pathname.split("/")[3];
    const dataDir = resolveDataDir(schema, parent_slug);
    const options = buildQueryOptions(url.searchParams);

    try {
      const results = await query(dataDir, options);
      return new Response(JSON.stringify({ data: results, count: results.length }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      process.stderr.write(`[auto-api] GET /api/${parentPlural}/:parent_slug/${childPlural} error: ${err}\n`);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  });

  // GET /api/<parentPlural>/:parent_slug/<childPlural>/:slug — single child document
  routes.set(`/api/${parentPlural}/:parent_slug/${childPlural}/:slug`, async (req: Request) => {
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    // pathname: /api/<parentPlural>/<parent_slug>/<childPlural>/<slug>
    const parent_slug = parts[3];
    const slug = parts[5];
    const dataDir = resolveDataDir(schema, parent_slug);

    try {
      const doc = await getDocument(dataDir, slug);
      return new Response(JSON.stringify(doc), {
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
  const childSchemas: ResolvedSchema[] = [];

  // First pass: root schemas (no parent)
  for (const schema of getAllSchemas()) {
    if (schema.parent) {
      childSchemas.push(schema);
      continue;
    }

    const dataDir = resolveDataDir(schema);
    const routes = registerCollectionRoutes(schema, dataDir);
    for (const [path, handler] of routes) {
      combined.set(path, handler);
    }
  }

  // Second pass: child schemas using registerChildCollectionRoutes
  for (const schema of childSchemas) {
    const routes = registerChildCollectionRoutes(schema);
    for (const [path, handler] of routes) {
      combined.set(path, handler);
    }
  }

  return combined;
}
