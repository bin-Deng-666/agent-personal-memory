import type { MemoryStore } from "../../core/src/storage/store.ts";
import { TYPES, TYPE_LABELS, createProposal, memoryFields } from "../../core/src/domain/memory.ts";
import { habitContext, searchMemories } from "../../core/src/domain/search.ts";
import { memoryStatusLabel } from "../../core/src/domain/presentation.ts";
import { listPiConversations } from "../../core/src/history/pi-files.ts";
import { listClaudeConversations } from "../../core/src/history/claude.ts";
import { ClaudeExtraction } from "./extraction.ts";
import type { ClaudeSessions, ClaudeSession } from "./sessions.ts";

type Screen =
  | "home"
  | "library"
  | "search"
  | "record"
  | "edit"
  | "content"
  | "types"
  | "sources"
  | "settings"
  | "advice"
  | "extraction"
  | "conversations"
  | "batch"
  | "tasks"
  | "task"
  | "log";
export interface MenuState {
  runId: string;
  active: boolean;
  screen: Screen;
  offset: number;
  query: string;
  recordId?: string;
  version?: number;
  taskId?: string;
  pendingToolId?: string;
  question?: string;
  options?: { label: string; description: string; action: string }[];
  notice?: string;
  advice?: string;
  conversationPaths?: Record<string, string>;
}
export class NativeMenu {
  readonly tasks: ClaudeExtraction;
  constructor(
    readonly store: MemoryStore,
    readonly sessions: ClaudeSessions,
  ) {
    this.tasks = new ClaudeExtraction(store.dir);
  }
  async start(session: ClaudeSession) {
    await this.sessions.update(session.id, {
      menu: { runId: session.runId, active: true, screen: "home", offset: 0, query: "" },
    });
  }
  async active(sessionId: string) {
    const session = await this.sessions.read(sessionId);
    return session.menu?.active && session.menu.runId === session.runId ? session : undefined;
  }
  async question(sessionId: string, toolId?: string) {
    const session = await this.sessions.read(sessionId);
    const menu = session.menu;
    if (!menu?.active || menu.runId !== session.runId)
      throw new Error("No active Personal Memory menu");
    const state = await this.store.read(),
      enabled = (await this.store.settings()).enabled;
    const habits = enabled ? habitContext(state.memories).split("\n").filter(Boolean).length : 0;
    const status = memoryStatusLabel(enabled, state.memories.length, habits);
    const options: { label: string; description: string; action: string }[] = [];
    const add = (label: string, description: string, action = label) =>
      options.push({ label, description: description.slice(0, 200), action });
    const back = (target: Screen) => add("Back", "Return to the previous view", `screen:${target}`);
    let question = status;
    const memory = state.memories.find((m) => m.id === menu.recordId);
    if (["record", "edit", "content", "types", "sources"].includes(menu.screen) && !memory) {
      menu.screen = "library";
      menu.notice = "That memory was deleted in another session.";
    }
    switch (menu.screen) {
      case "home":
        add("Library", `${state.memories.length} saved memories`);
        add("Extraction", "Conversations, background tasks and results");
        add("Advice", "Ask using relevant personal memories");
        add("Settings", "Personal Memory On/Off or close");
        break;
      case "settings":
        add(
          enabled ? "Turn Off" : "Turn On",
          enabled
            ? "Pause capture/retrieval and cancel extraction"
            : "Enable personal-memory capture and retrieval",
          "toggle",
        );
        back("home");
        add("Close", "Return to the conversation", "close");
        break;
      case "library": {
        const ranked = searchMemories(state.memories, menu.query, state.memories.length);
        menu.offset = Math.max(0, Math.min(menu.offset, Math.max(0, ranked.length - 1)));
        question = `Library · ${ranked.length} results${menu.query ? ` · ${menu.query}` : ""}`;
        ranked
          .slice(menu.offset, menu.offset + 2)
          .forEach((m) =>
            add(`[${TYPE_LABELS[m.type]}] ${m.title}`.slice(0, 90), m.content, `record:${m.id}`),
          );
        if (menu.offset + 2 < ranked.length)
          add("More", `Results ${menu.offset + 3} onward`, `page:${menu.offset + 2}`);
        add("Search / Back", "Search, return to first page, or go home", "library-tools");
        break;
      }
      case "search":
        question =
          "Library search: choose Show all, or use the native Other text field to enter keywords.";
        add("Show all", "Clear search and show the first page", "clear-search");
        back("home");
        break;
      case "record":
        menu.version = memory!.version;
        question = `Type: ${TYPE_LABELS[memory!.type]}\n${memory!.title}\n\n${memory!.content}`;
        add("Edit", "Content or Type");
        add("Original words", "Exact user quotes and message dates");
        add("Delete", "Delete this record and suppress automatic recovery");
        back("library");
        break;
      case "edit":
        question = `Edit · ${memory!.title}\n\nCurrent content:\n${memory!.content}\n\nCurrent type: ${TYPE_LABELS[memory!.type]}`;
        add("Content", memory!.content);
        add("Type", TYPE_LABELS[memory!.type]);
        back("record");
        break;
      case "content":
        question = `Current content:\n${memory!.content}\n\nTo replace it, use the native Other text field. Your text is saved verbatim.`;
        add("Keep current", "Do not change the saved content", "screen:record");
        back("edit");
        break;
      case "types":
        question = `Current type: ${TYPE_LABELS[memory!.type]}`;
        TYPES.slice(menu.offset, menu.offset + 3).forEach((type) =>
          add(TYPE_LABELS[type], type, `type:${type}`),
        );
        if (menu.offset === 0) add("More types", "The remaining categories", "types-more");
        else back("edit");
        break;
      case "sources":
        question =
          memory!.sources
            .map(
              (s) =>
                `${s.host || "pi"} · ${s.timestamp.slice(0, 10) || "Unknown date"}\n“${s.quote}”`,
            )
            .join("\n\n") || "No source quotes";
        back("record");
        add("Close", "Return to the conversation", "close");
        break;
      case "advice":
        question = enabled
          ? "Question: enter your question using the native Other text field. Advice continues in this conversation."
          : "Personal Memory is Off. Enable it in Settings to use Advice.";
        back("home");
        add("Close", "Return without sending an Advice question", "close");
        break;
      case "extraction":
        add("Conversations", "Browse and start extraction");
        add(
          "Select conversations",
          "Select multiple conversations for background extraction",
          "batch",
        );
        add("Tasks", "Progress, saved records, logs, cancellation and retry");
        back("home");
        break;
      case "batch":
      case "conversations": {
        const rows = [
          ...(await listPiConversations(state)),
          ...(await listClaudeConversations(state)),
        ];
        question = `Extraction · ${rows.length} conversations`;
        menu.conversationPaths = {};
        rows.slice(menu.offset, menu.offset + 2).forEach((row, i) => {
          const label = `${row.status} · ${row.title}`.slice(0, 90);
          const key = `source:${i}`;
          menu.conversationPaths![key] = row.path;
          add(label, row.host || "Pi", key);
        });
        if (menu.offset + 2 < rows.length)
          add("More", "Next conversations", `page:${menu.offset + 2}`);
        back("extraction");
        break;
      }
      case "tasks": {
        const rows = await this.tasks.list();
        question = `Extraction · ${rows.length} tasks`;
        rows
          .slice(menu.offset, menu.offset + 2)
          .forEach((t) => add(`${t.phase} · ${t.name}`.slice(0, 90), t.progress, `task:${t.id}`));
        if (menu.offset + 2 < rows.length) add("More", "Next tasks", `page:${menu.offset + 2}`);
        back("extraction");
        break;
      }
      case "task": {
        const task = (await this.tasks.list()).find((t) => t.id === menu.taskId);
        question = task
          ? `${task.name}\n${task.progress}\n${task.applied || 0} saved`
          : "Task unavailable";
        add("Saved memories", "Open saved records", "task-memories");
        add("Log", "View task diagnostics");
        add(
          task?.phase === "running" ? "Cancel" : "Retry",
          "Apply to this task only",
          task?.phase === "running" ? "cancel-task" : "retry-task",
        );
        back("tasks");
        break;
      }
      case "log":
        question = (await this.tasks.log(menu.taskId || "")).slice(-12000);
        back("task");
        add("Close", "Return to the conversation", "close");
        break;
    }
    if (options.length < 2) add("Refresh", "Reload this view", "refresh");
    if (menu.notice) question = `${menu.notice}\n\n${question}`;
    menu.question = question;
    menu.options = options;
    if (toolId) menu.pendingToolId = toolId;
    await this.sessions.update(sessionId, { menu });
    return {
      questions: [
        {
          question,
          header: "Personal",
          multiSelect: menu.screen === "batch",
          options: options.map(({ label, description }) => ({ label, description })),
        },
      ],
    };
  }
  async answer(sessionId: string, toolId: string, answer: unknown) {
    const session = await this.sessions.read(sessionId),
      menu = session.menu;
    if (!menu?.active || menu.runId !== session.runId || menu.pendingToolId !== toolId)
      return { ignored: true };
    menu.pendingToolId = undefined;
    menu.notice = undefined;
    if (typeof answer !== "string" || !answer.trim()) {
      menu.active = false;
      await this.sessions.update(sessionId, { menu });
      return { closed: true };
    }
    const selected = menu.options?.find((option) => option.label === answer),
      action = selected?.action;
    try {
      if (menu.screen === "batch") {
        const choices = menu.options || [];
        const picked: typeof choices = [];
        let remaining = answer;
        while (remaining) {
          const option = [...choices]
            .sort((a, b) => b.label.length - a.label.length)
            .find(
              (option) => remaining === option.label || remaining.startsWith(option.label + ", "),
            );
          if (!option) throw new Error("Select the displayed conversations");
          picked.push(option);
          remaining = remaining.slice(option.label.length).replace(/^, /, "");
        }
        const sources = picked.filter((option) => option.action.startsWith("source:"));
        if (sources.length && sources.length !== picked.length)
          throw new Error("Choose conversations or a navigation option separately");
        if (sources.length) {
          if (!(await this.store.settings()).enabled) throw new Error("Personal Memory is Off");
          await Promise.all(
            sources.map((option) => {
              const path = menu.conversationPaths?.[option.action];
              if (!path) throw new Error("Conversation unavailable");
              return this.tasks.start(path, option.label);
            }),
          );
          menu.notice = `${sources.length} extraction agents started.`;
          menu.screen = "extraction";
          await this.sessions.update(sessionId, { menu });
          return { closed: false };
        }
      }
      if (!action) {
        if (menu.screen === "search") {
          menu.query = answer.trim();
          menu.offset = 0;
          menu.screen = "library";
        } else if (menu.screen === "content") {
          const memory = (await this.store.read()).memories.find((m) => m.id === menu.recordId);
          if (!memory) throw new Error("Record was deleted");
          await this.store.apply(
            createProposal({
              ...memoryFields(memory),
              content: answer,
              action: "update",
              targetId: memory.id,
              targetVersion: menu.version,
            }),
          );
          menu.screen = "record";
        } else if (menu.screen === "advice" && (await this.store.settings()).enabled) {
          menu.active = false;
          menu.advice = answer;
          await this.sessions.update(sessionId, { mode: "advice", menu });
          return { advice: answer };
        } else menu.notice = "Choose one of the displayed options.";
      } else if (action.startsWith("screen:")) {
        menu.screen = action.slice(7) as Screen;
        menu.offset = 0;
      } else if (action.startsWith("record:")) {
        menu.recordId = action.slice(7);
        menu.screen = "record";
      } else if (action.startsWith("page:")) menu.offset = Number(action.slice(5));
      else if (action.startsWith("type:")) {
        const memory = (await this.store.read()).memories.find((m) => m.id === menu.recordId);
        if (!memory) throw new Error("Record was deleted");
        await this.store.apply(
          createProposal({
            ...memoryFields(memory),
            type: action.slice(5) as (typeof TYPES)[number],
            action: "update",
            targetId: memory.id,
            targetVersion: menu.version,
          }),
        );
        menu.screen = "record";
      } else if (action.startsWith("source:")) {
        if (!(await this.store.settings()).enabled) throw new Error("Personal Memory is Off");
        const path = menu.conversationPaths?.[action];
        if (!path) throw new Error("Conversation no longer available");
        const task = await this.tasks.start(path, selected!.label);
        menu.taskId = task.id;
        menu.screen = "task";
      } else if (action.startsWith("task:")) {
        menu.taskId = action.slice(5);
        menu.screen = "task";
      } else
        switch (action) {
          case "Library":
            menu.screen = "library";
            menu.offset = 0;
            break;
          case "Extraction":
            menu.screen = "extraction";
            break;
          case "Advice":
            menu.screen = "advice";
            break;
          case "Settings":
            menu.screen = "settings";
            break;
          case "Edit":
            menu.screen = "edit";
            break;
          case "Original words":
            menu.screen = "sources";
            break;
          case "Content":
            menu.screen = "content";
            break;
          case "Type":
            menu.screen = "types";
            menu.offset = 0;
            break;
          case "types-more":
            menu.offset = 3;
            break;
          case "Delete": {
            const memory = (await this.store.read()).memories.find((m) => m.id === menu.recordId);
            if (!memory) throw new Error("Record was deleted");
            await this.store.apply(
              createProposal({
                ...memoryFields(memory),
                action: "delete",
                targetId: memory.id,
                targetVersion: menu.version,
              }),
            );
            menu.screen = "library";
            menu.offset = 0;
            break;
          }
          case "library-tools":
            menu.screen = "search";
            break;
          case "clear-search":
            menu.query = "";
            menu.offset = 0;
            menu.screen = "library";
            break;
          case "toggle": {
            const enabled = !(await this.store.settings()).enabled;
            await this.store.setEnabled(enabled);
            if (!enabled)
              await Promise.all(
                (await this.tasks.list())
                  .filter((t) => t.phase === "running")
                  .map((t) => this.tasks.cancel(t.id)),
              );
            break;
          }
          case "close":
            menu.active = false;
            break;
          case "batch":
            menu.screen = "batch";
            menu.offset = 0;
            break;
          case "Conversations":
            menu.screen = "conversations";
            menu.offset = 0;
            break;
          case "Tasks":
            menu.screen = "tasks";
            menu.offset = 0;
            break;
          case "Log":
            menu.screen = "log";
            break;
          case "cancel-task":
            await this.tasks.cancel(menu.taskId || "");
            break;
          case "retry-task": {
            if (!(await this.store.settings()).enabled) throw new Error("Personal Memory is Off");
            const task = (await this.tasks.list()).find((t) => t.id === menu.taskId);
            if (task) menu.taskId = (await this.tasks.start(task.sourcePath, task.name)).id;
            break;
          }
          case "task-memories": {
            const task = (await this.tasks.list()).find((t) => t.id === menu.taskId);
            const memory = (await this.store.read()).memories.find((m) =>
              task?.savedIds?.includes(m.id),
            );
            if (memory) {
              menu.recordId = memory.id;
              menu.screen = "record";
            } else menu.notice = "No saved memories in this task.";
            break;
          }
        }
    } catch (error) {
      menu.notice = error instanceof Error ? error.message : String(error);
      if (/changed|latest|version/i.test(menu.notice)) menu.screen = "record";
    }
    await this.sessions.update(sessionId, { menu });
    return { closed: !menu.active };
  }
}
