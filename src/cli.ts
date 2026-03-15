#!/usr/bin/env bun
import { createServer } from "./create-server.js";

createServer({
  schemas: [],
  transport: "stdio",
})
  .start()
  .catch((err: unknown) => {
    process.stderr.write(`[openserver] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
