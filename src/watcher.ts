import { watch } from "fs";

export function startWatcher(
  dirs: string[],
  broadcast: (msg: string) => void
): void {
  process.stderr.write(`[watcher] Watching: ${dirs.join(", ")}\n`);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastChangedPath = "";

  for (const dir of dirs) {
    try {
      watch(dir, { recursive: true }, (_event, filename) => {
        lastChangedPath = filename ?? dir;

        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
          const msg = JSON.stringify({ type: "refresh", path: lastChangedPath });
          broadcast(msg);
          debounceTimer = null;
        }, 500);
      });
    } catch (err) {
      process.stderr.write(`[watcher] Warning: skipping "${dir}" — ${err}\n`);
    }
  }
}
