import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/** Select a Pi memory library without moving or overwriting existing records. */
export function resolveMemoryDir(options: { env?: NodeJS.ProcessEnv; home?: string } = {}): string {
  const env = options.env ?? process.env,
    home = options.home ?? homedir();
  if (env.PERSONAL_MEMORY_DIR) {
    if (!isAbsolute(env.PERSONAL_MEMORY_DIR))
      throw new Error("PERSONAL_MEMORY_DIR must be an absolute path");
    return resolve(env.PERSONAL_MEMORY_DIR);
  }
  if (env.PI_CODING_AGENT_DIR) return resolve(env.PI_CODING_AGENT_DIR, "memory");
  const primary = join(home, ".pi", "agent", "memory");
  // Retain an existing alternate library selected by earlier releases.
  const alternate = join(
    env.XDG_DATA_HOME || join(home, ".local", "share"),
    "agent-personal-memory",
  );
  const initialized = (dir: string) =>
    ["metadata.json", "memories.json", "settings.json"].some((file) => existsSync(join(dir, file)));
  if (resolve(primary) !== resolve(alternate) && initialized(primary) && initialized(alternate))
    throw new Error(
      "Two initialized memory libraries exist. Set PERSONAL_MEMORY_DIR to the library to use; neither directory was modified.",
    );
  return initialized(alternate) ? alternate : primary;
}
