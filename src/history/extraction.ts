import { validatePersonalEvidence } from "../domain/evidence.ts";
import {
  validateExtractionResult,
  validateReviewResult,
  personalReviewSupported,
} from "../domain/extraction.ts";
import type { CandidateOutput, StructuredCompletion } from "../domain/extraction.ts";
import type { ReviewStats } from "../domain/task.ts";
import type { State, Proposal, Scan } from "../domain/memory.ts";
import { isDuplicate, normalize, isLongTermChange, validateProposal } from "../domain/memory.ts";
import { searchMemories } from "../domain/search.ts";
import type { Snapshot, ConversationMessage } from "./sessions.ts";
import { extractionChunks, changedMessages, makeSource } from "./sessions.ts";

interface ExtractionInput {
  snapshot: Snapshot;
  previous?: Scan;
  state: State;
  contextWindow?: number;
}

function proposalFromEvidence(
  item: CandidateOutput,
  snapshot: Snapshot,
  messages: ConversationMessage[],
  allowed: Set<string>,
): Proposal {
  if (!allowed.has(item.entryId))
    throw new Error("Candidate does not originate in an allowed user message");
  const references = [{ entryId: item.entryId, quote: item.quote }, ...(item.evidence || [])];
  const sources = references
    .map((ref) => {
      if (
        !ref.quote.trim() ||
        !messages.some(
          (message) =>
            message.role === "user" &&
            message.id === ref.entryId &&
            message.text.includes(ref.quote),
        )
      )
        throw new Error("Evidence is not in this segment's original user messages");
      return makeSource(snapshot, ref.entryId, ref.quote);
    })
    .filter(
      (source, index, all) =>
        all.findIndex(
          (other) => other.entryId === source.entryId && other.quote === source.quote,
        ) === index,
    );
  const proposal: Proposal = {
    action: item.action,
    targetId: item.targetId,
    targetVersion: item.targetVersion,
    title: item.title,
    content: item.content,
    type: item.type,
    scope: item.scope,
    certainty: item.certainty,
    tags: item.tags,
    reason: item.reason,
    origin: "history",
    sources,
  };
  validateProposal(proposal);
  validatePersonalEvidence(proposal);
  return proposal;
}

function validCorrection(proposal: Proposal, state: State): boolean {
  if (proposal.action !== "update") return true;
  const old = state.memories.find(
    (memory) => memory.id === proposal.targetId && memory.version === proposal.targetVersion,
  );
  const previousTime = Math.max(
    0,
    ...(old?.sources.map((source) => Date.parse(source.timestamp) || 0) || []),
  );
  return Boolean(
    old &&
      previousTime &&
      isLongTermChange(proposal.sources[0].quote) &&
      Date.parse(proposal.sources[0].timestamp) > previousTime,
  );
}

/** Extract → validate evidence/value → independently review → accept. No file writes here. */
export async function extractCandidates(
  input: ExtractionInput,
  complete: StructuredCompletion,
  log: (text: string) => void = () => {},
  cancelled: () => boolean = () => false,
  report: (stats: ReviewStats) => void = () => {},
): Promise<Proposal[]> {
  const { snapshot, previous, state } = input;
  const budget = Math.max(
    4000,
    Math.min(24000, Math.floor(((input.contextWindow || 128000) - 6000) * 0.7)),
  );
  const chunks = extractionChunks(snapshot, previous, Math.floor(budget * 0.5));
  const allowed = new Set(
    changedMessages(snapshot, previous)
      .filter((message) => message.role === "user")
      .map((message) => message.id),
  );
  const accepted: Proposal[] = [];
  const stats: ReviewStats = { reviewed: 0, filtered: 0, duplicates: 0 };
  const checkCancelled = () => {
    if (cancelled()) throw new Error("Extraction cancelled");
  };
  log(`Read ${snapshot.messages.length} messages; ${allowed.size} user messages need analysis.`);
  for (let index = 0; index < chunks.length; index++) {
    checkCancelled();
    const messages = chunks[index];
    const segmentIds = new Set(
      messages
        .filter((message) => message.role === "user" && allowed.has(message.id))
        .map((message) => message.id),
    );
    if (!segmentIds.size) continue;
    log(`Reading segment ${index + 1}/${chunks.length}; finding reusable personal context.`);
    const pool = [
      ...state.memories,
      ...accepted.map((proposal, i) => ({
        ...proposal,
        id: `accepted:${i}`,
        version: 1,
        createdAt: "",
        updatedAt: "",
      })),
    ];
    const relevant = searchMemories(pool, messages.map((message) => message.text).join("\n"), 30);
    let existingSize = 0;
    const existing = relevant.filter((memory) => {
      const size = JSON.stringify(memory).length;
      if (existingSize + size > budget * 0.3) return false;
      existingSize += size;
      return true;
    });
    let indexSize = 0;
    const memoryIndex = pool
      .map((memory) => ({ id: memory.id, type: memory.type, title: memory.title }))
      .filter((record) => {
        indexSize += JSON.stringify(record).length;
        return indexSize <= budget * 0.2;
      });
    const conversation = messages.map(({ id, role, text, timestamp }) => ({
      id,
      role,
      text,
      timestamp,
      context: !segmentIds.has(id),
    }));
    const extracted = validateExtractionResult(
      await complete({
        stage: "extract",
        allowedUserIds: [...segmentIds],
        conversation,
        existingMemories: existing,
        memoryIndex,
        blockedSources: state.suppressed
          .filter(
            (key) =>
              key.startsWith("source:") &&
              messages.some((message) => key.includes(`:${message.id}:`)),
          )
          .slice(0, 30),
      }),
    );
    checkCancelled();
    const segment: Proposal[] = [];
    for (const item of extracted.candidates) {
      try {
        const proposal = proposalFromEvidence(item, snapshot, messages, segmentIds);
        if (!validCorrection(proposal, state))
          throw new Error("No newer user evidence of a correction");
        if (
          isDuplicate(state, proposal, proposal.targetId) ||
          [...accepted, ...segment].some(
            (other) => normalize(other.content) === normalize(proposal.content),
          )
        ) {
          stats.duplicates++;
        } else segment.push(proposal);
      } catch (error) {
        stats.filtered++;
        log(`Filtered candidate · ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (segment.length) {
      log(
        `Checking ${segment.length} ${segment.length === 1 ? "memory" : "memories"} against original words, scope and future value.`,
      );
      const reviewed = validateReviewResult(
        await complete({
          stage: "review",
          conversation: conversation.filter((message) => message.role === "user"),
          existingMemories: existing,
          memoryIndex,
          candidates: segment.map((proposal, i) => ({ index: i, ...proposal })),
        }),
        segment.length,
      );
      checkCancelled();
      for (const decision of reviewed.reviews.sort((a, b) => a.index - b.index)) {
        stats.reviewed++;
        const proposal = segment[decision.index];
        let keep = personalReviewSupported(decision, proposal);
        if (keep) {
          try {
            validatePersonalEvidence({
              ...proposal,
              sources: [{ ...proposal.sources[0], quote: decision.personalQuote }],
            });
          } catch {
            keep = false;
          }
        }
        if (keep) {
          accepted.push(proposal);
          log(`Verified: ${proposal.title}`);
        } else {
          stats.filtered++;
          log(`Not saved: ${proposal.title} · ${decision.reason}`);
        }
      }
    }
    report({ ...stats });
  }
  return accepted;
}
