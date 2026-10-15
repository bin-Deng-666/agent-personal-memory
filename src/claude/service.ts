import type { MemoryStore } from "../storage/store.ts";
import { CaptureSession } from "../application/capture.ts";
import { ClaudeSessions } from "./sessions.ts";
import type { ClaudeSession } from "./sessions.ts";
import { createProposal, memoryFields, TYPE_LABELS, CERTAINTY_LABELS } from "../domain/memory.ts";
import type { MemoryType } from "../domain/memory.ts";
import { habitContext, searchMemories } from "../domain/search.ts";
import { ClaudeExtraction } from "./extraction.ts";
import { listClaudeConversations } from "../history/claude.ts";
import { listPiConversations } from "../history/pi-files.ts";

export class ClaudeMemory {
  readonly sessions: ClaudeSessions;
  readonly tasks: ClaudeExtraction;
  private captures = new Map<string, { runId: string; capture: CaptureSession }>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly store: MemoryStore) {
    this.sessions = new ClaudeSessions(store.dir);
    this.tasks = new ClaudeExtraction(store.dir);
  }
  serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => {}).then(fn);
    this.queue = next;
    return next;
  }
  async context(sessionId: string) {
    const session = await this.sessions.read(sessionId),
      snapshot = await this.sessions.snapshot(session);
    let current = this.captures.get(sessionId);
    if (!current || current.runId !== session.runId) {
      const capture = new CaptureSession(this.store);
      capture.latestPrompt = session.prompt;
      capture.adviceMode = session.mode === "advice";
      capture.runStartIds = new Set(session.beforeIds);
      capture.runUserAnchor = session.anchor;
      current = { runId: session.runId, capture };
      this.captures.set(sessionId, current);
    }
    return { session, snapshot, capture: current.capture };
  }
  async status() {
    const settings = await this.store.settings();
    const summary = settings.enabled ? habitContext(await this.store.readType("稳定偏好")) : "";
    const loaded = summary.split("\n").filter(Boolean).length,
      total = await this.store.count();
    return {
      enabled: settings.enabled,
      total,
      loadedHabits: loaded,
      label: `Memory ${settings.enabled ? "On" : "Off"} · ${total} total · ${loaded} ${loaded === 1 ? "habit" : "habits"} loaded`,
      views: ["Library", "Extraction", "Advice"],
    };
  }
  async conversations() {
    const state = await this.store.read();
    return [...(await listPiConversations(state)), ...(await listClaudeConversations(state))].sort(
      (a, b) =>
        ({ "Not extracted": 0, Updated: 1, Extracted: 2 })[a.status] -
        { "Not extracted": 0, Updated: 1, Extracted: 2 }[b.status],
    );
  }
  async manage(
    session: ClaudeSession,
    params: {
      operation: string;
      id?: string;
      version?: number;
      content?: string;
      type?: MemoryType;
      enabled?: boolean;
      query?: string;
      offset?: number;
      limit?: number;
      paths?: string[];
      model?: string;
    },
  ) {
    const { operation } = params;
    if (operation === "status") return this.status();
    if (!["library", "extraction", "advice"].includes(session.mode))
      throw new Error(
        "Open /agent-personal-memory:memory to manage records, or use Advice for relevant retrieval",
      );
    if (operation === "toggle") {
      if (session.mode !== "library" || typeof params.enabled !== "boolean")
        throw new Error("Choose Memory On/Off in the memory menu");
      await this.store.setEnabled(params.enabled);
      if (!params.enabled)
        await Promise.all(
          (await this.tasks.list())
            .filter((t) => t.phase === "running")
            .map((t) => this.tasks.cancel(t.id)),
        );
      return this.status();
    }
    if (["list", "detail", "update", "delete"].includes(operation)) {
      if (session.mode !== "library") throw new Error("Open Library to manage saved memories");
      const state = await this.store.read();
      if (operation === "list") {
        const ranked = searchMemories(state.memories, params.query || "", state.memories.length),
          offset = params.offset || 0,
          limit = params.limit || 12;
        return {
          total: state.memories.length,
          matched: ranked.length,
          memories: ranked.slice(offset, offset + limit).map((m) => ({
            ...m,
            typeLabel: TYPE_LABELS[m.type],
            certaintyLabel: CERTAINTY_LABELS[m.certainty],
          })),
          nextOffset: offset + limit < ranked.length ? offset + limit : null,
        };
      }
      const memory = state.memories.find((m) => m.id === params.id);
      if (!memory) throw new Error("Memory not found; refresh Library");
      if (operation === "detail")
        return {
          memory,
          actions: ["Edit", "Original words", "Delete", "Back"],
          fields: ["Content", "Type"],
        };
      if (params.version !== memory.version)
        throw new Error("This memory changed in another session; refresh Library");
      const proposal = createProposal({
        ...memoryFields(memory),
        action: operation === "delete" ? "delete" : "update",
        targetId: memory.id,
        targetVersion: params.version,
        ...(params.content !== undefined ? { content: params.content } : {}),
        ...(params.type ? { type: params.type } : {}),
      });
      return { status: "applied", memory: await this.store.apply(proposal) };
    }
    if (operation === "conversations") return { conversations: await this.conversations() };
    if (operation === "tasks") return { tasks: await this.tasks.list() };
    if (operation === "task") {
      const task = (await this.tasks.list()).find((t) => t.id === params.id);
      if (!task) throw new Error("Task not found");
      return {
        task,
        log: (await this.tasks.log(task.id)).slice(-20000),
        memories: (await this.store.read()).memories.filter((m) => task.savedIds?.includes(m.id)),
        actions: ["Memories", "Log", "Cancel", "Retry", "Back"],
      };
    }
    if (operation === "cancel") {
      await this.tasks.cancel(params.id || "");
      return { status: "cancellation requested" };
    }
    if (operation === "start" || operation === "retry") {
      if (!(await this.store.settings()).enabled)
        throw new Error("Memory is off. Enable it to extract conversations.");
      const paths =
        operation === "retry"
          ? [(await this.tasks.list()).find((t) => t.id === params.id)?.sourcePath || ""]
          : params.paths || [];
      if (!paths.length || paths.length > 50)
        throw new Error("Select between 1 and 50 conversations");
      const allowed = await this.conversations();
      const selected = paths.map((path) => {
        const row = allowed.find((row) => row.path === path);
        if (!row) throw new Error("Select an available conversation from Extraction");
        return row;
      });
      return {
        tasks: await Promise.all(
          selected.map((row) => this.tasks.start(row.path, row.title, params.model)),
        ),
        status: "Extraction started. Keep chatting; progress is in Extraction.",
      };
    }
    throw new Error("Unknown memory operation");
  }
}
