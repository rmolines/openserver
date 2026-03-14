import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Glob } from "bun";
import path from "path";
import fs from "fs/promises";

export function register(server: McpServer) {
  // create_tool — writes a new tool file and registers it dynamically
  server.tool(
    "create_tool",
    {
      name: z.string(),
      description: z.string(),
      inputSchema: z.record(z.string(), z.any()).optional(),
      handler: z.string(),
    },
    async ({ name, description, inputSchema, handler }) => {
      const projectRoot = new URL("../../..", import.meta.url).pathname;
      const toolsDir = path.join(projectRoot, "src/tools");
      const filePath = path.join(toolsDir, `${name}.ts`);

      const schemaJson = JSON.stringify(inputSchema ?? {}, null, 2);
      const fileContent = `export const description = ${JSON.stringify(description)};
export const inputSchema = ${schemaJson};
export default async function(args: any) {
  ${handler}
}
`;

      await fs.mkdir(toolsDir, { recursive: true });
      await fs.writeFile(filePath, fileContent, "utf-8");
      process.stderr.write(`[openserver] wrote tool file: ${filePath}\n`);

      // Dynamically import with cache-busting
      const mod = await import(path.resolve(filePath) + "?t=" + Date.now());
      server.tool(name, mod.inputSchema || {}, mod.default);
      process.stderr.write(`[openserver] registered tool: ${name}\n`);

      server.sendToolListChanged();

      return {
        content: [{ type: "text" as const, text: `Tool '${name}' created and registered` }],
      };
    }
  );

  // list_tools — lists all tools from src/tools/ plus dynamically registered ones
  server.tool("list_tools", async () => {
    const projectRoot = new URL("../../..", import.meta.url).pathname;
    const toolsDir = path.join(projectRoot, "src/tools");

    const results: { name: string; description: string }[] = [];

    try {
      const glob = new Glob("*.ts");
      for await (const file of glob.scan({ cwd: toolsDir })) {
        const filePath = path.join(toolsDir, file);
        try {
          const mod = await import(filePath + "?t=" + Date.now());
          const toolName = file.replace(/\.ts$/, "");
          results.push({
            name: toolName,
            description: mod.description ?? "(no description)",
          });
        } catch (err) {
          process.stderr.write(`[openserver] failed to import ${file}: ${err}\n`);
        }
      }
    } catch {
      // toolsDir may not exist yet
    }

    const text =
      results.length === 0
        ? "No tools registered."
        : results.map((t) => `- ${t.name}: ${t.description}`).join("\n");

    return {
      content: [{ type: "text" as const, text }],
    };
  });

  // Startup: load existing tools from src/tools/
  (async () => {
    const projectRoot = new URL("../../..", import.meta.url).pathname;
    const toolsDir = path.join(projectRoot, "src/tools");

    try {
      const glob = new Glob("*.ts");
      for await (const file of glob.scan({ cwd: toolsDir })) {
        const filePath = path.join(toolsDir, file);
        try {
          const mod = await import(filePath);
          const toolName = file.replace(/\.ts$/, "");
          server.tool(toolName, mod.inputSchema || {}, mod.default);
          process.stderr.write(`[openserver] loaded existing tool: ${toolName}\n`);
        } catch (err) {
          process.stderr.write(`[openserver] failed to load existing tool ${file}: ${err}\n`);
        }
      }
    } catch {
      // toolsDir may not exist yet
    }
  })();
}
