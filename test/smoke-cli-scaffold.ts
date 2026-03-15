/**
 * Smoke test: validates the create-openserver CLI scaffolds a functional project.
 *
 * Steps:
 * 1. Run the local create-openserver CLI to scaffold a project in a temp dir
 * 2. Patch the scaffolded package.json to resolve "openserver" from the local dist/
 * 3. Run `bun install` in the scaffolded project
 * 4. Start the server with `bun run dev`
 * 5. Poll localhost:3333 until ready (or timeout)
 * 6. Assert HTTP 200 on /
 * 7. Assert stderr has no fatal errors
 * 8. Kill the server and clean up
 */

import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "bun";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CLI_BIN = path.join(REPO_ROOT, "packages/create-openserver/bin/create-openserver.mjs");
const SERVER_PORT = 3333;
const POLL_INTERVAL_MS = 500;
const READY_TIMEOUT_MS = 25_000;

async function pollReady(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.status === 200) return true;
    } catch {
      // not ready yet — keep polling
    }
    await Bun.sleep(POLL_INTERVAL_MS);
  }
  return false;
}

test(
  "create-openserver CLI scaffolds a working project",
  async () => {
    const tmpBase = await mkdtemp(path.join(tmpdir(), "os-smoke-test-"));
    const projectDir = path.join(tmpBase, "os-smoke-app");

    let serverProc: ReturnType<typeof spawn> | null = null;
    let stderrOutput = "";

    try {
      // ── 1. Scaffold ────────────────────────────────────────────────────────
      const scaffold = spawn(["node", CLI_BIN, projectDir], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: tmpBase,
      });

      const scaffoldExitCode = await scaffold.exited;
      expect(scaffoldExitCode).toBe(0);

      // ── 2. Patch package.json — point openserver to local dist/ ───────────
      const pkgPath = path.join(projectDir, "package.json");
      const pkgRaw = await readFile(pkgPath, "utf8");
      const pkg = JSON.parse(pkgRaw);
      pkg.dependencies.openserver = `file:${REPO_ROOT}`;
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2));

      // ── 3. bun install ─────────────────────────────────────────────────────
      const install = spawn(["bun", "install"], {
        cwd: projectDir,
        stdout: "pipe",
        stderr: "pipe",
      });

      const installExitCode = await install.exited;
      expect(installExitCode).toBe(0);

      // ── 4. Start server ────────────────────────────────────────────────────
      serverProc = spawn(["bun", "run", "dev"], {
        cwd: projectDir,
        stdout: "pipe",
        stderr: "pipe",
      });

      // Collect stderr in background (non-blocking)
      (async () => {
        const reader = serverProc!.stderr;
        if (!reader) return;
        const decoder = new TextDecoder();
        for await (const chunk of reader) {
          stderrOutput += decoder.decode(chunk);
        }
      })();

      // ── 5. Poll until ready ────────────────────────────────────────────────
      const ready = await pollReady(`http://localhost:${SERVER_PORT}/`, READY_TIMEOUT_MS);
      expect(ready).toBe(true);

      // ── 6. Validate HTTP 200 ───────────────────────────────────────────────
      const res = await fetch(`http://localhost:${SERVER_PORT}/`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("OpenServer");

      // ── 7. Assert no fatal errors in stderr ───────────────────────────────
      // "Tool X is already registered" warnings are known/expected — ignore them.
      // Fatal patterns to check against: uncaught exceptions, module-not-found.
      const fatalPatterns = [
        /Cannot find module/,
        /Error: ENOENT/,
        /Uncaught.*Error/,
        /\[ERROR\]/,
        /TypeError:/,
        /ReferenceError:/,
      ];

      for (const pattern of fatalPatterns) {
        if (pattern.test(stderrOutput)) {
          // Filter out known-safe duplicate tool registration lines
          const filteredLines = stderrOutput
            .split("\n")
            .filter((line) => !line.includes("is already registered"));
          const filteredOutput = filteredLines.join("\n");

          if (pattern.test(filteredOutput)) {
            throw new Error(
              `Fatal pattern "${pattern}" found in stderr:\n${filteredOutput.slice(0, 2000)}`
            );
          }
        }
      }
    } finally {
      // ── 8. Kill server and clean up ────────────────────────────────────────
      if (serverProc) {
        serverProc.kill("SIGTERM");
        // Give it a moment to exit gracefully; ignore errors
        await Promise.race([serverProc.exited, Bun.sleep(2000)]);
      }
      await rm(tmpBase, { recursive: true, force: true });
    }
  },
  { timeout: 30_000 }
);
