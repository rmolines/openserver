import type { ResolvedSchema } from "./schema-engine.js";
import { setDataDirPrefix } from "./schema-engine.js";

export interface CreateServerOptions {
  schemas: ResolvedSchema[];
  dataDir?: string;     // default: "data"
  port?: number;        // default: 3333
  name?: string;        // default: "openserver"
  version?: string;     // default: "1.0.0"
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
  } = options;

  // Set the global data dir prefix
  setDataDirPrefix(dataDir);

  // Verify schemas are registered
  for (const schema of schemas) {
    process.stderr.write(`[createServer] schema ready: ${schema.name}\n`);
  }

  return {
    async start() {
      // Will be implemented in D2
      process.stderr.write(`[createServer] start() called — placeholder\n`);
    }
  };
}
