import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ServerWebSocket } from "bun";
import type { ResolvedSchema } from "./schema-engine.js";
import { setDataDirPrefix } from "./schema-engine.js";
import { registerAllCollections } from "./auto-mcp.js";
import { registerAllRoutes } from "./auto-api.js";
import { startWatcher } from "./watcher.js";

export interface CreateServerOptions {
  schemas: ResolvedSchema[];
  dataDir?: string;       // default: "data"
  port?: number;          // default: 3333
  name?: string;          // default: "openserver"
  version?: string;       // default: "1.0.0"
  viewsDir?: string;      // default: "src/views"
}

export interface ServerHandle {
  start(): Promise<void>;
}

export function createServer(options: CreateServerOptions): ServerHandle {
  const {
    schemas,
    dataDir = "data",
    port = 3333,
    name = "openserver",
    version = "1.0.0",
    viewsDir = "src/views",
  } = options;

  // Set the global data dir prefix so resolveDataDir uses it
  setDataDirPrefix(dataDir);

  for (const schema of schemas) {
    process.stderr.write(`[createServer] schema ready: ${schema.name}\n`);
  }

  return {
    async start() {
      // 1. Create MCP server
      const mcpServer = new McpServer({ name, version });

      // 2. Register CRUD tools for all schemas
      registerAllCollections(mcpServer);

      // 3. Connect MCP via stdio
      const transport = new StdioServerTransport();
      await mcpServer.connect(transport);

      // 4. Build HTTP route map
      const apiRoutes = registerAllRoutes();

      // 5. WebSocket client tracking
      const wsClients = new Set<ServerWebSocket<unknown>>();

      const broadcast = (msg: string) => {
        for (const ws of wsClients) {
          ws.send(msg);
        }
      };

      // 6. Start HTTP + WebSocket server
      Bun.serve({
        port,
        fetch(req, bunServer) {
          // WebSocket upgrade
          if (bunServer.upgrade(req)) {
            return;
          }

          const url = new URL(req.url);
          const pathname = url.pathname;

          // Exact match
          const exactHandler = apiRoutes.get(pathname);
          if (exactHandler) {
            return exactHandler(req);
          }

          // Nested slug: /api/<parentPlural>/<parent_slug>/<childPlural>/<slug>
          const nestedSlugMatch = pathname.match(/^\/api\/(\w+)\/([^\/]+)\/(\w+)\/(.+)$/);
          if (nestedSlugMatch) {
            const nestedSlugPath = `/api/${nestedSlugMatch[1]}/:parent_slug/${nestedSlugMatch[3]}/:slug`;
            const nestedSlugHandler = apiRoutes.get(nestedSlugPath);
            if (nestedSlugHandler) {
              return nestedSlugHandler(req);
            }
          }

          // Nested list: /api/<parentPlural>/<parent_slug>/<childPlural>
          const nestedListMatch = pathname.match(/^\/api\/(\w+)\/([^\/]+)\/(\w+)$/);
          if (nestedListMatch) {
            const nestedListPath = `/api/${nestedListMatch[1]}/:parent_slug/${nestedListMatch[3]}`;
            const nestedListHandler = apiRoutes.get(nestedListPath);
            if (nestedListHandler) {
              return nestedListHandler(req);
            }
          }

          // Parameterized slug: /api/<collection>/<slug>
          const apiSlugMatch = pathname.match(/^\/api\/(\w+)\/(.+)$/);
          if (apiSlugMatch) {
            const collectionPath = `/api/${apiSlugMatch[1]}/:slug`;
            const slugHandler = apiRoutes.get(collectionPath);
            if (slugHandler) {
              return slugHandler(req);
            }
          }

          // Root welcome page
          if (pathname === "/") {
            return new Response(
              `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>OpenServer</title></head>
<body>
  <h1>OpenServer is running</h1>
  <p>MCP (stdio) and HTTP (port ${port}) are active.</p>
</body>
</html>`,
              { headers: { "Content-Type": "text/html" } }
            );
          }

          // Named view: serve <viewsDir>/<name>.html
          const viewName = pathname.slice(1);
          const viewPath = `${viewsDir}/${viewName}.html`;
          const file = Bun.file(viewPath);
          return file.exists().then((exists) => {
            if (exists) {
              return new Response(file, { headers: { "Content-Type": "text/html" } });
            }
            return new Response("Not Found", { status: 404 });
          });
        },
        websocket: {
          open(ws) {
            wsClients.add(ws);
          },
          close(ws) {
            wsClients.delete(ws);
          },
          message(_ws, _msg) {
            // no-op
          },
        },
      });

      process.stderr.write(`[openserver] running — MCP (stdio) + HTTP (port ${port})\n`);

      // 7. Start file watcher for live-reload
      startWatcher([dataDir, viewsDir], broadcast);
    },
  };
}
