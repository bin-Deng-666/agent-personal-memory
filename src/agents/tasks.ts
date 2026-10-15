import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { getPackageDir } from "@earendil-works/pi-coding-agent";
import { mkdir, writeFile, realpath } from "node:fs/promises";
import lockfile from "proper-lockfile";
import { openSync, closeSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtractionTask } from "../domain/task.ts";
import { TaskRepository, writeTask } from "../storage/tasks.ts";
export { writeTask } from "../storage/tasks.ts";

export class TaskManager extends TaskRepository {
  private readonly runner = fileURLToPath(new URL("./runner.mjs", import.meta.url));
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
      memoryDir: this.memoryDir,
      runtime: "pi",
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
}
