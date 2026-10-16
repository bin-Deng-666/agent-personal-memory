import { readFile, appendFile, access } from "node:fs/promises";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { MemoryStore } from "../storage/store.ts";
import { isDuplicate } from "../domain/memory.ts";
import { readSnapshot } from "../history/sessions.ts";
import { extractCandidates } from "../history/extraction.ts";
import { extractionSession } from "./extraction-session.ts";
import { writeTask } from "./tasks.ts";
import type { ExtractionTask } from "../domain/task.ts";

export async function runWorker(dir: string) {
  const task: ExtractionTask = JSON.parse(await readFile(join(dir, "task.json"), "utf8"));
  task.pid = process.pid;
  task.applied = 0;
  task.savedIds = [];
  task.quality = { reviewed: 0, filtered: 0, duplicates: 0 };
  const store = new MemoryStore(task.memoryDir || join(task.agentDir, "memory"));
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
  const checkEnabled = async () => {
    if (!(await store.settings()).enabled) abort();
    await access(join(dir, "cancel"))
      .then(abort)
      .catch(() => {});
  };
  const poll = setInterval(() => {
    void checkEnabled().catch(abort);
  }, 250);
  try {
    await checkEnabled();
    if (cancelled) throw new Error("Extraction cancelled");
    progress("Agent started. Reading the selected conversation.");
    const snapshot = await readSnapshot(task.sourcePath);
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
    task.candidates = await extractCandidates(
      {
        snapshot,
        previous: state.scans[snapshot.sessionId],
        state,
        contextWindow: model.contextWindow,
      },
      (payload) =>
        extractionSession({
          dir,
          agentDir: task.agentDir,
          runtime,
          model,
          payload,
          cancelled: () => cancelled,
          setSession: (value) => {
            session = value;
          },
          onEvent: (event) => {
            if (
              event.type === "message_update" &&
              event.assistantMessageEvent.type === "text_delta"
            )
              append(event.assistantMessageEvent.delta);
            if (event.type === "message_end" && event.message.role === "assistant") {
              append("\n");
              const usage = event.message.usage;
              task.usage ??= { input: 0, output: 0, cost: 0 };
              task.usage.input += usage.input || 0;
              task.usage.output += usage.output || 0;
              task.usage.cost += usage.cost?.total || 0;
            }
          },
        }),
      progress,
      () => cancelled,
      (quality) => {
        task.quality = quality;
      },
    );
    // No candidate is written until evidence checks and independent review finish for the source.
    for (const proposal of task.candidates) {
      if (cancelled) throw new Error("Extraction cancelled");
      if (isDuplicate(await store.read(), proposal, proposal.targetId)) {
        task.quality!.duplicates++;
        continue;
      }
      try {
        const memory = await store.apply(proposal);
        task.applied!++;
        if (memory) task.savedIds!.push(memory.id);
        progress(`Saved: ${proposal.title}`);
      } catch (error) {
        if (isDuplicate(await store.read(), proposal, proposal.targetId)) {
          task.quality!.duplicates++;
          continue;
        }
        throw error;
      }
    }
    await writes;
    if (cancelled || !(await store.settings()).enabled) throw new Error("Extraction cancelled");
    await store.recordScan(snapshot.sessionId, {
      entries: snapshot.entries,
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
  } catch (error) {
    if (!(await store.settings().catch(() => ({ enabled: false }))).enabled) cancelled = true;
    task.phase = cancelled ? "cancelled" : "failed";
    task.error = error instanceof Error ? error.message : String(error);
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
