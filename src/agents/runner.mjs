import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const dir = process.argv[2];
try {
  // Pi-managed packages do not install host peers. Reuse the exact host SDK handed off by the parent.
  const sdkEntry = process.argv[3]
    ? join(process.argv[3], "dist", "index.js")
    : fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
  const piRequire = createRequire(sdkEntry);
  const { createJiti } = piRequire("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: { "@earendil-works/pi-coding-agent": sdkEntry },
  });
  const { runWorker } = await jiti.import("./worker.ts");
  await runWorker(dir);
} catch (error) {
  if (dir) {
    const path = join(dir, "task.json");
    const task = JSON.parse(await readFile(path, "utf8"));
    task.phase = "failed";
    task.error = String(error);
    task.progress = "Agent failed to start";
    task.updatedAt = new Date().toISOString();
    await writeFile(path, JSON.stringify(task, null, 2) + "\n", { mode: 0o600 });
  }
  process.exitCode = 1;
}
