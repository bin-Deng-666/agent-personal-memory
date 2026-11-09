import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import { digest } from "../domain/memory.ts";
import type { Scan } from "../domain/memory.ts";
import type { ConversationSummary } from "../domain/task.ts";
import { readSnapshot } from "./sessions.ts";

const statuses = { 未提取: "Not extracted", 已提取: "Extracted", 有更新: "Updated" } as const;
const rank = { "Not extracted": 0, Updated: 1, Extracted: 2 };

/**
 * A verdict already computed for one session file.
 *
 * Listing a library re-parses every session to compare its message fingerprints
 * against the extraction checkpoint, and that is the expensive part: measured on a
 * real library of 149 sessions and 235 MB it took 1273 ms. The panel rebuilds the
 * list after every action, so the delay landed where a person notices it — between
 * closing a memory and the dashboard coming back.
 *
 * A session that has not changed on disk cannot have changed its verdict, so the
 * verdict is stored with the inputs that can change it. The checkpoint can move
 * without the session file changing (re-extracting an old conversation), so the
 * fingerprint digest is kept as well: it answers the comparison without re-reading
 * the transcript.
 */
interface CachedStatus {
  /** File identity; `SessionManager` reports mtime as `modified`. */
  mtimeMs: number;
  sessionId: string;
  entriesDigest: string;
  /** `completedAt` of the scan the verdict used, or "" when there was none. */
  scanKey: string;
  status: ConversationSummary["status"];
}

const cache = new Map<string, CachedStatus>();

const entriesDigest = (entries: Record<string, string>) =>
  digest(
    Object.keys(entries)
      .sort()
      .map((id) => `${id}=${entries[id]}`)
      .join("\n"),
  );

/** The same rule as `extractionStatus`, decided from the digest instead of the file. */
const statusOf = (scan: Scan | undefined, cachedDigest: string): ConversationSummary["status"] =>
  scan === undefined
    ? statuses["未提取"]
    : entriesDigest(scan.entries) === cachedDigest
      ? statuses["已提取"]
      : statuses["有更新"];

/**
 * A cheap fingerprint of the session directory, used only to decide whether the
 * cached list of sessions is still current. It stats files rather than reading
 * them: 109 stats cost a few milliseconds, while asking Pi to rebuild the list
 * costs about 535 ms because it parses each transcript for its first message.
 */
async function signatureOf(root: string): Promise<string> {
  const parts: string[] = [];
  const projects = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const dir = join(root, project.name);
    for (const file of await readdir(dir).catch(() => [])) {
      if (!file.endsWith(".jsonl")) continue;
      const info = await stat(join(dir, file)).catch(() => undefined);
      if (info) parts.push(`${project.name}/${file}:${info.mtimeMs}:${info.size}`);
    }
  }
  return parts.sort().join("|");
}

let listCache: { root: string; signature: string; sessions: SessionInfo[] } | undefined;

async function sessionsIn(ctx: ExtensionContext, root: string): Promise<SessionInfo[]> {
  const signature = await signatureOf(root);
  if (listCache && listCache.root === root && listCache.signature === signature)
    return listCache.sessions;
  const sessions = [
    ...new Map(
      [
        ...(await SessionManager.listAll(root)),
        ...(await SessionManager.list(ctx.cwd, ctx.sessionManager.getSessionDir())),
      ].map((session) => [session.path, session]),
    ).values(),
  ];
  listCache = { root, signature, sessions };
  return sessions;
}

export async function listConversations(
  ctx: ExtensionContext,
  scanFor: (sessionId: string) => Promise<Scan | undefined>,
  sessionRoot: string,
): Promise<ConversationSummary[]> {
  const sessions = await sessionsIn(ctx, sessionRoot);
  sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  // Sessions that vanished from disk must not accumulate here.
  const live = new Set(sessions.map((session) => session.path));
  for (const path of cache.keys()) if (!live.has(path)) cache.delete(path);

  const summaries = await Promise.all(
    sessions.map(async (session): Promise<ConversationSummary | null> => {
      try {
        const mtimeMs = session.modified.getTime();
        const cached = cache.get(session.path);
        const entry =
          cached && cached.mtimeMs === mtimeMs
            ? await refresh(cached, scanFor)
            : await recompute(session.path, mtimeMs, scanFor);
        cache.set(session.path, entry);
        return {
          path: session.path,
          title: (session.name || session.firstMessage || "Untitled conversation")
            .replace(/\n/g, " ")
            .slice(0, 80),
          status: entry.status,
        };
      } catch {
        return null;
      }
    }),
  );
  return summaries
    .filter((s): s is ConversationSummary => s !== null)
    .sort((a, b) => rank[a.status] - rank[b.status]);
}

/** The file is unchanged: only the checkpoint can have moved. */
async function refresh(
  cached: CachedStatus,
  scanFor: (sessionId: string) => Promise<Scan | undefined>,
): Promise<CachedStatus> {
  const scan = await scanFor(cached.sessionId);
  const scanKey = scan?.completedAt ?? "";
  if (scanKey === cached.scanKey) return cached;
  return { ...cached, scanKey, status: statusOf(scan, cached.entriesDigest) };
}

async function recompute(
  path: string,
  mtimeMs: number,
  scanFor: (sessionId: string) => Promise<Scan | undefined>,
): Promise<CachedStatus> {
  const snapshot = await readSnapshot(path);
  const scan = await scanFor(snapshot.sessionId);
  const fingerprint = entriesDigest(snapshot.entries);
  return {
    mtimeMs,
    sessionId: snapshot.sessionId,
    entriesDigest: fingerprint,
    scanKey: scan?.completedAt ?? "",
    status: statusOf(scan, fingerprint),
  };
}
