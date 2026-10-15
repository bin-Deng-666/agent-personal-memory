import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { DefaultPackageManager, SettingsManager } from "@earendil-works/pi-coding-agent";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "pi-memory-package-"));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this check through npm run check:package");
const run = promisify(execFile);
const npm = (args, cwd) =>
  run(process.execPath, [npmCli, ...args], { cwd, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
const hostRequire = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = hostRequire("jiti");
const aliases = Object.fromEntries(
  ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"].map((name) => [
    name,
    fileURLToPath(import.meta.resolve(name)),
  ]),
);
const jiti = createJiti(import.meta.url, { alias: aliases, moduleCache: false });
let server, manager;
let previousAgentDir = process.env.PI_CODING_AGENT_DIR;
try {
  const { stdout } = await npm(
    ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary],
    root,
  );
  const packed = JSON.parse(stdout);
  const artifact = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
  const files = artifact.files.map((file) => file.path);
  for (const required of [
    "claude/runtime.mjs",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    ".mcp.json",
    "hooks/hooks.json",
    "commands/memory.md",
    "index.ts",
    "src/agents/runner.mjs",
    "src/agents/worker.ts",
    "src/types/proper-lockfile.d.ts",
    "README.md",
    "README.zh-CN.md",
    "LICENSE",
    "docs/privacy.md",
  ])
    assert.ok(files.includes(required), `Missing package file: ${required}`);
  for (const file of files)
    assert.ok(
      /^(?:index\.ts|package\.json|README(?:\.zh-CN)?\.md|CHANGELOG\.md|LICENSE|src\/|docs\/|claude\/|\.claude-plugin\/|\.mcp\.json|hooks\/|commands\/)/.test(
        file,
      ),
      `Unexpected published file: ${file}`,
    );
  const consumer = join(temporary, "consumer");
  await mkdir(consumer);
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  await npm(
    [
      "install",
      join(temporary, artifact.filename),
      "--omit=dev",
      "--legacy-peer-deps",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--fetch-retries=0",
      "--fetch-timeout=20000",
    ],
    consumer,
  );
  const installed = join(consumer, "node_modules", "agent-personal-memory");
  const status = JSON.parse(
    (
      await run(process.execPath, [join(installed, "claude", "runtime.mjs"), "status"], {
        env: { ...process.env, PERSONAL_MEMORY_DIR: join(temporary, "claude-library") },
      })
    ).stdout,
  );
  assert.equal(
    status.total,
    0,
    "The packed Claude runtime must run without development dependencies or Pi",
  );
  const installedNames = await readdir(join(consumer, "node_modules"));
  assert.ok(
    !installedNames.includes("@earendil-works"),
    "The artifact must not install host SDK copies",
  );
  const agentDir = join(temporary, "agent");
  const settings = SettingsManager.inMemory();
  const packages = new DefaultPackageManager({
    cwd: temporary,
    agentDir,
    settingsManager: settings,
  });
  const discovered = await packages.resolveExtensionSources([installed]);
  assert.deepEqual(
    discovered.extensions.filter((resource) => resource.enabled).map((resource) => resource.path),
    [join(installed, "index.ts")],
  );
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const factory = (await jiti.import(join(installed, "index.ts"))).default;
  const handlers = new Map(),
    tools = new Map(),
    commands = new Map();
  let active = [];
  factory({
    on: (name, handler) => handlers.set(name, handler),
    registerTool: (tool) => tools.set(tool.name, tool),
    registerCommand: (name, command) => commands.set(name, command),
    getActiveTools: () => active,
    setActiveTools: (names) => (active = names),
    getAllTools: () => [...tools.values()],
  });
  const ctx = { mode: "print", hasUI: false };
  await handlers.get("session_start")({}, ctx);
  assert.ok(commands.has("memory"));
  assert.ok(tools.has("memory_write"));
  await handlers.get("session_shutdown")({}, ctx);
  const stages = [];
  server = createServer(async (request, response) => {
    try {
      let raw = "";
      for await (const part of request) raw += part;
      const body = JSON.parse(raw);
      const last = [...body.messages].reverse().find((message) => message.role === "user");
      const content =
        typeof last.content === "string"
          ? last.content
          : last.content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n");
      const payload = JSON.parse(content);
      stages.push(payload.stage);
      assert.equal(
        body.messages.filter((message) => message.role === "user").length,
        1,
        "Each extraction/review request uses fresh context",
      );
      const user = payload.conversation.find((message) => message.role === "user");
      const answer =
        payload.stage === "review"
          ? {
              reviews: payload.candidates.map((candidate) => ({
                index: candidate.index,
                verdict: "keep",
                reason: "Original evidence supports this reusable constraint.",
              })),
            }
          : {
              candidates: [
                {
                  action: "add",
                  title: "Offline work",
                  content: user.text,
                  type: "个人背景",
                  scope: "Tool selection",
                  certainty: "明确",
                  tags: [],
                  reason: "Future tool recommendations need to work offline.",
                  entryId: user.id,
                  quote: user.text,
                },
              ],
            };
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(
        `data: ${JSON.stringify({ id: "mock", choices: [{ index: 0, delta: { role: "assistant", content: JSON.stringify(answer) }, finish_reason: null }] })}\n\n`,
      );
      response.write(
        `data: ${JSON.stringify({ id: "mock", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
      );
      response.end("data: [DONE]\n\n");
    } catch (error) {
      response.writeHead(500);
      response.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  await writeFile(
    join(agentDir, "models.json"),
    JSON.stringify({
      providers: {
        smoke: {
          baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
          api: "openai-completions",
          apiKey: "local-test-only",
          models: [{ id: "fixture", contextWindow: 64000, maxTokens: 2048, reasoning: false }],
        },
      },
    }),
  );
  const source = join(temporary, "synthetic.jsonl");
  await writeFile(
    source,
    [
      {
        type: "session",
        id: "package-smoke",
        version: 3,
        cwd: temporary,
        timestamp: "2026-01-01T00:00:00Z",
      },
      {
        type: "message",
        id: "synthetic-user",
        parentId: null,
        timestamp: "2026-01-01T00:00:01Z",
        message: {
          role: "user",
          content: "I work in an offline environment and need tools that do not require a network.",
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n") + "\n",
  );
  const { TaskManager } = await jiti.import(join(installed, "src/agents/tasks.ts"));
  manager = new TaskManager(join(agentDir, "memory"));
  const job = await manager.start({
    sourcePath: source,
    name: "Synthetic smoke",
    agentDir,
    model: { provider: "smoke", id: "fixture" },
  });
  const deadline = Date.now() + 25000;
  let result;
  while (Date.now() < deadline) {
    result = (await manager.list()).find((task) => task.id === job.id);
    if (result && result.phase !== "running") break;
    await delay(50);
  }
  assert.equal(result?.phase, "completed", JSON.stringify(result));
  assert.equal(result.applied, 1);
  assert.deepEqual(stages, ["extract", "review"]);
  const records = JSON.parse(
    await readFile(join(agentDir, "memory", "records", "background.json"), "utf8"),
  );
  assert.equal(records.memories[0].sources[0].entryId, "synthetic-user");
  console.log(
    `Package verified: ${files.length} allowlisted files; Pi discovery, host-only SDK loading and detached extraction/review passed.`,
  );
} finally {
  if (manager)
    for (const task of await manager.list().catch(() => []))
      if (task.phase === "running") {
        await manager.cancel(task.id).catch(() => {});
        if (task.pid) {
          try {
            process.kill(task.pid, "SIGTERM");
          } catch {}
        }
      }
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(temporary, { recursive: true, force: true });
}
