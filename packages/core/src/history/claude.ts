import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { digest } from "../domain/memory.ts";
import type { Snapshot, ConversationMessage } from "./sessions.ts";
import type { State } from "../domain/memory.ts";
import type { ConversationSummary } from "../domain/task.ts";

export function snapshotFromClaudeEntries(sessionId: string, entries: any[]): Snapshot {
  const byId = new Map(entries.filter((e) => typeof e.uuid === "string").map((e) => [e.uuid, e]));
  let leaf = [...entries]
    .reverse()
    .find((e) => byId.has(e.uuid) && ["user", "assistant"].includes(e.type) && !e.isSidechain);
  const branch: any[] = [];
  const seen = new Set<string>();
  while (leaf) {
    if (seen.has(leaf.uuid)) throw new Error("Claude transcript contains a cycle");
    seen.add(leaf.uuid);
    branch.unshift(leaf);
    leaf = byId.get(leaf.parentUuid);
  }
  const messages: ConversationMessage[] = [];
  for (const e of branch) {
    if (!["user", "assistant"].includes(e.type) || e.isMeta || e.isCompactSummary || e.isSidechain)
      continue;
    const raw = e.message?.content;
    const text = (
      typeof raw === "string"
        ? raw
        : Array.isArray(raw)
          ? raw
              .filter((x) => x?.type === "text" && typeof x.text === "string")
              .map((x) => x.text)
              .join("\n")
          : ""
    ).trim();
    if (
      !text ||
      (e.type === "user" &&
        /^(?:<local-command|<command-|<task-notification|<system-reminder|\[个人记忆建议请求\])/.test(
          text,
        ))
    )
      continue;
    messages.push({
      id: e.uuid,
      role: e.type,
      text,
      timestamp: typeof e.timestamp === "string" ? e.timestamp : "",
      fingerprint: digest(`${e.type}\n${text}`),
    });
  }
  return {
    host: "claude",
    sessionId: `claude:${sessionId}`,
    messages,
    entries: Object.fromEntries(messages.map((m) => [m.id, m.fingerprint])),
  };
}
export async function readClaudeSnapshot(path: string, sessionId?: string): Promise<Snapshot> {
  const entries = (await readFile(path, "utf8"))
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  const id = sessionId || entries.find((e) => typeof e.sessionId === "string")?.sessionId;
  if (!id) throw new Error("Missing Claude session ID");
  return snapshotFromClaudeEntries(id, entries);
}
export async function listClaudeConversations(
  state: State,
  root = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects"),
): Promise<ConversationSummary[]> {
  const projects = await readdir(root, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const files = (
    await Promise.all(
      projects
        .filter((p) => p.isDirectory())
        .map(async (p) =>
          (await readdir(join(root, p.name)))
            .filter((name) => name.endsWith(".jsonl"))
            .map((name) => join(root, p.name, name)),
        ),
    )
  ).flat();
  const rows = await Promise.all(
    files.map(async (path) => {
      try {
        const snapshot = await readClaudeSnapshot(path);
        if (!snapshot.messages.some((m) => m.role === "user")) return null;
        const scan = state.scans[snapshot.sessionId];
        const status: ConversationSummary["status"] = !scan
          ? "Not extracted"
          : Object.keys(scan.entries).length === Object.keys(snapshot.entries).length &&
              Object.entries(snapshot.entries).every(
                ([id, fingerprint]) => scan.entries[id] === fingerprint,
              )
            ? "Extracted"
            : "Updated";
        return {
          path,
          host: "claude" as const,
          title: `[Claude Code] ${snapshot.messages
            .find((m) => m.role === "user")!
            .text.replace(/\n/g, " ")
            .slice(0, 80)}`,
          status,
          modified: (await stat(path)).mtimeMs,
        };
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((row) => row !== null).sort((a, b) => b.modified - a.modified);
}
