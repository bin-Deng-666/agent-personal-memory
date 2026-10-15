import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MemoryStore } from "../../core/src/storage/store.ts";
const exec = promisify(execFile);
export function tmuxBinary() {
  const local = join(homedir(), ".local/share/agent-personal-memory-plugin/tools/bin/tmux");
  return existsSync(local) ? local : "tmux";
}
export const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export async function openPanel(store: MemoryStore) {
  if (!process.env.TMUX || !process.env.TMUX_PANE)
    throw new Error(
      "Same-window panel needs a tmux-backed Claude session. Restart Claude with personal-memory-claude (installed by setup). The status line works in ordinary Claude sessions too. No second window was opened.",
    );
  const directory = await mkdtemp(join(tmpdir(), "personal-memory-panel-"));
  const resultPath = join(directory, "result.json");
  try {
    const command = [process.execPath, fileURLToPath(import.meta.url), "panel", resultPath]
      .map(shellQuote)
      .join(" ");
    await exec(
      tmuxBinary(),
      [
        "display-popup",
        "-t",
        process.env.TMUX_PANE,
        "-w",
        "96%",
        "-h",
        "94%",
        "-T",
        "Personal Memory",
        "-e",
        `PERSONAL_MEMORY_DIR=${store.dir}`,
        "-e",
        `PATH=${process.env.PATH || ""}`,
        "-E",
        command,
      ],
      { timeout: 1_800_000, maxBuffer: 100_000 },
    );
    return JSON.parse(await readFile(resultPath, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
export async function launchClaude(args: string[]) {
  if (process.env.TMUX) {
    const child = spawn("claude", args, { stdio: "inherit", shell: false });
    await new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`Claude exited ${code}`)),
      );
    });
    return;
  }
  await exec(tmuxBinary(), ["-V"]).catch(() => {
    throw new Error(
      "Install tmux first (macOS: brew install tmux; Linux: your package manager), then run personal-memory-claude.",
    );
  });
  const command = ["claude", ...args].map(shellQuote).join(" ");
  const child = spawn(
    tmuxBinary(),
    ["-L", `personal-memory-${process.pid}`, "new-session", "-s", "claude", command],
    { stdio: "inherit", shell: false },
  );
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Terminal session exited ${code}`)),
    );
  });
}
