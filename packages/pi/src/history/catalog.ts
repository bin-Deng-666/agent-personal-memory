import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { State } from "../../../core/src/domain/memory.ts";
import type { ConversationSummary } from "../../../core/src/domain/task.ts";
import { listClaudeConversations } from "../../../core/src/history/claude.ts";
import { readSnapshot, extractionStatus } from "../../../core/src/history/sessions.ts";

const statuses = { 未提取: "Not extracted", 已提取: "Extracted", 有更新: "Updated" } as const;
const rank = { "Not extracted": 0, Updated: 1, Extracted: 2 };

export async function listConversations(
  ctx: ExtensionContext,
  state: State,
  sessionRoot: string,
  claudeRoot?: string,
): Promise<ConversationSummary[]> {
  const sessions = [
    ...new Map(
      [
        ...(await SessionManager.listAll(sessionRoot)),
        ...(await SessionManager.list(ctx.cwd, ctx.sessionManager.getSessionDir())),
      ].map((session) => [session.path, session]),
    ).values(),
  ];
  sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  const summaries = await Promise.all(
    sessions.map(async (session): Promise<ConversationSummary | null> => {
      try {
        const snapshot = await readSnapshot(session.path);
        const status = statuses[extractionStatus(snapshot, state.scans[snapshot.sessionId])];
        return {
          path: session.path,
          host: "pi",
          title: `[Pi] ${(session.name || session.firstMessage || "Untitled conversation")
            .replace(/\n/g, " ")
            .slice(0, 80)}`,
          status,
        };
      } catch {
        return null;
      }
    }),
  );
  return [...summaries, ...(await listClaudeConversations(state, claudeRoot))]
    .filter((s): s is ConversationSummary => s !== null)
    .sort((a, b) => rank[a.status] - rank[b.status]);
}
