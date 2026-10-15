import { mkdir, appendFile, readFile, writeFile, access } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import lockfile from "proper-lockfile";
import { TaskRepository, writeTask } from "../../core/src/storage/tasks.ts";
import { MemoryStore } from "../../core/src/storage/store.ts";
import { readSnapshot } from "../../core/src/history/sessions.ts";
import { extractCandidates } from "../../core/src/history/extraction.ts";
import { EXTRACTION_RULES } from "../../core/src/domain/prompts.ts";
import { isDuplicate } from "../../core/src/domain/memory.ts";
import type { ExtractionTask } from "../../core/src/domain/task.ts";

export class ClaudeExtraction extends TaskRepository {
  async start(sourcePath: string, name: string, model = ""): Promise<ExtractionTask> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const release = await lockfile.lock(this.dir, {
      realpath: false,
      stale: 30000,
      retries: { retries: 30, minTimeout: 50, maxTimeout: 300 },
    });
    try {
      const active = (await this.list()).find(
        (t) => t.sourcePath === sourcePath && t.phase === "running",
      );
      if (active) return active;
      const now = new Date().toISOString();
      const task: ExtractionTask = {
        id: randomUUID(),
        name,
        sourcePath,
        agentDir: "",
        memoryDir: this.memoryDir,
        runtime: "claude",
        model: { provider: "claude", id: model },
        phase: "running",
        createdAt: now,
        updatedAt: now,
        progress: "Starting independent extraction agent",
        candidates: [],
      };
      const dir = this.taskDir(task.id);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeTask(dir, task);
      const stderr = openSync(join(dir, "stderr.log"), "a", 0o600);
      try {
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "worker", dir], {
          cwd: dir,
          detached: true,
          stdio: ["ignore", "ignore", stderr],
          shell: false,
          env: { ...process.env, PERSONAL_MEMORY_DIR: this.memoryDir },
        });
        child.on("error", (error) => {
          task.phase = "failed";
          task.error = error.message;
          void writeTask(dir, task).catch(() => {});
        });
        child.unref();
        await writeFile(join(dir, "launch.json"), JSON.stringify({ pid: child.pid }), {
          mode: 0o600,
        });
      } finally {
        closeSync(stderr);
      }
      return task;
    } finally {
      await release();
    }
  }
}
export async function claudeComplete(
  payload: unknown,
  model: string,
  cwd: string,
  signal: AbortSignal,
): Promise<string> {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  const args = [
    "-p",
    "--output-format",
    "json",
    "--no-session-persistence",
    "--tools",
    "",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--setting-sources",
    "",
    "--settings",
    '{"disableAllHooks":true}',
    "--system-prompt",
    EXTRACTION_RULES,
  ];
  if (model) args.push("--model", model);
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      cwd,
      env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      signal,
    });
    let out = "",
      error = "";
    child.stdout.on("data", (data) => {
      out += data;
      if (out.length > 4_000_000) child.kill();
    });
    child.stderr.on("data", (data) => {
      if (error.length < 4000) error += data;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        if (code !== 0)
          throw new Error(`Claude extraction exited ${code}: ${error.slice(0, 1000)}`);
        const value = JSON.parse(out);
        if (value.is_error || typeof value.result !== "string")
          throw new Error("Claude returned no completed extraction result");
        resolve(value.result);
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
export async function runClaudeWorker(dir: string) {
  const task: ExtractionTask = JSON.parse(await readFile(join(dir, "task.json"), "utf8"));
  if (!task.memoryDir) throw new Error("Task is missing its shared memory directory");
  const store = new MemoryStore(task.memoryDir),
    controller = new AbortController();
  task.pid = process.pid;
  task.applied = 0;
  task.savedIds = [];
  task.quality = { reviewed: 0, filtered: 0, duplicates: 0 };
  let committed = false,
    writes: Promise<unknown> = Promise.resolve();
  const cancel = () => {
    if (!committed) controller.abort();
  };
  const progress = (text: string) => {
    task.progress = text;
    task.updatedAt = new Date().toISOString();
    const copy = structuredClone(task);
    writes = writes.then(async () => {
      await appendFile(join(dir, "progress.log"), `${text}\n`, { mode: 0o600 });
      await writeTask(dir, copy);
    });
  };
  const check = async () => {
    if (!(await store.settings()).enabled) cancel();
    await access(join(dir, "cancel"))
      .then(cancel)
      .catch(() => {});
  };
  const poll = setInterval(() => {
    void check().catch(cancel);
  }, 250);
  process.on("SIGTERM", cancel);
  try {
    await check();
    if (controller.signal.aborted) throw new Error("Extraction cancelled");
    const snapshot = await readSnapshot(task.sourcePath),
      state = await store.read();
    task.candidates = await extractCandidates(
      { snapshot, state, previous: state.scans[snapshot.sessionId] },
      (payload) => claudeComplete(payload, task.model.id, dir, controller.signal),
      progress,
      () => controller.signal.aborted,
      (quality) => {
        task.quality = quality;
      },
    );
    for (const proposal of task.candidates) {
      await check();
      if (controller.signal.aborted) throw new Error("Extraction cancelled");
      if (isDuplicate(await store.read(), proposal, proposal.targetId)) {
        task.quality!.duplicates++;
        continue;
      }
      try {
        const saved = await store.apply(proposal);
        task.applied!++;
        if (saved) task.savedIds!.push(saved.id);
      } catch (e) {
        if (isDuplicate(await store.read(), proposal, proposal.targetId)) {
          task.quality!.duplicates++;
          continue;
        }
        throw e;
      }
    }
    await check();
    if (controller.signal.aborted) throw new Error("Extraction cancelled");
    await store.recordScan(snapshot.sessionId, {
      entries: snapshot.entries,
      completedAt: new Date().toISOString(),
      candidates: task.candidates.length,
    });
    committed = true;
    task.phase = "completed";
    progress(
      `Done. ${task.applied} memories saved · ${task.quality!.filtered} filtered · ${task.quality!.duplicates} duplicates.`,
    );
    await writes;
  } catch (e) {
    await writes.catch(() => {});
    task.phase = controller.signal.aborted ? "cancelled" : "failed";
    task.error = e instanceof Error ? e.message : String(e);
    task.updatedAt = new Date().toISOString();
    task.progress = `${task.phase === "cancelled" ? "Cancelled" : "Failed"}. ${task.applied} memories saved. Source checkpoint was not advanced.`;
    await writeTask(dir, task);
  } finally {
    clearInterval(poll);
    process.off("SIGTERM", cancel);
  }
}
