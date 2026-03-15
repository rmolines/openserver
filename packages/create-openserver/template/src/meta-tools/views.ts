import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from "path";
import fs from "fs/promises";

// Auto-refresh script is injected at serve-time by the server with the correct port.
// No static injection needed here.

export function register(server: McpServer) {
  server.tool(
    "create_view",
    {
      name: z.string(),
      html: z.string(),
    },
    async ({ name, html }) => {
      const projectRoot = new URL("../..", import.meta.url).pathname;
      const viewsDir = path.join(projectRoot, "src/views");
      const filePath = path.join(viewsDir, `${name}.html`);

      await fs.mkdir(viewsDir, { recursive: true });
      await fs.writeFile(filePath, html, "utf-8");
      process.stderr.write(`[openserver] wrote view: ${filePath}\n`);

      return {
        content: [
          {
            type: "text" as const,
            text: `View created: /${name}`,
          },
        ],
      };
    }
  );
}
