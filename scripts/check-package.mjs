import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  DefaultPackageManager,
  SettingsManager,
  getPackageDir,
} from "@earendil-works/pi-coding-agent";
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "agent-memory-packages-"));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run through npm run check:package");
const run = promisify(execFile);
const npm = (args, cwd) =>
  run(process.execPath, [npmCli, ...args], { cwd, timeout: 60000, maxBuffer: 4_000_000 });
const hostRequire = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = hostRequire("jiti");
const aliases = Object.fromEntries(
  ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"].map((name) => [
    name,
    fileURLToPath(import.meta.resolve(name)),
  ]),
);
const jiti = createJiti(import.meta.url, { alias: aliases, moduleCache: false });
let server;
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
async function pack(name, required, allowed) {
  const { stdout } = await npm(
    ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary],
    join(root, "packages", name),
  );
  const values = JSON.parse(stdout),
    artifact = Array.isArray(values) ? values[0] : Object.values(values)[0];
  const paths = artifact.files.map((file) => file.path);
  for (const path of required) assert.ok(paths.includes(path), `${name}: missing ${path}`);
  for (const path of paths)
    assert.ok(allowed.test(path), `${name}: unexpected installed resource ${path}`);
  return join(temporary, artifact.filename);
}
try {
  const piArtifact = await pack(
    "pi",
    [
      "index.ts",
      "runtime/extension.ts",
      "runtime/worker.ts",
      "runtime/runner.mjs",
      "README.md",
      "LICENSE",
    ],
    /^(?:package\.json|index\.ts|README\.md|LICENSE|runtime\/)/,
  );
  const claudeArtifact = await pack(
    "claude-code",
    [
      "runtime.mjs",
      ".claude-plugin/plugin.json",
      ".mcp.json",
      "commands/personal-memory.md",
      "commands/setup.md",
      "hooks/hooks.json",
      "README.md",
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
    ],
    /^(?:package\.json|runtime\.mjs|\.claude-plugin\/|\.mcp\.json|commands\/|hooks\/|README\.md|LICENSE|THIRD_PARTY_NOTICES\.md)/,
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
      piArtifact,
      claudeArtifact,
      "--omit=dev",
      "--legacy-peer-deps",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    consumer,
  );
  assert.ok(
    !(await readdir(join(consumer, "node_modules"))).includes("@earendil-works"),
    "Neither package may install host SDK copies",
  );
  const installed = join(consumer, "node_modules", "agent-personal-memory-pi");
  const claudeInstalled = join(consumer, "node_modules", "@agent-personal-memory", "claude-code");
  const status = JSON.parse(
    (
      await run(process.execPath, [join(claudeInstalled, "runtime.mjs"), "status"], {
        env: { ...process.env, PERSONAL_MEMORY_DIR: join(temporary, "claude-library") },
      })
    ).stdout,
  );
  assert.equal(status.label, "Personal Memory On · 0 total · 0 habits loaded");
  const agentDir = join(temporary, "agent");
  const packages = new DefaultPackageManager({
    cwd: temporary,
    agentDir,
    settingsManager: SettingsManager.inMemory(),
  });
  const discovered = await packages.resolveExtensionSources([installed]);
  assert.deepEqual(
    discovered.extensions.filter((resource) => resource.enabled).map((resource) => resource.path),
    [join(installed, "index.ts")],
  );
  const routed = await packages.resolveExtensionSources([root]);
  assert.deepEqual(
    routed.extensions.filter((resource) => resource.enabled).map((resource) => resource.path),
    [join(root, "packages/pi/index.ts")],
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
  assert.ok(commands.has("personal-memory"));
  assert.ok(!commands.has("memory"));
  assert.ok(tools.has("memory_write"));
  await handlers.get("session_shutdown")({}, ctx);
  const stages = [];
  server = createServer(async (request, response) => {
    try {
      let raw = "";
      for await (const part of request) raw += part;
      const body = JSON.parse(raw),
        last = [...body.messages].reverse().find((message) => message.role === "user");
      const content =
        typeof last.content === "string"
          ? last.content
          : last.content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n");
      const payload = JSON.parse(content);
      stages.push(payload.stage);
      assert.equal(body.messages.filter((message) => message.role === "user").length, 1);
      const user = payload.conversation.find((message) => message.role === "user");
      const answer =
        payload.stage === "review"
          ? {
              reviews: payload.candidates.map((candidate) => ({
                index: candidate.index,
                verdict: "keep",
                reason: "Supported personal constraint.",
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
                  reason: "Choose offline tools",
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
          content: "I work offline and need tools that do not require a network.",
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n") + "\n",
  );
  const id = randomUUID(),
    taskDir = join(agentDir, "memory", "tasks", id);
  await mkdir(taskDir, { recursive: true });
  await writeFile(
    join(taskDir, "task.json"),
    JSON.stringify({
      id,
      name: "Synthetic smoke",
      sourcePath: source,
      agentDir,
      memoryDir: join(agentDir, "memory"),
      model: { provider: "smoke", id: "fixture" },
      phase: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: "Starting",
      candidates: [],
    }),
  );
  await run(process.execPath, [join(installed, "runtime/runner.mjs"), taskDir, getPackageDir()], {
    timeout: 25000,
    env: process.env,
  });
  const task = JSON.parse(await readFile(join(taskDir, "task.json"), "utf8"));
  assert.equal(task.phase, "completed", JSON.stringify(task));
  assert.equal(task.applied, 1);
  assert.deepEqual(stages, ["extract", "review"]);
  const records = JSON.parse(
    await readFile(join(agentDir, "memory/records/background.json"), "utf8"),
  );
  assert.equal(records.memories[0].sources[0].entryId, "synthetic-user");
  console.log(
    "Separate packages verified: Pi-only artifact/discovery/bundled worker; Claude-only artifact/standalone runtime; no host SDK copies or cross-host resources.",
  );
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(temporary, { recursive: true, force: true });
}
