import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ConversationSummary } from "../../../core/src/domain/task.ts";
import { listConversations } from "../history/catalog.ts";
import { readSnapshot } from "../../../core/src/history/sessions.ts";
import type { MemoryStore } from "../../../core/src/storage/store.ts";
import type { TaskManager } from "../agents/tasks.ts";
import { pick, pickerState } from "../../../terminal/src/picker.ts";
import { taskViewer } from "../../../terminal/src/task-viewer.ts";
import type { createLibrary } from "../../../terminal/src/library.ts";

export function createExtraction(
  ctx: ExtensionContext,
  store: MemoryStore,
  tasks: TaskManager,
  agentDir: string,
  library: ReturnType<typeof createLibrary>,
  notice: (text: string) => void,
) {
  async function start(path: string, name: string) {
    if (!(await store.settings()).enabled)
      throw new Error("Memory is off. Enable it to extract conversations.");
    if (!ctx.model) throw new Error("Select a model first");
    return tasks.start({
      sourcePath: path,
      name,
      agentDir,
      model: {
        provider: ctx.model.provider,
        id: ctx.model.id,
        contextWindow: ctx.model.contextWindow,
      },
    });
  }
  async function showTask(id: string) {
    for (;;) {
      const choice = await taskViewer(ctx, async () => {
        const task = (await tasks.list()).find((t) => t.id === id);
        if (!task) throw new Error("Task not found");
        return { task, log: await tasks.log(id) };
      });
      if (!choice || choice === "back") return;
      if (choice === "cancel") {
        await tasks.cancel(id);
        notice("Cancellation requested. Other agents continue running.");
      } else if (choice === "memories") {
        const task = (await tasks.list()).find((t) => t.id === id);
        await library.show(
          (await store.read()).memories.filter((m) => task?.savedIds?.includes(m.id)),
        );
      } else if (choice === "retry") {
        const task = (await tasks.list()).find((t) => t.id === id);
        if (!task) throw new Error("Task not found");
        const next = await start(task.sourcePath, task.name);
        notice("Started a new extraction agent");
        id = next.id;
      }
    }
  }
  async function open(conversation: ConversationSummary) {
    const jobs = await tasks.list();
    const task =
      jobs.find((t) => t.sourcePath === conversation.path && t.phase === "running") ||
      jobs.find((t) => t.sourcePath === conversation.path);
    if (
      task &&
      (conversation.status === "Extracted" ||
        ["running", "failed", "cancelled"].includes(task.phase))
    ) {
      await showTask(task.id);
    } else if (conversation.status === "Extracted") {
      const snapshot = await readSnapshot(conversation.path);
      await library.show(
        (await store.read()).memories.filter((m) =>
          m.sources.some((s) => s.sessionId === snapshot.sessionId),
        ),
      );
    } else {
      const job = await start(conversation.path, conversation.title);
      await showTask(job.id);
    }
  }
  async function select() {
    if (!(await store.settings()).enabled) {
      notice("Memory is off. Enable it to extract conversations.");
      return;
    }
    const view = pickerState();
    for (;;) {
      const rows = await listConversations(ctx, await store.read(), join(agentDir, "sessions"));
      const choice = await pick(
        ctx,
        "Select conversations",
        [
          { value: "extract-selected", label: "Extract selected conversations", fixed: true },
          ...rows.map((row) => ({ value: row.path, label: row.title, status: row.status })),
        ],
        view,
        true,
      );
      if (!choice) return;
      if (choice !== "extract-selected" && !view.marked.size) {
        const row = rows.find((row) => row.path === choice);
        if (!row) continue;
        if (
          row.status === "Extracted" ||
          (await tasks.list()).some((t) => t.sourcePath === choice && t.phase === "running")
        ) {
          await open(row);
          continue;
        }
        await start(row.path, row.title);
        notice("Extraction started. Keep chatting; progress is in Extraction.");
        return;
      }
      const selected = rows.filter((row) => view.marked.has(row.path));
      if (!selected.length) {
        notice("Select conversations with Space first");
        continue;
      }
      const launched = await Promise.all(selected.map((row) => start(row.path, row.title)));
      notice(
        `${new Set(launched.map((task) => task.id)).size} extraction agents running. Keep chatting; progress is in Extraction.`,
      );
      return;
    }
  }
  return { open, select };
}
