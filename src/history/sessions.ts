import { readFile } from "node:fs/promises";
import { readClaudeSnapshot } from "./claude.ts";
import { digest } from "../domain/memory.ts";
import type { Scan, Source } from "../domain/memory.ts";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  fingerprint: string;
}
export interface Snapshot {
  host?: "pi" | "claude";
  sessionId: string;
  messages: ConversationMessage[];
  entries: Record<string, string>;
}
type ExtractionStatus = "未提取" | "已提取" | "有更新";
function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((x) => x?.type === "text" && typeof x.text === "string")
    .map((x) => x.text)
    .join("\n");
}
export function snapshotFromEntries(
  sessionId: string,
  entries: any[],
  leafId?: string | null,
): Snapshot {
  const byId = new Map(entries.filter((e) => e.id).map((e) => [e.id, e]));
  let id = leafId === undefined ? [...entries].reverse().find((e) => e.id)?.id : leafId;
  const branch: any[] = [];
  const visited = new Set<string>();
  while (id) {
    if (visited.has(id)) throw new Error("Session branch contains a cycle");
    visited.add(id);
    const entry = byId.get(id);
    if (!entry) throw new Error("Session branch is incomplete");
    branch.unshift(entry);
    id = entry.parentId;
  }
  // Use original messages even before compaction, but respect explicit context edits on this branch.
  const edits = new Map(
    branch.filter((e) => e.type === "context_edit").map((e) => [e.targetId, e.replacement]),
  );
  const messages: ConversationMessage[] = [];
  for (const e of branch) {
    if (e.type !== "message" || !["user", "assistant"].includes(e.message?.role)) continue;
    if (edits.has(e.id) && edits.get(e.id) === null) continue;
    const text = textContent(edits.has(e.id) ? edits.get(e.id) : e.message.content).trim();
    if (!text) continue;
    // Extension-generated advice requests are operations, not personal statements.
    if (text.startsWith("[个人记忆建议请求]")) continue;
    messages.push({
      id: e.id,
      role: e.message.role,
      text,
      timestamp: e.timestamp || "",
      fingerprint: digest(`${e.message.role}\n${text}`),
    });
  }
  return {
    sessionId,
    messages,
    entries: Object.fromEntries(messages.map((m) => [m.id, m.fingerprint])),
  };
}
export async function readSnapshot(path: string): Promise<Snapshot> {
  const raw = await readFile(path, "utf8");
  const lines = raw.split("\n");
  const entries: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    try {
      entries.push(JSON.parse(lines[i]));
    } catch {
      // A live session can have an incomplete final append; retry rather than checkpointing partial input.
      throw new Error(`Session is still being written or invalid at line ${i + 1}; retry shortly`);
    }
  }
  const header = entries.find((e) => e.type === "session");
  if (!header?.id) return readClaudeSnapshot(path);
  return snapshotFromEntries(header.id, entries);
}
export function extractionStatus(snapshot: Snapshot, scan?: Scan): ExtractionStatus {
  if (!scan) return "未提取";
  const ids = Object.keys(snapshot.entries);
  return ids.length === Object.keys(scan.entries).length &&
    ids.every((id) => scan.entries[id] === snapshot.entries[id])
    ? "已提取"
    : "有更新";
}
export function changedMessages(snapshot: Snapshot, scan?: Scan): ConversationMessage[] {
  return snapshot.messages.filter((m) => !scan || scan.entries[m.id] !== m.fingerprint);
}
export function extractionChunks(
  snapshot: Snapshot,
  scan?: Scan,
  budget = 24000,
): ConversationMessage[][] {
  const changed = new Set(changedMessages(snapshot, scan).map((m) => m.id));
  if (!changed.size) return [];
  const chunks: ConversationMessage[][] = [];
  let chunk: ConversationMessage[] = [];
  let size = 0;
  const expanded = snapshot.messages.flatMap((m) => {
    if (m.text.length <= budget) return [m];
    const parts: ConversationMessage[] = [];
    const step = Math.max(500, Math.floor(budget * 0.75));
    for (let start = 0; start < m.text.length; start += step)
      parts.push({ ...m, text: m.text.slice(start, start + step) });
    return parts;
  });
  for (let i = 0; i < expanded.length; i++) {
    const m = expanded[i];
    if (!changed.has(m.id)) continue;
    if (size + m.text.length > budget && chunk.length) {
      chunks.push(chunk);
      chunk = [];
      size = 0;
    }
    // Supply the preceding exchange for meaning without inviting extraction of old content.
    if (!chunk.length) {
      const context = expanded
        .slice(Math.max(0, i - 2), i)
        .filter((x) => x.text.length < Math.min(2500, budget * 0.1));
      chunk.push(...context);
      size += context.reduce((n, x) => n + x.text.length, 0);
    }
    chunk.push(m);
    size += m.text.length;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}
export function makeSource(snapshot: Snapshot, entryId: string, quote: string): Source {
  const message = snapshot.messages.find((m) => m.id === entryId && m.role === "user");
  if (!message || !quote.trim() || !message.text.includes(quote.trim()))
    throw new Error("Cite an exact quote from an original user message");
  return {
    ...(snapshot.host ? { host: snapshot.host } : {}),
    sessionId: snapshot.sessionId,
    entryId,
    fingerprint: message.fingerprint,
    quote: quote.trim(),
    timestamp: message.timestamp,
  };
}
