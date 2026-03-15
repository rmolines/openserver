// Side-effect imports: each file calls defineSchema(), populating the global registry
import "./schemas/project.ts";
import "./schemas/task.ts";

import { getAllSchemas, createServer } from "openserver";

const server = createServer({
  schemas: getAllSchemas(),
  name: "openserver",
  version: "0.1.0",
  port: 3333,
  dataDir: "data",
  viewsDir: "src/views",
});

await server.start();
