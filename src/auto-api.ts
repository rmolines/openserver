import { type ResolvedSchema, getAllSchemas, resolveDataDir } from "./schema-engine.js";
import { query, getDocument, type QueryOptions } from "./query.js";
import { createDocument, updateDocument } from "./fs-db.js";
import fs from "fs/promises";

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

  // GET /api/<collection> — list; POST — create
  routes.set(`/api/${name}s`, async (req: Request) => {
    if (req.method === "POST") {
      try {
        const body = await req.json() as { slug: string; fields: Record<string, any>; body?: string };
        if (!body.slug) {
          return new Response(JSON.stringify({ error: "slug is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        await fs.mkdir(dataDir, { recursive: true });
        await createDocument(dataDir, schema, body.slug, body.fields ?? {}, body.body);
        const doc = await getDocument(dataDir, body.slug);
        return new Response(JSON.stringify(doc), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        process.stderr.write(`[auto-api] POST /api/${name}s error: ${err}\n`);
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

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

  // GET /api/<collection>/:slug — single document; PUT — update
  routes.set(`/api/${name}s/:slug`, async (req: Request) => {
    const url = new URL(req.url);
    // Extract slug from the URL path — e.g. /api/tasks/my-task => "my-task"
    const prefix = `/api/${name}s/`;
    const slug = url.pathname.slice(prefix.length);

    if (req.method === "PUT") {
      try {
        const body = await req.json() as { fields: Record<string, any>; body?: string };
        await updateDocument(dataDir, schema, slug, body.fields ?? {}, body.body);
        const doc = await getDocument(dataDir, slug);
        return new Response(JSON.stringify(doc), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        process.stderr.write(`[auto-api] PUT /api/${name}s/${slug} error: ${err}\n`);
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

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
  const schemas = getAllSchemas();

  for (const schema of schemas.filter((s) => !s.parent)) {
    for (const [path, handler] of registerCollectionRoutes(schema, resolveDataDir(schema))) {
      combined.set(path, handler);
    }
  }

  for (const schema of schemas.filter((s) => s.parent)) {
    for (const [path, handler] of registerChildCollectionRoutes(schema)) {
      combined.set(path, handler);
    }
  }

  return combined;
}

/**
 * Add routes for a single schema into an existing shared route Map.
 * Call this at runtime after create_schema registers MCP tools so the new
 * schema gets HTTP routes without a server restart.
 */
export function addSchemaRoutes(
  routeMap: Map<string, (req: Request) => Promise<Response>>,
  schema: ResolvedSchema
): void {
  if (schema.parent) {
    for (const [path, handler] of registerChildCollectionRoutes(schema)) {
      routeMap.set(path, handler);
    }
    process.stderr.write(`[auto-api] added child routes for schema: ${schema.name} (parent: ${schema.parent})\n`);
  } else {
    for (const [path, handler] of registerCollectionRoutes(schema, resolveDataDir(schema))) {
      routeMap.set(path, handler);
    }
    process.stderr.write(`[auto-api] added routes for schema: ${schema.name}\n`);
  }
}
