import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Glob } from "bun";
import type { ServerWebSocket } from "bun";
import { startWatcher } from "./watcher";
import { registerAllCollections } from "./auto-mcp";
import { registerAllRoutes } from "./auto-api";

// MCP Server
const server = new McpServer({
  name: "openserver",
  version: "0.1.0",
});

// WebSocket client set
const wsClients = new Set<ServerWebSocket<unknown>>();

// Auto-discover and register meta-tools
const projectRoot = new URL("..", import.meta.url).pathname;
const metaToolsGlob = new Glob("src/meta-tools/*.ts");

for await (const file of metaToolsGlob.scan({ cwd: projectRoot })) {
  const absolutePath = `${projectRoot}/${file}`;
  try {
    const mod = await import(absolutePath);
    if (typeof mod.register === "function") {
      mod.register(server);
      process.stderr.write(`[openserver] registered meta-tool: ${file}\n`);
    } else {
      process.stderr.write(`[openserver] skipped (no register export): ${file}\n`);
    }
  } catch (err) {
    process.stderr.write(`[openserver] failed to load ${file}: ${err}\n`);
  }
}

// Register MCP tools for all defined schemas
registerAllCollections(server);

// Connect MCP via stdio
const transport = new StdioServerTransport();
await server.connect(transport);

// Build API route map for all defined schemas
const apiRoutes = registerAllRoutes();

// HTTP + WebSocket server
Bun.serve({
  port: 3333,
  fetch(req, bunServer) {
    // WebSocket upgrade
    if (bunServer.upgrade(req)) {
      return;
    }

    const url = new URL(req.url);
    const pathname = url.pathname;

    // Auto-API routes (exact match first)
    const exactHandler = apiRoutes.get(pathname);
    if (exactHandler) {
      return exactHandler(req);
    }

    // Auto-API routes (nested slug: /api/<parentPlural>/<parent_slug>/<childPlural>/<slug>)
    const nestedSlugMatch = pathname.match(/^\/api\/(\w+)\/([^\/]+)\/(\w+)\/(.+)$/);
    if (nestedSlugMatch) {
      const nestedSlugPath = `/api/${nestedSlugMatch[1]}/:parent_slug/${nestedSlugMatch[3]}/:slug`;
      const nestedSlugHandler = apiRoutes.get(nestedSlugPath);
      if (nestedSlugHandler) {
        return nestedSlugHandler(req);
      }
    }

    // Auto-API routes (nested list: /api/<parentPlural>/<parent_slug>/<childPlural>)
    const nestedListMatch = pathname.match(/^\/api\/(\w+)\/([^\/]+)\/(\w+)$/);
    if (nestedListMatch) {
      const nestedListPath = `/api/${nestedListMatch[1]}/:parent_slug/${nestedListMatch[3]}`;
      const nestedListHandler = apiRoutes.get(nestedListPath);
      if (nestedListHandler) {
        return nestedListHandler(req);
      }
    }

    // Auto-API routes (parameterized: /api/<collection>/<slug>)
    const apiSlugMatch = pathname.match(/^\/api\/(\w+)\/(.+)$/);
    if (apiSlugMatch) {
      const collectionPath = `/api/${apiSlugMatch[1]}/:slug`;
      const slugHandler = apiRoutes.get(collectionPath);
      if (slugHandler) {
        return slugHandler(req);
      }
    }

    // Root: welcome page
    if (pathname === "/") {
      return new Response(
        `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>OpenServer</title></head>
<body>
  <h1>OpenServer is running</h1>
  <p>MCP (stdio) and HTTP (port 3333) are active.</p>
</body>
</html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // Named view: serve src/views/<name>.html
    const name = pathname.slice(1);
    const viewPath = `${projectRoot}/src/views/${name}.html`;
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

process.stderr.write("OpenServer running — MCP (stdio) + HTTP (port 3333)\n");

startWatcher(["data", "src/views"], (msg) => {
  for (const ws of wsClients) {
    ws.send(msg);
  }
});

export { server, wsClients };
