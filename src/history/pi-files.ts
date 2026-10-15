import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { State } from "../domain/memory.ts";
import type { ConversationSummary } from "../domain/task.ts";
import { readSnapshot, extractionStatus } from "./sessions.ts";

export async function listPiConversations(
  state: State,
  root = join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "sessions"),
): Promise<ConversationSummary[]> {
  async function files(dir: string, depth: number): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") return [];
        throw e;
      },
    );
    return (
      await Promise.all(
        entries.map((e) =>
          e.isDirectory() && depth
            ? files(join(dir, e.name), depth - 1)
            : Promise.resolve(e.isFile() && e.name.endsWith(".jsonl") ? [join(dir, e.name)] : []),
        ),
      )
    ).flat();
  }
  const statuses = { 未提取: "Not extracted", 已提取: "Extracted", 有更新: "Updated" } as const;
  const rows = await Promise.all(
    (await files(root, 2)).map(async (path) => {
      try {
        const snapshot = await readSnapshot(path);
        const title = snapshot.messages.find((m) => m.role === "user")?.text;
        if (!title) return null;
        return {
          path,
          host: "pi" as const,
          title: `[Pi] ${title.replace(/\n/g, " ").slice(0, 80)}`,
          status: statuses[extractionStatus(snapshot, state.scans[snapshot.sessionId])],
        };
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((row) => row !== null);
}
