import { dashboard, dashboardState } from "../../terminal/src/dashboard.ts";
import { createLibrary } from "../../terminal/src/library.ts";
import { pick, pickerState } from "../../terminal/src/picker.ts";
import { taskViewer } from "../../terminal/src/task-viewer.ts";
import { withTerminal } from "../../terminal/src/host.ts";
import { readSnapshot } from "../../core/src/history/sessions.ts";
import { habitContext } from "../../core/src/domain/search.ts";
import { ClaudeMemory } from "./service.ts";
import type { MemoryStore } from "../../core/src/storage/store.ts";
import type { ConversationSummary } from "../../core/src/domain/task.ts";
import type { PanelContext } from "../../terminal/src/context.ts";

export async function memoryPanel(
  store: MemoryStore,
  ctx: PanelContext,
): Promise<{ question?: string }> {
  const service = new ClaudeMemory(store),
    tasks = service.tasks;
  let notice = "";
  const library = createLibrary(ctx, store, async () => {});
  async function showTask(id: string) {
    for (;;) {
      const choice = await taskViewer(ctx, async () => {
        const task = (await tasks.list()).find((t) => t.id === id);
        if (!task) throw new Error("Task not found");
        return { task, log: await tasks.log(id) };
      });
      if (!choice || choice === "back") return;
      const task = (await tasks.list()).find((t) => t.id === id);
      if (!task) return;
      if (choice === "memories")
        await library.show(
          (await store.read()).memories.filter((m) => task.savedIds?.includes(m.id)),
        );
      else if (choice === "cancel") await tasks.cancel(id);
      else if (choice === "retry") {
        if (!(await store.settings()).enabled) throw new Error("Personal Memory is Off");
        id = (await tasks.start(task.sourcePath, task.name)).id;
      }
    }
  }
  async function open(row: ConversationSummary) {
    const jobs = await tasks.list();
    const task =
      jobs.find((t) => t.sourcePath === row.path && t.phase === "running") ||
      jobs.find((t) => t.sourcePath === row.path);
    if (
      task &&
      (row.status === "Extracted" || ["running", "failed", "cancelled"].includes(task.phase))
    )
      return showTask(task.id);
    if (row.status === "Extracted") {
      const snapshot = await readSnapshot(row.path);
      return library.show(
        (await store.read()).memories.filter((m) =>
          m.sources.some((s) => s.sessionId === snapshot.sessionId),
        ),
      );
    }
    if (!(await store.settings()).enabled)
      throw new Error("Personal Memory is Off. Press Tab to enable.");
    return showTask((await tasks.start(row.path, row.title)).id);
  }
  async function selectConversations() {
    if (!(await store.settings()).enabled)
      throw new Error("Personal Memory is Off. Press Tab to enable.");
    const rows = await service.conversations(),
      state = pickerState();
    const choice = await pick(
      ctx,
      "Select conversations",
      [
        { value: "extract-selected", label: "Extract selected conversations", fixed: true },
        ...rows.map((row) => ({ value: row.path, label: row.title, status: row.status })),
      ],
      state,
      true,
    );
    if (!choice) return;
    const selected = rows.filter(
      (row) => state.marked.has(row.path) || (!state.marked.size && row.path === choice),
    );
    if (!selected.length) {
      notice = "Select conversations with Space first.";
      return;
    }
    await Promise.all(selected.map((row) => tasks.start(row.path, row.title)));
    notice = `${selected.length} extraction agents started. Return to chat while they run.`;
  }
  let conversations: ConversationSummary[] = [],
    catalogAt = 0;
  const view = dashboardState();
  for (;;) {
    const choice = await dashboard(
      ctx,
      view,
      async () => {
        const enabled = (await store.settings()).enabled,
          state = await store.read();
        if (Date.now() - catalogAt > 5000) {
          conversations = await service.conversations();
          catalogAt = Date.now();
        }
        return {
          memories: state.memories.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          enabled,
          loadedHabits: enabled
            ? habitContext(state.memories).split("\n").filter(Boolean).length
            : 0,
          tasks: await tasks.list(),
          conversations,
          notice,
        };
      },
      async (enabled) => {
        await store.setEnabled(enabled);
        if (!enabled)
          await Promise.all(
            (await tasks.list())
              .filter((t) => t.phase === "running")
              .map((t) => tasks.cancel(t.id)),
          );
      },
    );
    if (!choice) return {};
    notice = "";
    try {
      if (choice.startsWith("advice:")) {
        if (!(await store.settings()).enabled) throw new Error("Personal Memory is Off");
        return { question: choice.slice(7) };
      }
      if (choice === "history") await selectConversations();
      else if (choice.startsWith("conversation:")) {
        const row = conversations.find((row) => row.path === choice.slice(13));
        if (row) await open(row);
      } else await library.open(choice);
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error);
    }
    catalogAt = 0;
  }
}
export async function runPanel(store: MemoryStore) {
  return withTerminal((ctx) => memoryPanel(store, ctx));
}
