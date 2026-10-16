import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { MemoryStore } from "../storage/store.ts";
import type { TaskManager } from "../agents/tasks.ts";
import { ADVICE_RULES } from "../domain/prompts.ts";
import { listConversations } from "../history/catalog.ts";
import { dashboard, dashboardState } from "../ui/dashboard.ts";
import { createLibrary } from "./library.ts";
import { organizeLibrary } from "./organization.ts";
import { createExtraction } from "./extraction.ts";

interface PanelOptions {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  store: MemoryStore;
  tasks: TaskManager;
  agentDir: string;
  getLoadedHabits: () => number;
  setEnabled: (enabled: boolean) => Promise<void>;
  onChanged: () => Promise<void>;
}

// This module owns navigation; Library and Extraction own their respective workflows.
export async function openMemoryPanel({
  pi,
  ctx,
  store,
  tasks,
  agentDir,
  getLoadedHabits,
  setEnabled,
  onChanged,
}: PanelOptions) {
  let notice = "";
  const library = createLibrary(ctx, store, onChanged);
  const extraction = createExtraction(ctx, store, tasks, agentDir, library, (text) => {
    notice = text;
  });
  let conversations: Awaited<ReturnType<typeof listConversations>> = [];
  let catalogAt = 0;
  let scanKey = "";
  const view = dashboardState();
  for (;;) {
    const choice = await dashboard(
      ctx,
      view,
      async () => {
        const enabled = (await store.settings()).enabled;
        const state = await store.read();
        const jobs = await tasks.list();
        const key = JSON.stringify(state.scans);
        if (Date.now() - catalogAt > 5000 || key !== scanKey) {
          conversations = await listConversations(ctx, state, join(agentDir, "sessions"));
          catalogAt = Date.now();
          scanKey = key;
        }
        return {
          memories: [...state.memories].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          enabled,
          loadedHabits: enabled ? getLoadedHabits() : 0,
          tasks: jobs,
          conversations,
          notice,
        };
      },
      setEnabled,
    );
    if (!choice) return;
    notice = "";
    try {
      if (choice.startsWith("advice:")) {
        if (!(await store.settings()).enabled) {
          notice = "Enable Memory to get advice based on your library";
          continue;
        }
        if (!(await store.read()).memories.length) {
          notice = "Your library is empty. Extract a conversation first.";
          continue;
        }
        pi.sendUserMessage(`[个人记忆建议请求]\n${choice.slice(7)}\n${ADVICE_RULES}`, {
          deliverAs: "followUp",
        });
        return;
      }
      if (choice === "organize") {
        await organizeLibrary(ctx, store, onChanged);
        view.tab = 0;
        view.page = "content";
      } else if (choice === "history") {
        await extraction.select();
        view.tab = 1;
        view.homeIndex = 1;
        view.page = "content";
      } else if (choice.startsWith("conversation:")) {
        const conversation = conversations.find((c) => c.path === choice.slice(13));
        if (conversation) await extraction.open(conversation);
      } else await library.open(choice);
      catalogAt = 0;
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error);
    }
  }
}
