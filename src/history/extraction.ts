import type { ReviewStats } from "../domain/task.ts";
import type { State, Proposal, Scan } from "../domain/memory.ts";
import { isDuplicate, normalize, isLongTermChange, validateProposal } from "../domain/memory.ts";
import { searchMemories } from "../domain/search.ts";
import type { Snapshot } from "./sessions.ts";
import { extractionChunks, changedMessages, makeSource } from "./sessions.ts";

interface ExtractionInput {
  snapshot: Snapshot;
  previous?: Scan;
  state: State;
  contextWindow?: number;
}
function output(text: string) {
  return JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
}
export async function extractCandidates(
  input: ExtractionInput,
  complete: (payload: unknown) => Promise<string>,
  log: (text: string) => void = () => {},
  cancelled: () => boolean = () => false,
  report: (stats: ReviewStats) => void = () => {},
): Promise<Proposal[]> {
  const { snapshot: snap, previous, state } = input;
  const budget = Math.max(
    4000,
    Math.min(24000, Math.floor(((input.contextWindow || 128000) - 6000) * 0.7)),
  );
  const chunks = extractionChunks(snap, previous, Math.floor(budget * 0.5));
  const allowed = new Set(
    changedMessages(snap, previous)
      .filter((m) => m.role === "user")
      .map((m) => m.id),
  );
  const candidates: Proposal[] = [];
  const stats: ReviewStats = { reviewed: 0, filtered: 0, duplicates: 0 };
  log(`Read ${snap.messages.length} messages; ${allowed.size} user messages need analysis.`);
  for (let i = 0; i < chunks.length; i++) {
    if (cancelled()) throw new Error("Extraction cancelled");
    const messages = chunks[i];
    const segmentIds = new Set(
      messages.filter((m) => m.role === "user" && allowed.has(m.id)).map((m) => m.id),
    );
    if (!segmentIds.size) continue;
    log(`Reading segment ${i + 1}/${chunks.length}; finding reusable personal context.`);
    const pool = [
      ...state.memories,
      ...candidates.map((p, n) => ({
        ...p,
        id: `accepted:${n}`,
        version: 1,
        createdAt: "",
        updatedAt: "",
      })),
    ];
    const relevant = searchMemories(pool, messages.map((m) => m.text).join("\n"), 30);
    const existing: unknown[] = [];
    let existingSize = 0;
    for (const m of relevant) {
      const record = {
        id: m.id,
        version: m.version,
        title: m.title,
        content: m.content,
        type: m.type,
        scope: m.scope,
        certainty: m.certainty,
        updatedAt: m.updatedAt,
        sources: m.sources,
      };
      const size = JSON.stringify(record).length;
      if (existingSize + size <= budget * 0.3) {
        existing.push(record);
        existingSize += size;
      }
    }
    const index: unknown[] = [];
    let indexSize = 0;
    for (const m of pool) {
      const record = { id: m.id, type: m.type, title: m.title };
      const size = JSON.stringify(record).length;
      if (indexSize + size > budget * 0.2) break;
      index.push(record);
      indexSize += size;
    }
    const conversation = messages.map((m) => ({ ...m, context: !segmentIds.has(m.id) }));
    const parsed = output(
      await complete({
        stage: "extract",
        allowedUserIds: [...segmentIds],
        existingMemories: existing,
        memoryIndex: index,
        blockedSources: state.suppressed
          .filter((k) => k.startsWith("source:") && messages.some((m) => k.includes(`:${m.id}:`)))
          .slice(0, 30),
        conversation,
      }),
    );
    if (cancelled()) throw new Error("Extraction cancelled");
    if (!Array.isArray(parsed?.candidates) || parsed.candidates.length > 5)
      throw new Error("Invalid model output; source checkpoint was preserved");
    const segment: Proposal[] = [];
    for (const item of parsed.candidates) {
      if (!item || !segmentIds.has(item.entryId) || !["add", "update"].includes(item.action))
        throw new Error("Candidate references an unauthorized message or action");
      if (
        item.evidence !== undefined &&
        (!Array.isArray(item.evidence) || item.evidence.length > 6)
      )
        throw new Error("Invalid candidate evidence");
      const refs = [{ entryId: item.entryId, quote: item.quote }, ...(item.evidence || [])];
      const sources = refs
        .map((ref) => {
          if (
            !ref ||
            typeof ref.quote !== "string" ||
            !messages.some(
              (m) => m.id === ref.entryId && m.role === "user" && m.text.includes(ref.quote.trim()),
            )
          )
            throw new Error("Evidence is not in this segment's original user messages");
          return makeSource(snap, ref.entryId, ref.quote);
        })
        .filter(
          (source, n, all) =>
            all.findIndex((s) => s.entryId === source.entryId && s.quote === source.quote) === n,
        );
      const p: Proposal = {
        action: item.action,
        targetId: item.targetId,
        targetVersion: item.targetVersion,
        title: item.title,
        content: item.content,
        type: item.type,
        scope: item.scope || "",
        certainty: item.certainty,
        tags: item.tags || [],
        reason: item.reason,
        origin: "history",
        sources,
      };
      validateProposal(p);
      if (p.action === "update") {
        const old = state.memories.find(
          (m) => m.id === p.targetId && m.version === p.targetVersion,
        );
        const previousTime = Math.max(
          0,
          ...(old?.sources.map((s) => Date.parse(s.timestamp) || 0) || []),
        );
        const currentTime = Date.parse(sources[0].timestamp) || 0;
        if (
          !old ||
          !isLongTermChange(sources[0].quote) ||
          !previousTime ||
          currentTime <= previousTime
        ) {
          stats.filtered++;
          continue;
        }
      }
      if (
        isDuplicate(state, p, p.targetId) ||
        [...candidates, ...segment].some((x) => normalize(x.content) === normalize(p.content))
      ) {
        stats.duplicates++;
        continue;
      }
      segment.push(p);
    }
    if (segment.length) {
      log(
        `Checking ${segment.length} ${segment.length === 1 ? "memory" : "memories"} against original words, scope and future value.`,
      );
      const review = output(
        await complete({
          stage: "review",
          conversation,
          existingMemories: existing,
          memoryIndex: index,
          candidates: segment.map((p, index) => ({ index, ...p })),
        }),
      );
      if (cancelled()) throw new Error("Extraction cancelled");
      if (!Array.isArray(review?.reviews) || review.reviews.length !== segment.length)
        throw new Error("Incomplete quality review; source checkpoint was preserved");
      const seen = new Set<number>();
      for (const decision of review.reviews) {
        if (
          !decision ||
          !Number.isInteger(decision.index) ||
          decision.index < 0 ||
          decision.index >= segment.length ||
          seen.has(decision.index) ||
          !["keep", "drop"].includes(decision.verdict) ||
          typeof decision.reason !== "string" ||
          !decision.reason.trim()
        )
          throw new Error("Invalid quality review; source checkpoint was preserved");
        seen.add(decision.index);
      }
      for (const decision of [...review.reviews].sort((a, b) => a.index - b.index)) {
        stats.reviewed++;
        if (decision.verdict === "keep") {
          candidates.push(segment[decision.index]);
          log(`Verified: ${segment[decision.index].title}`);
        } else {
          stats.filtered++;
          log(`Not saved: ${segment[decision.index].title} · ${decision.reason}`);
        }
      }
    }
    report({ ...stats });
  }
  return candidates;
}
