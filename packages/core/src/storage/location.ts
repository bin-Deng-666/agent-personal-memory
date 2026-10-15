import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/** One resolver for every host and worker. Existing Pi stores stay in place. */
export function resolveMemoryDir(options: { env?: NodeJS.ProcessEnv; home?: string } = {}): string {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  if (env.PERSONAL_MEMORY_DIR) {
    if (!isAbsolute(env.PERSONAL_MEMORY_DIR))
      throw new Error("PERSONAL_MEMORY_DIR must be an absolute path");
    return resolve(env.PERSONAL_MEMORY_DIR);
  }
  // Preserve explicitly configured Pi installations, including isolated SDK sessions.
  if (env.PI_CODING_AGENT_DIR) return resolve(env.PI_CODING_AGENT_DIR, "memory");
  const legacy = join(home, ".pi", "agent", "memory");
  const canonical = join(
    env.XDG_DATA_HOME || join(home, ".local", "share"),
    "agent-personal-memory",
  );
  if (!isAbsolute(canonical)) throw new Error("XDG_DATA_HOME must be an absolute path");
  const initialized = (dir: string) =>
    ["metadata.json", "memories.json", "settings.json"].some((file) => existsSync(join(dir, file)));
  if (resolve(canonical) !== resolve(legacy) && initialized(legacy) && initialized(canonical))
    throw new Error(
      "Both legacy Pi and shared memory stores exist. Set PERSONAL_MEMORY_DIR to the library both hosts should use; neither store was modified.",
    );
  return initialized(legacy) ? legacy : canonical;
}
