import { randomUUID } from "node:crypto";
import { readFile, readdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { ExtractionTask } from "../domain/task.ts";

export async function writeTask(dir: string, task: ExtractionTask) {
  const temp = join(dir, `${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(task, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, join(dir, "task.json"));
}
export class TaskRepository {
  readonly dir: string;
  constructor(readonly memoryDir: string) {
    this.dir = join(memoryDir, "tasks");
  }
  taskDir(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid task ID");
    return join(this.dir, id);
  }
  async list(): Promise<ExtractionTask[]> {
    const names = await readdir(this.dir).catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return [];
      throw e;
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
  async cancel(id: string) {
    await writeFile(join(this.taskDir(id), "cancel"), "cancel\n", { mode: 0o600 });
  }
  async log(id: string) {
    return readFile(join(this.taskDir(id), "progress.log"), "utf8").catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") return "The agent is starting…";
        throw e;
      },
    );
  }
}
