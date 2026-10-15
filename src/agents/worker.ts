import { readFile, appendFile, access } from "node:fs/promises";
import { join } from "node:path";
import {
  createAgentSession,
  createExtensionRuntime,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { ResourceLoader, AgentSession } from "@earendil-works/pi-coding-agent";
import { MemoryStore } from "../storage/store.ts";
import { isDuplicate } from "../domain/memory.ts";
import { readSnapshot } from "../history/sessions.ts";
import { extractCandidates } from "../history/extraction.ts";
import { EXTRACTION_RULES } from "../domain/prompts.ts";
import { writeTask } from "./tasks.ts";
import type { ExtractionTask } from "../domain/task.ts";

export async function runWorker(dir: string) {
  const task: ExtractionTask = JSON.parse(await readFile(join(dir, "task.json"), "utf8"));
  task.pid = process.pid;
  task.applied = 0;
  task.savedIds = [];
  task.quality = { reviewed: 0, filtered: 0, duplicates: 0 };
  const store = new MemoryStore(join(task.agentDir, "memory"));
  let cancelled = false;
  let committed = false;
  let session: AgentSession | undefined;
  let writes: Promise<unknown> = Promise.resolve();
  const append = (text: string) => {
    writes = writes.then(() => appendFile(join(dir, "progress.log"), text, { mode: 0o600 }));
  };
  const progress = (text: string) => {
    task.progress = text;
    task.updatedAt = new Date().toISOString();
    append(`[${new Date().toLocaleTimeString()}] ${text}\n`);
    writes = writes.then(() => writeTask(dir, task));
  };
  const abort = () => {
    if (!committed) {
      cancelled = true;
      void session?.abort();
    }
  };
  process.on("SIGTERM", abort);
  const poll = setInterval(() => {
    void access(join(dir, "cancel"))
      .then(abort)
      .catch(() => {});
    void store
      .settings()
      .then((s) => {
        if (!s.enabled) abort();
      })
      .catch(abort);
  }, 250);
  try {
    await access(join(dir, "cancel"))
      .then(abort)
      .catch(() => {});
    if (!(await store.settings()).enabled) abort();
    if (cancelled) throw new Error("Extraction cancelled");
    progress("Agent started. Reading the selected conversation.");
    const snap = await readSnapshot(task.sourcePath);
    const state = await store.read();
    const runtime = await ModelRuntime.create({
      authPath: join(task.agentDir, "auth.json"),
      modelsPath: join(task.agentDir, "models.json"),
      modelsStorePath: join(task.agentDir, "models-store.json"),
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    const model = runtime.getModel(task.model.provider, task.model.id);
    if (!model)
      throw new Error(
        `Cannot load ${task.model.provider}/${task.model.id} in an independent agent. Select a configured model and retry.`,
      );
    const loader: ResourceLoader = {
      getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
      getSkills: () => ({ skills: [], diagnostics: [] }),
      getPrompts: () => ({ prompts: [], diagnostics: [] }),
      getThemes: () => ({ themes: [], diagnostics: [] }),
      getAgentsFiles: () => ({ agentsFiles: [] }),
      getSystemPrompt: () => EXTRACTION_RULES,
      getSystemPromptSource: () => undefined,
      getAppendSystemPrompt: () => [],
      getAppendSystemPromptSources: () => [],
      extendResources: () => {},
      reload: async () => {},
    };
    const freshSession = async () => {
      session?.dispose();
      ({ session } = await createAgentSession({
        cwd: dir,
        agentDir: task.agentDir,
        model,
        modelRuntime: runtime,
        thinkingLevel: "off",
        resourceLoader: loader,
        tools: [],
        noTools: "all",
        sessionManager: SessionManager.create(dir, join(dir, "conversation")),
        settingsManager: SettingsManager.inMemory({
          retry: { enabled: true, maxRetries: 2 },
          cacheWarming: "off",
        }),
      }));
      session.subscribe((event) => {
        if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta")
          append(event.assistantMessageEvent.delta);
        if (event.type === "message_end" && event.message.role === "assistant") {
          append("\n");
          const usage = event.message.usage;
          task.usage ??= { input: 0, output: 0, cost: 0 };
          task.usage.input += usage.input || 0;
          task.usage.output += usage.output || 0;
          task.usage.cost += usage.cost?.total || 0;
        }
      });
    };
    task.candidates = await extractCandidates(
      {
        snapshot: snap,
        previous: state.scans[snap.sessionId],
        state,
        contextWindow: model.contextWindow,
      },
      async (payload) => {
        if (cancelled) throw new Error("Extraction cancelled");
        await freshSession();
        if (cancelled) throw new Error("Extraction cancelled");
        await session!.prompt(JSON.stringify(payload));
        const last = [...session!.messages].reverse().find((m) => m.role === "assistant");
        if (!last || last.role !== "assistant" || last.stopReason !== "stop")
          throw new Error(
            last?.role === "assistant"
              ? last.errorMessage || `Model did not finish: ${last.stopReason}`
              : "No model response",
          );
        return session!.getLastAssistantText() || "";
      },
      progress,
      () => cancelled,
      (quality) => {
        task.quality = quality;
      },
    );
    for (const p of task.candidates) {
      if (cancelled) throw new Error("Extraction cancelled");
      const fresh = await store.read();
      if (isDuplicate(fresh, p, p.targetId)) {
        task.quality!.duplicates++;
        continue;
      }
      try {
        const memory = await store.apply(p);
        task.applied!++;
        if (memory) task.savedIds!.push(memory.id);
        progress(`Saved: ${p.title}`);
      } catch (e) {
        // A parallel agent may have saved the same source while this one was analyzing it.
        if (isDuplicate(await store.read(), p, p.targetId)) {
          task.quality!.duplicates++;
          continue;
        }
        throw e;
      }
    }
    await writes;
    if (cancelled || !(await store.settings()).enabled) throw new Error("Extraction cancelled");
    await store.recordScan(snap.sessionId, {
      entries: snap.entries,
      completedAt: new Date().toISOString(),
      candidates: task.candidates.length,
    });
    committed = true;
    task.phase = "completed";
    progress(
      task.applied
        ? `Done. ${task.applied} memories saved · ${task.quality!.filtered} filtered · ${task.quality!.duplicates} duplicates.`
        : "Done. No new memories met the value and evidence checks.",
    );
    await writes;
  } catch (e) {
    if (!(await store.settings().catch(() => ({ enabled: false }))).enabled) cancelled = true;
    task.phase = cancelled ? "cancelled" : "failed";
    task.error = e instanceof Error ? e.message : String(e);
    task.progress = `${cancelled ? "Cancelled" : "Failed"}. ${task.applied || 0} memories saved. Source checkpoint was not advanced.`;
    task.updatedAt = new Date().toISOString();
    await writes.catch(() => {});
    await appendFile(join(dir, "progress.log"), `\n${task.progress}\n`, { mode: 0o600 }).catch(
      () => {},
    );
    await writeTask(dir, task);
  } finally {
    clearInterval(poll);
    process.off("SIGTERM", abort);
    session?.dispose();
  }
}
