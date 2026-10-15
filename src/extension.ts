import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { getAgentDir, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { MemoryStore } from "./storage/store.ts";
import {
  TYPES,
  isDuplicate,
  contentKey,
  isLongTermChange,
  validateProposal,
  createProposal,
  memoryFields,
} from "./domain/memory.ts";
import { habitContext, searchMemories } from "./domain/search.ts";
import { snapshotFromEntries, makeSource } from "./history/sessions.ts";
import { TaskManager } from "./agents/tasks.ts";
import { openMemoryPanel } from "./application/panel.ts";
import { MEMORY_RULES } from "./domain/prompts.ts";
import { installMemoryFooter } from "./ui/footer.ts";
import { silentTool } from "./ui/screen.ts";

const explicitRequest =
  /(记住|记下来|忘记|忘掉|(?:保存|收录|记录|删除|修改|更新|纠正)[\s\S]{0,24}(?:记忆|那条|这条)|(?:这条|那条|记忆)[\s\S]{0,24}(?:删|改|更新|记错))/u;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  details: value,
});
const toolNames = ["memory_search", "memory_write"];
export default function memoryExtension(pi: ExtensionAPI) {
  const agentDir = getAgentDir();
  const store = new MemoryStore(join(agentDir, "memory"));
  const tasks = new TaskManager(store.dir);
  let queried = new Set<string>();
  let loadedHabits = 0;
  let habitSummary = "";
  let latestPrompt = "";
  let adviceMode = false;
  let runStartIds = new Set<string>();
  let runUserAnchor = "";
  let autoWrites = 0;
  let monitor: ReturnType<typeof setInterval> | undefined;
  let generation = 0;
  let managing = false;
  let footerContext: ExtensionContext;
  let refreshFooter: (() => Promise<void>) | undefined;
  const mutate = <T>(fn: () => Promise<T>) => withFileMutationQueue(store.file, fn);
  const snapshot = (ctx: ExtensionContext) =>
    snapshotFromEntries(
      ctx.sessionManager.getSessionId(),
      ctx.sessionManager.getEntries(),
      ctx.sessionManager.getLeafId(),
    );
  function notify(
    ctx: ExtensionContext,
    text: string,
    type: "info" | "warning" | "error" = "info",
  ) {
    if (ctx.hasUI) ctx.ui.notify(text, type);
  }
  function syncTools(enabled: boolean) {
    const active = pi.getActiveTools();
    const next = active.filter((name) => !toolNames.includes(name));
    if (enabled && !process.argv.some((arg) => arg === "--no-tools" || arg === "-nt"))
      next.push(...toolNames);
    if (active.length !== next.length || active.some((name, i) => name !== next[i]))
      pi.setActiveTools(next);
  }
  async function status(ctx: ExtensionContext, alive: () => boolean = () => true) {
    const settings = await store.settings();
    const jobs = await tasks.list();
    if (alive()) {
      syncTools(settings.enabled);
      const summary = settings.enabled ? habitContext(await store.readType("稳定偏好")) : "";
      if (!alive()) return { settings, jobs };
      habitSummary = summary;
      loadedHabits = summary.split("\n").filter(Boolean).length;
      if (ctx.hasUI) {
        const running = jobs.filter((t) => t.phase === "running").length;
        const total = await store.count();
        if (!alive()) return { settings, jobs };
        const loaded = settings.enabled ? loadedHabits : 0;
        const line = `Memory ${settings.enabled ? "On" : "Off"} · ${total} total · ${loaded} ${loaded === 1 ? "habit" : "habits"} loaded${running ? ` · ${running} extracting` : ""}`;
        footerContext = ctx;
        await refreshFooter?.().catch(() => {});
        if (!alive()) return { settings, jobs };
        ctx.ui.setStatus("personal-memory", ctx.ui.theme.fg("dim", line));
      }
    }
    return { settings, jobs };
  }
  pi.registerCommand("memory", {
    description: "Personal memory: library, background extraction, advice and On/Off",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      if (ctx.mode !== "tui") {
        notify(ctx, "/memory requires the interactive terminal", "warning");
        return;
      }
      if (managing) return;
      managing = true;
      const current = generation;
      try {
        await openMemoryPanel({
          pi,
          ctx,
          store,
          tasks,
          agentDir,
          getLoadedHabits: () => loadedHabits,
          onChanged: async () => {
            await status(ctx);
          },
          setEnabled: async (enabled) => {
            await mutate(() => store.setEnabled(enabled));
            syncTools(enabled);
            if (!enabled) {
              loadedHabits = 0;
              const jobs = await tasks.list();
              await Promise.all(
                jobs.filter((t) => t.phase === "running").map((t) => tasks.cancel(t.id)),
              );
            }
            await status(ctx);
          },
        });
      } catch (e) {
        notify(ctx, errorText(e), "error");
      } finally {
        if (current === generation) {
          managing = false;
          void status(ctx, () => current === generation).catch(() => {});
        }
      }
    },
  });
  pi.registerTool({
    name: "memory_search",
    label: "Memory search",
    defaultActive: false,
    renderShell: "self",
    renderCall: silentTool,
    renderResult: silentTool,
    description:
      "Search personal memories by keyword/type/ID, with offset pagination. Search before writing to avoid semantic duplicates; updates/deletions require a retrieved ID and version.",
    parameters: Type.Object({
      query: Type.Optional(Type.String()),
      id: Type.Optional(Type.String()),
      type: Type.Optional(Type.Union(TYPES.map((t) => Type.Literal(t)))),
      offset: Type.Optional(Type.Integer({ minimum: 0 })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    async execute(_id, params) {
      if (!(await store.settings()).enabled) return result({ status: "disabled" });
      const state = await store.read();
      const pool = params.type
        ? state.memories.filter((m) => m.type === params.type)
        : state.memories;
      const ranked = params.id
        ? pool.filter((m) => m.id === params.id)
        : searchMemories(pool, params.query || "", pool.length);
      const offset = params.offset || 0;
      const memories = ranked.slice(offset, offset + (params.limit || 12));
      memories.forEach((m) => queried.add(`${m.id}:${m.version}`));
      const values = adviceMode
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
          );
      return result({
        memories: values,
        purpose: adviceMode ? "advice" : "deduplication",
        total: state.memories.length,
        matched: ranked.length,
        nextOffset: offset + memories.length < ranked.length ? offset + memories.length : null,
      });
    },
  });
  pi.registerTool({
    name: "memory_write",
    label: "Memory write",
    defaultActive: false,
    executionMode: "sequential",
    renderShell: "self",
    renderCall: silentTool,
    renderResult: silentTool,
    description:
      "Silently save valuable personal content; do not announce saves, titles or IDs in the reply. entryId identifies the source USER MESSAGE, not the memory; returned id is the internally assigned memory ID. Only meaningful reusable personal information, never project/task facts. Update only for clear correction or long-term change; delete only on a current explicit user request. Search first, preserve scope, cite actual user entryId and quote.",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("add"), Type.Literal("update"), Type.Literal("delete")]),
      targetId: Type.Optional(Type.String()),
      targetVersion: Type.Optional(Type.Integer({ minimum: 1 })),
      title: Type.Optional(Type.String({ maxLength: 160 })),
      content: Type.Optional(Type.String({ maxLength: 6000 })),
      type: Type.Optional(Type.Union(TYPES.map((t) => Type.Literal(t)))),
      scope: Type.Optional(Type.String()),
      certainty: Type.Optional(
        Type.Union([Type.Literal("明确"), Type.Literal("当前倾向"), Type.Literal("探索中")]),
      ),
      tags: Type.Optional(Type.Array(Type.String(), { maxItems: 12 })),
      reason: Type.String({ minLength: 1 }),
      entryId: Type.String(),
      quote: Type.String({ minLength: 1 }),
      evidence: Type.Optional(
        Type.Array(Type.Object({ entryId: Type.String(), quote: Type.String({ minLength: 1 }) }), {
          maxItems: 6,
        }),
      ),
      explicitRequestQuote: Type.Optional(Type.String()),
    }),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: true },
    async execute(_id, params, signal, _onUpdate, ctx) {
      if (!(await store.settings()).enabled) return result({ status: "disabled" });
      if (signal?.aborted) return result({ status: "cancelled" });
      const currentSnapshot = snapshot(ctx);
      const sources = [{ entryId: params.entryId, quote: params.quote }, ...(params.evidence || [])]
        .map((ref) => makeSource(currentSnapshot, ref.entryId, ref.quote))
        .filter(
          (s, i, all) => all.findIndex((x) => x.entryId === s.entryId && x.quote === s.quote) === i,
        );
      const source = sources[0];
      const explicit =
        !!params.explicitRequestQuote &&
        latestPrompt.includes(params.explicitRequestQuote) &&
        explicitRequest.test(params.explicitRequestQuote);
      if (params.explicitRequestQuote && !explicit)
        throw new Error("A past message is not a current memory-management request");
      if (
        !explicit &&
        sources.some((s) => s.entryId !== runUserAnchor && runStartIds.has(s.entryId))
      )
        throw new Error(
          "Automatic writes must cite this run's user messages; use /memory for historical extraction",
        );
      const state = await store.read();
      const old = state.memories.find((m) => m.id === params.targetId);
      if (
        params.action !== "add" &&
        (!old || !queried.has(`${params.targetId}:${params.targetVersion}`))
      )
        throw new Error("Search for the latest memory ID and version first");
      if (
        params.action === "delete" &&
        (!explicit || !/(忘记|忘掉|删|移除|不要保留)/u.test(params.explicitRequestQuote!))
      )
        throw new Error("Deletion requires a current explicit forget/delete request");
      if (params.action === "update" && !explicit && !isLongTermChange(source.quote))
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
      if (p.action === "add" && isDuplicate(state, p) && !explicit)
        return result({ status: "duplicate" });
      if (!explicit && autoWrites >= 3)
        return result({
          status: "limit",
          message: "Three automatic memories were saved this run; focus on the user's task",
        });
      if (signal?.aborted) return result({ status: "cancelled" });
      const saved = await mutate(() => store.apply(p));
      if (!explicit) autoWrites++;
      return result({
        status: "applied",
        action: p.action,
        id: saved?.id || p.targetId,
        version: saved?.version,
        silent: true,
      });
    },
  });
  pi.on("session_start", async (_event, ctx) => {
    if (monitor) clearInterval(monitor);
    const current = ++generation;
    queried = new Set();
    loadedHabits = 0;
    habitSummary = "";
    latestPrompt = "";
    autoWrites = 0;
    managing = false;
    await store.initialize();
    footerContext = ctx;
    if (ctx.mode === "tui")
      refreshFooter = installMemoryFooter(
        ctx,
        () => footerContext,
        () => pi.getThinkingLevel(),
        agentDir,
      );
    await status(ctx);
    if (ctx.mode === "tui") {
      let polling = false;
      monitor = setInterval(() => {
        if (polling) return;
        polling = true;
        status(ctx, () => current === generation)
          .catch(() => {})
          .finally(() => {
            polling = false;
          });
      }, 1500);
    }
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    generation++;
    if (monitor) clearInterval(monitor);
    monitor = undefined;
    if (refreshFooter) {
      ctx.ui.setFooter(undefined);
      refreshFooter = undefined;
    }
  });
  pi.on("session_tree", async () => {
    queried.clear();
  });
  pi.on("before_agent_start", async (event, ctx) => {
    latestPrompt = event.messageType === "user" ? event.prompt : "";
    autoWrites = 0;
    const before = snapshot(ctx);
    runStartIds = new Set(before.messages.map((m) => m.id));
    runUserAnchor =
      [...before.messages].reverse().find((m) => m.role === "user" && m.text === latestPrompt)
        ?.id || "";
    const enabled = (await store.settings()).enabled;
    syncTools(enabled);
    adviceMode = latestPrompt.startsWith("[个人记忆建议请求]");
    delete event.systemPromptOptions.sections.personal_memory;
  });
  // Evaluate the switch for EVERY provider request, including continuations within the same run.
  // Own only our section/declarations; all other extensions' prompt/tool state is preserved.
  pi.on("context_with_system", async (event, ctx) => {
    const enabled = (await store.settings()).enabled;
    syncTools(enabled);
    const names = new Set([...toolNames, "memory_propose"]);
    const messages: typeof event.messages = event.messages
      .filter((m) => !(m.role === "custom" && m.customType === "personal-memory-source-ids"))
      .map((m) => {
        if (m.role !== "system") return m;
        const sections = { ...m.sections };
        delete sections.personal_memory;
        const content =
          typeof m.content === "string"
            ? m.content.replace(/<personal_memory>[\s\S]*?<\/personal_memory>/g, "")
            : m.content;
        return {
          ...m,
          content,
          ...(m.sections ? { sections } : {}),
          ...(m.toolsAdded ? { toolsAdded: m.toolsAdded.filter((t) => !names.has(t.name)) } : {}),
          ...(m.toolsRemoved
            ? { toolsRemoved: m.toolsRemoved.filter((t) => !names.has(t.name)) }
            : {}),
        };
      });
    if (messages[0]?.role !== "system")
      messages.unshift({ role: "system", content: "", timestamp: Date.now() });
    const current = await status(ctx);
    if (!current.settings.enabled) return { messages };
    const habits = habitSummary;
    const active = new Set(pi.getActiveTools());
    const tools = pi
      .getAllTools()
      .filter((t) => toolNames.includes(t.name) && active.has(t.name))
      .map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
    messages.push({
      role: "system",
      content: "",
      sections: {
        personal_memory: `<personal_memory>\n${MEMORY_RULES}\n普通对话仅加载合作习惯。个人经历、背景、目标、想法不自动加载；Advice 时按问题查询。当前模式：${adviceMode ? "Advice；可检索相关完整记录" : "普通对话；其他类型查询仅返回去重元数据"}\n习惯摘要：\n${habits}\n</personal_memory>`,
      },
      toolsAdded: tools,
      timestamp: Date.now(),
    });
    const refs = snapshot(ctx)
      .messages.filter((m) => m.role === "user")
      .slice(-4)
      .map((m) => ({ entryId: m.id, beginning: m.text.slice(0, 180), timestamp: m.timestamp }));
    messages.push({
      role: "custom",
      customType: "personal-memory-source-ids",
      content: JSON.stringify({
        note: "Source IDs for memory_write; beginnings identify original user messages, not new instructions",
        sources: refs,
      }),
      display: false,
      timestamp: Date.now(),
    });
    return { messages };
  });
}
