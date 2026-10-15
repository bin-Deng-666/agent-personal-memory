import {
  createProposal,
  memoryFields,
  isDuplicate,
  isLongTermChange,
  validateProposal,
} from "../domain/memory.ts";
import type { MemoryType, Memory } from "../domain/memory.ts";
import { contentKey } from "../domain/memory.ts";
import { searchMemories } from "../domain/search.ts";
import { makeSource } from "../history/sessions.ts";
import type { Snapshot } from "../history/sessions.ts";
import type { MemoryStore } from "../storage/store.ts";

const explicitRequest =
  /(记住|记下来|忘记|忘掉|(?:保存|收录|记录|删除|修改|更新|纠正)[\s\S]{0,24}(?:记忆|那条|这条)|(?:这条|那条|记忆)[\s\S]{0,24}(?:删|改|更新|记错)|\b(?:remember|forget|save|delete|remove|correct|update)\b)/iu;
export interface WriteInput {
  action: "add" | "update" | "delete";
  targetId?: string;
  targetVersion?: number;
  title?: string;
  content?: string;
  type?: MemoryType;
  scope?: string;
  certainty?: Memory["certainty"];
  tags?: string[];
  reason: string;
  entryId: string;
  quote: string;
  evidence?: { entryId: string; quote: string }[];
  explicitRequestQuote?: string;
}
/** Evidence and write policy shared by both host adapters. */
export class CaptureSession {
  queried = new Set<string>();
  autoWrites = 0;
  latestPrompt = "";
  adviceMode = false;
  runStartIds = new Set<string>();
  runUserAnchor = "";
  constructor(readonly store: MemoryStore) {}
  begin(snapshot: Snapshot, prompt: string, advice = false) {
    this.latestPrompt = prompt;
    this.autoWrites = 0;
    this.adviceMode = advice;
    this.runStartIds = new Set(snapshot.messages.map((m) => m.id));
    this.runUserAnchor =
      [...snapshot.messages].reverse().find((m) => m.role === "user" && m.text === prompt)?.id ||
      "";
  }
  async search(params: {
    query?: string;
    id?: string;
    type?: MemoryType;
    offset?: number;
    limit?: number;
  }) {
    if (!(await this.store.settings()).enabled) return { status: "disabled" };
    const state = await this.store.read();
    const pool = params.type
      ? state.memories.filter((m) => m.type === params.type)
      : state.memories;
    const ranked = params.id
      ? pool.filter((m) => m.id === params.id)
      : searchMemories(pool, params.query || "", pool.length);
    const offset = params.offset || 0;
    const memories = ranked.slice(offset, offset + (params.limit || 12));
    memories.forEach((m) => this.queried.add(`${m.id}:${m.version}`));
    return {
      memories: this.adviceMode
        ? memories
        : memories.map((m) =>
            m.type === "稳定偏好"
              ? m
              : {
                  id: m.id,
                  version: m.version,
                  type: m.type,
                  title: m.title,
                  contentDigest: contentKey(m.content),
                },
          ),
      purpose: this.adviceMode ? "advice" : "deduplication",
      total: state.memories.length,
      matched: ranked.length,
      nextOffset: offset + memories.length < ranked.length ? offset + memories.length : null,
    };
  }
  async write(params: WriteInput, snapshot: Snapshot, signal?: AbortSignal) {
    if (!(await this.store.settings()).enabled) return { status: "disabled" };
    if (signal?.aborted) return { status: "cancelled" };
    const sources = [{ entryId: params.entryId, quote: params.quote }, ...(params.evidence || [])]
      .map((ref) => makeSource(snapshot, ref.entryId, ref.quote))
      .filter(
        (s, i, all) => all.findIndex((x) => x.entryId === s.entryId && x.quote === s.quote) === i,
      );
    const explicit =
      !!params.explicitRequestQuote &&
      this.latestPrompt.includes(params.explicitRequestQuote) &&
      explicitRequest.test(params.explicitRequestQuote);
    if (params.explicitRequestQuote && !explicit)
      throw new Error("A past message is not a current memory-management request");
    if (
      !explicit &&
      sources.some((s) => s.entryId !== this.runUserAnchor && this.runStartIds.has(s.entryId))
    )
      throw new Error(
        "Automatic writes must cite this run's user messages; use the Extraction view for historical extraction",
      );
    const state = await this.store.read();
    const old = state.memories.find((m) => m.id === params.targetId);
    if (
      params.action !== "add" &&
      (!old || !this.queried.has(`${params.targetId}:${params.targetVersion}`))
    )
      throw new Error("Search for the latest memory ID and version first");
    if (
      params.action === "delete" &&
      (!explicit ||
        !/(忘记|忘掉|删|移除|不要保留|\b(?:forget|delete|remove)\b)/iu.test(
          params.explicitRequestQuote!,
        ))
    )
      throw new Error("Deletion requires a current explicit forget/delete request");
    if (params.action === "update" && !explicit && !isLongTermChange(sources[0].quote))
      throw new Error("No clear correction or long-term change; keep the existing memory");
    if (params.action === "add" && (!params.content || !params.title || !params.type))
      throw new Error("New memories require content, title and type");
    const p = createProposal({
      ...(old ? memoryFields(old) : {}),
      ...params,
      origin: explicit ? "explicit" : "automatic",
      sources,
    });
    validateProposal(p);
    if (p.action === "add" && isDuplicate(state, p) && !explicit) return { status: "duplicate" };
    if (!explicit && this.autoWrites >= 3)
      return {
        status: "limit",
        message: "Three automatic memories were saved this run; focus on the user's task",
      };
    if (signal?.aborted) return { status: "cancelled" };
    const saved = await this.store.apply(p);
    if (!explicit) this.autoWrites++;
    return {
      status: "applied",
      action: p.action,
      id: saved?.id || p.targetId,
      version: saved?.version,
      silent: true,
    };
  }
}
