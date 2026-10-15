import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const marker = "<!-- Agent Personal Memory: managed shortcut -->";
export async function installShortcut() {
  const directory = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "commands");
  const path = join(directory, "personal-memory.md");
  const previous = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  if (previous && !previous.includes(marker))
    throw new Error(
      "A user-defined /personal-memory command already exists; it was preserved. Use /agent-personal-memory:personal-memory or choose a different shortcut.",
    );
  // This module is distributed inside claude/runtime.mjs, beside the commands directory.
  const command = await readFile(new URL("./commands/personal-memory.md", import.meta.url), "utf8");
  const content = command.replace(/\n---\n/, `\n---\n\n${marker}\n`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path, content, { mode: 0o600 });
  return {
    status: "installed",
    command: "/personal-memory",
    message:
      "Restart Claude Code to use /personal-memory. This shortcut uses the installed plugin; rerun setup after plugin updates.",
  };
}
