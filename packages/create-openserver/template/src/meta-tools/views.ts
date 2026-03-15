import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from "path";
import fs from "fs/promises";

const AUTO_REFRESH_SCRIPT = `<script>
  const ws = new WebSocket('ws://localhost:3333');
  ws.onmessage = () => location.reload();
  ws.onclose = () => setTimeout(() => location.reload(), 1000);
</script>`;

function injectAutoRefresh(html: string): string {
  if (html.includes("</body>")) {
    return html.replace("</body>", `${AUTO_REFRESH_SCRIPT}\n</body>`);
  }
  return html + "\n" + AUTO_REFRESH_SCRIPT;
}

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
      const finalHtml = injectAutoRefresh(html);
      await fs.writeFile(filePath, finalHtml, "utf-8");
      process.stderr.write(`[openserver] wrote view: ${filePath}\n`);

      return {
        content: [
          {
            type: "text" as const,
            text: `View created: http://localhost:3333/${name}`,
          },
        ],
      };
    }
  );
}
