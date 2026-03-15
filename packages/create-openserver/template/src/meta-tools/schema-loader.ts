/**
 * schema-loader — eagerly imports all schema files at startup so that
 * registerAllCollections() and registerAllRoutes() see a populated registry.
 *
 * Uses top-level await so that `await import("./schema-loader.ts")` in
 * server.ts blocks until all schema files have been imported and their
 * defineSchema() side-effects have run.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Glob } from "bun";
import path from "path";

const projectRoot = new URL("../..", import.meta.url).pathname;
const schemasDir = path.join(projectRoot, "src/schemas");
const glob = new Glob("*.ts");

try {
  for await (const file of glob.scan({ cwd: schemasDir })) {
    const filePath = path.join(schemasDir, file);
    try {
      await import(filePath + "?loader=" + Date.now());
      process.stderr.write(`[schema-loader] loaded: ${file}\n`);
    } catch (err) {
      process.stderr.write(`[schema-loader] failed to load ${file}: ${err}\n`);
    }
  }
} catch {
  // schemasDir may not exist yet — that's fine
}

// register is required by server.ts meta-tool discovery; no-op here
// (the real registration happens in meta-tools/schemas.ts startup IIFE)
export function register(_server: McpServer): void {
  // intentionally empty — this module's value is the top-level await above
}
