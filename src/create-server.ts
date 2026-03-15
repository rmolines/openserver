import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ServerWebSocket } from "bun";
import type { ZodType } from "zod";
import type { ResolvedSchema } from "./schema-engine.js";
import { setDataDirPrefix } from "./schema-engine.js";
import { registerAllCollections } from "./auto-mcp.js";
import { registerAllRoutes } from "./auto-api.js";
import { startWatcher } from "./watcher.js";

/**
 * Shared mutable route map for this server instance.
 * Exported so runtime callers (e.g. create_schema) can mutate it after start().
 * This module-level variable is intentionally a singleton per process — it is
 * populated by createServer() and remains stable so the fetch handler always
 * reads the latest routes without being restarted.
 */
export let sharedApiRoutes: Map<string, (req: Request) => Promise<Response>> | null = null;

export interface CustomToolDef {
  name: string;
  description?: string;
  inputSchema: Record<string, ZodType>;
  handler: (args: any) => Promise<any>;
}

export interface CreateServerOptions {
  schemas: ResolvedSchema[];
  dataDir?: string;       // default: "data"
  port?: number;          // default: 3333
  name?: string;          // default: "openserver"
  version?: string;       // default: "1.0.0"
  viewsDir?: string;      // default: "src/views"
  tools?: CustomToolDef[];
  transport?: "stdio" | "http";  // default: "stdio"
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
    tools = [],
    transport: transportMode = "stdio",
  } = options;

  setDataDirPrefix(dataDir);

  for (const schema of schemas) {
    process.stderr.write(`[createServer] schema ready: ${schema.name}\n`);
  }

  return {
    async start() {
      const mcpServer = new McpServer({ name, version });
      registerAllCollections(mcpServer);

      for (const tool of tools) {
        mcpServer.tool(tool.name, tool.description ?? "", tool.inputSchema, tool.handler);
        process.stderr.write(`[createServer] registered custom tool: ${tool.name}\n`);
      }

      // Set up MCP transport based on mode
      let httpMcpTransport: WebStandardStreamableHTTPServerTransport | null = null;

      if (transportMode === "http") {
        httpMcpTransport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
        });
        await mcpServer.connect(httpMcpTransport);
      } else {
        const stdioTransport = new StdioServerTransport();
        await mcpServer.connect(stdioTransport);
      }

      // Populate the shared mutable route map so runtime additions (e.g. via
      // create_schema) are immediately visible to the fetch handler below.
      sharedApiRoutes = registerAllRoutes();
      const apiRoutes = sharedApiRoutes;
      const wsClients = new Set<ServerWebSocket<unknown>>();
      const broadcast = (msg: string) => {
        for (const ws of wsClients) ws.send(msg);
      };

      Bun.serve({
        port,
        fetch(req, bunServer) {
          // WebSocket upgrade
          if (bunServer.upgrade(req)) {
            return;
          }

          const url = new URL(req.url);
          const pathname = url.pathname;

          // MCP HTTP transport route — must be matched before any other route
          if (pathname === "/mcp" && httpMcpTransport !== null) {
            return httpMcpTransport.handleRequest(req);
          }

          const exactHandler = apiRoutes.get(pathname);
          if (exactHandler) return exactHandler(req);

          const nestedSlugMatch = pathname.match(/^\/api\/(\w+)\/([^\/]+)\/(\w+)\/(.+)$/);
          if (nestedSlugMatch) {
            const handler = apiRoutes.get(`/api/${nestedSlugMatch[1]}/:parent_slug/${nestedSlugMatch[3]}/:slug`);
            if (handler) return handler(req);
          }

          const nestedListMatch = pathname.match(/^\/api\/(\w+)\/([^\/]+)\/(\w+)$/);
          if (nestedListMatch) {
            const handler = apiRoutes.get(`/api/${nestedListMatch[1]}/:parent_slug/${nestedListMatch[3]}`);
            if (handler) return handler(req);
          }

          const apiSlugMatch = pathname.match(/^\/api\/(\w+)\/(.+)$/);
          if (apiSlugMatch) {
            const handler = apiRoutes.get(`/api/${apiSlugMatch[1]}/:slug`);
            if (handler) return handler(req);
          }

          if (pathname === "/") {
            const mcpLabel = transportMode === "http" ? "MCP (HTTP)" : "MCP (stdio)";
            return new Response(
              `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>OpenServer</title></head>
<body>
  <h1>OpenServer is running</h1>
  <p>${mcpLabel} and HTTP (port ${port}) are active.</p>
</body>
</html>`,
              { headers: { "Content-Type": "text/html" } }
            );
          }

          const viewName = pathname.slice(1);
          const viewPath = `${viewsDir}/${viewName}.html`;
          const file = Bun.file(viewPath);
          return file.exists().then(async (exists) => {
            if (exists) {
              const html = await file.text();
              const wsScript = `<script>
  const ws = new WebSocket('ws://localhost:${port}');
  ws.onmessage = () => location.reload();
  ws.onclose = () => setTimeout(() => location.reload(), 1000);
</script>`;
              const injected = html.includes("</body>")
                ? html.replace("</body>", `${wsScript}\n</body>`)
                : html + "\n" + wsScript;
              return new Response(injected, { headers: { "Content-Type": "text/html" } });
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

      const mcpLabel = transportMode === "http" ? "MCP (HTTP /mcp)" : "MCP (stdio)";
      process.stderr.write(`[openserver] running — ${mcpLabel} + HTTP (port ${port})\n`);
      startWatcher([dataDir, viewsDir], broadcast);
    },
  };
}
