import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export const claudeDirectory = () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
export async function configureStatusLine() {
  const directory = claudeDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const release = await lockfile.lock(directory, {
    realpath: false,
    stale: 30000,
    retries: { retries: 20, minTimeout: 20, maxTimeout: 100 },
  });
  try {
    const path = join(directory, "settings.json");
    const settings = JSON.parse(
      await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "{}";
        throw error;
      }),
    );
    const backup = join(directory, "personal-memory-statusline.json");
    const command = `${shellQuote(process.execPath)} ${shellQuote(fileURLToPath(import.meta.url))} statusline`;
    if (
      !settings.statusLine?.command?.includes("runtime.mjs' statusline") &&
      settings.statusLine?.command !== command
    ) {
      await writeFile(
        backup,
        JSON.stringify({ previous: settings.statusLine ?? null }, null, 2) + "\n",
        { mode: 0o600 },
      );
    }
    settings.statusLine = { type: "command", command };
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(settings, null, 2) + "\n", { mode: 0o600 });
    await rename(temporary, path);
    return { statusLine: "configured", previousStatusLine: "preserved" };
  } finally {
    await release();
  }
}
export async function renderStatusLine(label: string, input: string) {
  const backup = JSON.parse(
    await readFile(join(claudeDirectory(), "personal-memory-statusline.json"), "utf8").catch(
      () => "{}",
    ),
  );
  const command = backup.previous?.type === "command" ? backup.previous.command : undefined;
  if (typeof command === "string" && command && !command.includes("runtime.mjs' statusline")) {
    const output = await new Promise<string>((resolve) => {
      const child = spawn(command, { shell: true, stdio: ["pipe", "pipe", "ignore"] });
      let text = "";
      const timer = setTimeout(() => {
        child.kill();
        resolve("");
      }, 1500);
      child.stdout.on("data", (chunk) => {
        if (text.length < 10000) text += chunk;
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve("");
      });
      child.on("close", () => {
        clearTimeout(timer);
        resolve(text.trimEnd());
      });
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    });
    if (output) process.stdout.write(output + "\n");
  }
  process.stdout.write(label + "\n");
}
