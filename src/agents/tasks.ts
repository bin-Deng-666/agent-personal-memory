import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { getPackageDir } from "@earendil-works/pi-coding-agent";
import { mkdir, writeFile, readFile, readdir, rename, realpath } from "node:fs/promises";
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
  constructor(private readonly memoryDir: string) {
    this.dir = join(memoryDir, "tasks");
  }
  private taskDir(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid task ID");
    return join(this.dir, id);
  }
  async list(): Promise<ExtractionTask[]> {
    const names = await readdir(this.dir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
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
          if (launch.pid)
            try {
              process.kill(launch.pid, 0);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ESRCH") {
                task.phase = "failed";
                task.error =
                  "The agent exited unexpectedly. Retry to continue; the source checkpoint was preserved.";
              }
            }
        }
        tasks.push(task);
      } catch {
        /* A launch may not have published its task yet. */
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
      (task) => task.sourcePath === input.sourcePath && task.phase === "running",
    );
    if (active) return active;
    const now = new Date().toISOString();
    const task: ExtractionTask = {
      ...input,
      memoryDir: this.memoryDir,
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
      child.on("error", (error) => {
        task.phase = "failed";
        task.error = error.message;
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
    return readFile(join(this.taskDir(id), "progress.log"), "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "The agent is starting…";
        throw error;
      },
    );
  }
}
