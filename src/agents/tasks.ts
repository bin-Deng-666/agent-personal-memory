import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { getPackageDir } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, readdir, writeFile, rename, realpath } from "node:fs/promises";
import lockfile from "proper-lockfile";
import { openSync, closeSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtractionTask } from "../domain/task.ts";
export async function writeTask(dir: string, task: ExtractionTask) {
  const temp = join(dir, `${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(task, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, join(dir, "task.json"));
}
export class TaskManager {
  readonly dir: string;
  private readonly runner = fileURLToPath(new URL("./runner.mjs", import.meta.url));
  constructor(memoryDir: string) {
    this.dir = join(memoryDir, "tasks");
  }
  private taskDir(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid task ID");
    return join(this.dir, id);
  }
  async list(): Promise<ExtractionTask[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    const tasks: ExtractionTask[] = [];
    for (const id of names) {
      if (!/^[a-f0-9-]{36}$/.test(id)) continue;
      try {
        const task: ExtractionTask = JSON.parse(
          await readFile(join(this.dir, id, "task.json"), "utf8"),
        );
        if (
          task.id !== id ||
          !["running", "completed", "failed", "cancelled"].includes(task.phase) ||
          !Array.isArray(task.candidates)
        )
          continue;
        if (task.phase === "running" && Date.now() - Date.parse(task.createdAt) > 10000) {
          const launch = task.pid
            ? { pid: task.pid }
            : JSON.parse(
                await readFile(join(this.dir, id, "launch.json"), "utf8").catch(() => "{}"),
              );
          if (launch.pid) {
            try {
              process.kill(launch.pid, 0);
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code === "ESRCH") {
                task.phase = "failed";
                task.error =
                  "The agent exited unexpectedly. Retry to continue; the source checkpoint was preserved.";
              }
            }
          }
        }
        tasks.push(task);
      } catch {
        /* An atomically published task may not be ready yet. */
      }
    }
    return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async start(
    input: Pick<ExtractionTask, "name" | "sourcePath" | "agentDir" | "model">,
  ): Promise<ExtractionTask> {
    const sourcePath = await realpath(input.sourcePath);
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const release = await lockfile.lock(this.dir, {
      realpath: false,
      stale: 30000,
      retries: { retries: 30, minTimeout: 50, maxTimeout: 300 },
    });
    try {
      return await this.startUnlocked({ ...input, sourcePath });
    } finally {
      await release();
    }
  }
  private async startUnlocked(
    input: Pick<ExtractionTask, "name" | "sourcePath" | "agentDir" | "model">,
  ): Promise<ExtractionTask> {
    const active = (await this.list()).find(
      (t) => t.sourcePath === input.sourcePath && t.phase === "running",
    );
    if (active) return active;
    const now = new Date().toISOString();
    const task: ExtractionTask = {
      ...input,
      id: randomUUID(),
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
    const runtime = /^(node|bun)(\.exe)?$/.test(basename(process.execPath))
      ? process.execPath
      : "node";
    try {
      const child = spawn(runtime, [this.runner, dir, getPackageDir()], {
        cwd: dir,
        detached: true,
        stdio: ["ignore", "ignore", stderr],
        shell: false,
        env: { ...process.env, PI_CODING_AGENT_DIR: input.agentDir },
      });
      child.on("error", (e) => {
        task.phase = "failed";
        task.error = e.message;
        task.updatedAt = new Date().toISOString();
        void writeTask(dir, task).catch(() => {});
      });
      child.unref();
      await writeFile(join(dir, "launch.json"), JSON.stringify({ pid: child.pid }), {
        mode: 0o600,
      });
      return task;
    } finally {
      closeSync(stderr);
    }
  }
  async cancel(id: string) {
    await writeFile(join(this.taskDir(id), "cancel"), "cancel\n", { mode: 0o600 });
  }
  async log(id: string) {
    try {
      return await readFile(join(this.taskDir(id), "progress.log"), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return "The agent is starting…";
      throw e;
    }
  }
}
