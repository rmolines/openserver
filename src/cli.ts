#!/usr/bin/env bun
import { createServer } from "./create-server.js";

// Parse --transport and --port from process.argv
const args = process.argv.slice(2);

function getArgValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

const rawTransport = getArgValue("--transport");
const transport: "stdio" | "http" =
  rawTransport === "http" ? "http" : "stdio";

const rawPort = getArgValue("--port");
const port = rawPort !== undefined ? parseInt(rawPort, 10) : 3333;

if (rawTransport !== undefined && rawTransport !== "stdio" && rawTransport !== "http") {
  process.stderr.write(`[openserver] unknown --transport value "${rawTransport}", falling back to stdio\n`);
}

createServer({
  schemas: [],
  transport,
  port,
})
  .start()
  .catch((err: unknown) => {
    process.stderr.write(`[openserver] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
