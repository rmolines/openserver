// Side-effect imports: each file calls defineSchema(), populating the global registry
import "./schemas/project.ts";
import "./schemas/task.ts";

import { getAllSchemas, createServer } from "openserver";

// TODO(3-custom-tools): meta-tools (schema-loader, schemas, tools, views) need the MCP
// server instance for registration. ServerHandle does not yet expose mcpServer.
// Meta-tool auto-discovery is deferred to that node.

const server = createServer({
  schemas: getAllSchemas(),
  name: "openserver",
  version: "0.1.0",
  port: 3333,
  dataDir: "data",
  viewsDir: "src/views",
});

await server.start();
