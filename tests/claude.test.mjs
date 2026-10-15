import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const { createJiti } = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"))(
  "jiti",
);
const jiti = createJiti(import.meta.url);
const { MemoryStore } = await jiti.import("../src/storage/store.ts");
const { resolveMemoryDir } = await jiti.import("../src/storage/location.ts");
const { snapshotFromClaudeEntries, listClaudeConversations } = await jiti.import(
  "../src/history/claude.ts",
);
const { readSnapshot, makeSource } = await jiti.import("../src/history/sessions.ts");
const factory = (await jiti.import("../index.ts")).default;
const runtime = fileURLToPath(new URL("../claude/runtime.mjs", import.meta.url));
const message = (id, text, parentUuid = null, extra = {}) => ({
  type: "user",
  uuid: id,
  parentUuid,
  sessionId: "session-one",
  timestamp: "2026-01-01T00:00:00Z",
  message: { role: "user", content: text },
  ...extra,
});
const record = (content, extra = {}) => ({
  action: "add",
  title: content,
  content,
  type: "稳定偏好",
  scope: "",
  certainty: "明确",
  tags: [],
  reason: "A reusable collaboration preference",
  origin: "manual",
  sources: [],
  ...extra,
});
async function sandbox(t) {
  const dir = await mkdtemp(join(tmpdir(), "agent-memory-cross-host-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const env = {
    ...process.env,
    PERSONAL_MEMORY_DIR: join(dir, "shared"),
    PI_CODING_AGENT_DIR: join(dir, "pi"),
    CLAUDE_CONFIG_DIR: join(dir, "claude"),
  };
  const store = new MemoryStore(env.PERSONAL_MEMORY_DIR);
  await store.initialize();
  const bin = join(dir, "bin");
  await mkdir(bin);
  env.PATH = `${bin}:${env.PATH}`;
  await writeFile(
    join(bin, "claude"),
    `#!${process.execPath}\nimport fs from 'node:fs';const payload=JSON.parse(fs.readFileSync(0,'utf8'));const user=payload.conversation?.find(m=>m.role==='user'&&!m.context);const output=payload.stage==='review'?{reviews:payload.candidates.map(c=>({index:c.index,verdict:'keep',reason:'Supported personal constraint.'}))}:{candidates:[{action:'add',title:'Offline work',content:'Works offline most days.',type:'个人背景',scope:'Tool selection',certainty:'明确',tags:[],reason:'Choose offline tools',entryId:user.id,quote:user.text}]};console.log(JSON.stringify({is_error:false,result:JSON.stringify(output)}));\n`,
  );
  await chmod(join(bin, "claude"), 0o755);
  const path = join(env.CLAUDE_CONFIG_DIR, "projects", "project", "session-one.jsonl");
  await mkdir(join(env.CLAUDE_CONFIG_DIR, "projects", "project"), { recursive: true });
  await writeFile(path, "");
  const hook = (event, extra = {}) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [runtime, "hook"], {
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let out = "",
        err = "";
      child.stdout.on("data", (data) => (out += data));
      child.stderr.on("data", (data) => (err += data));
      child.on("error", reject);
      child.on("close", (code) => {
        try {
          if (code) throw new Error(err);
          resolve(JSON.parse(out));
        } catch (e) {
          reject(e);
        }
      });
      child.stdin.end(
        JSON.stringify({
          hook_event_name: event,
          session_id: "session-one",
          transcript_path: path,
          cwd: dir,
          ...extra,
        }),
      );
    });
  const client = new Client({ name: "cross-host-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [runtime, "mcp"],
    env,
    stderr: "pipe",
  });
  await client.connect(transport);
  t.after(() => client.close());
  const call = async (name, args) => {
    const result = await client.callTool({
      name,
      arguments: { sessionId: "session-one", ...args },
    });
    const text = result.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    return result.isError ? { error: text } : JSON.parse(text);
  };
  return { dir, env, store, path, hook, client, call };
}
test("shared location: new installs are neutral, existing Pi stores are reused, explicit directories win", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "agent-memory-path-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  assert.equal(
    resolveMemoryDir({ home, env: {} }),
    join(home, ".local", "share", "agent-personal-memory"),
  );
  const legacy = join(home, ".pi", "agent", "memory");
  await new MemoryStore(legacy).initialize();
  assert.equal(resolveMemoryDir({ home, env: {} }), legacy);
  assert.equal(
    resolveMemoryDir({ home, env: { PERSONAL_MEMORY_DIR: join(home, "custom") } }),
    join(home, "custom"),
  );
  assert.throws(
    () => resolveMemoryDir({ home, env: { PERSONAL_MEMORY_DIR: "relative" } }),
    /absolute/,
  );
  assert.equal(
    resolveMemoryDir({ home, env: { PI_CODING_AGENT_DIR: join(home, "pi-profile") } }),
    join(home, "pi-profile", "memory"),
  );
});
test("Claude transcript: original evidence respects branches, excludes tool/summary/command messages, namespaces sources", () => {
  const entries = [
    message("u1", "My original words."),
    message("discarded", "Wrong branch.", "u1"),
    message("a1", "Assistant suggestion.", "u1", {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Assistant suggestion." },
          { type: "thinking", thinking: "hidden" },
        ],
      },
    }),
    message(
      "u2",
      [
        { type: "tool_result", content: "Not user evidence." },
        { type: "text", text: "Current user words." },
      ],
      "a1",
    ),
    message("meta", "Fabricated summary.", "u2", { isCompactSummary: true }),
    message("command", "<command-name>/agent-personal-memory:memory</command-name>", "meta"),
  ];
  const snapshot = snapshotFromClaudeEntries("session-one", entries);
  assert.equal(snapshot.sessionId, "claude:session-one");
  assert.deepEqual(
    snapshot.messages.map((m) => m.id),
    ["u1", "a1", "u2"],
  );
  assert.equal(snapshot.messages[2].text, "Current user words.");
  assert.equal(makeSource(snapshot, "u2", "Current user words.").host, "claude");
  assert.throws(() => makeSource(snapshot, "a1", "Assistant suggestion."), /original user/);
  assert.throws(() => makeSource(snapshot, "u2", "Not user evidence."), /original user/);
});
test("Claude hooks: startup restores only habits, session binding is pinned, Off refreshes context", async (t) => {
  const h = await sandbox(t);
  await h.store.apply(record("回答时先给结论"));
  await h.store.apply(record("Private past experience.", { type: "个人经历" }));
  let result = await h.hook("SessionStart");
  let context = result.hookSpecificOutput.additionalContext;
  assert.ok(context.includes("回答时先给结论"));
  assert.ok(!context.includes("Private past experience."));
  assert.ok(result.suppressOutput);
  await h.hook("UserPromptSubmit", { prompt: "My current statement." });
  await writeFile(h.path, JSON.stringify(message("actual-user", "My current statement.")) + "\n");
  result = await h.hook("PreToolUse", {
    tool_name: "mcp__plugin_agent-personal-memory_memory__memory_write",
    tool_input: { sessionId: "forged", action: "add" },
  });
  assert.equal(result.hookSpecificOutput.updatedInput.sessionId, "session-one");
  assert.ok(result.hookSpecificOutput.additionalContext.includes("actual-user"));
  assert.equal(result.hookSpecificOutput.permissionDecision, "allow");
  await h.store.setEnabled(false);
  context = (await h.hook("UserPromptSubmit", { prompt: "Continue." })).hookSpecificOutput
    .additionalContext;
  assert.ok(context.includes("Memory Off"));
  assert.ok(!context.includes("回答时先给结论"));
});
test("Pi and Claude: one library, bidirectional capture, duplicate checks, version conflicts, shared switch", async (t) => {
  const h = await sandbox(t);
  const old = process.env.PERSONAL_MEMORY_DIR;
  process.env.PERSONAL_MEMORY_DIR = h.env.PERSONAL_MEMORY_DIR;
  const handlers = new Map(),
    tools = new Map();
  let active = [];
  factory({
    registerTool: (tool) => tools.set(tool.name, tool),
    registerCommand() {},
    on: (name, fn) => handlers.set(name, fn),
    getActiveTools: () => active,
    setActiveTools: (next) => (active = next),
    getAllTools: () => [...tools.values()],
  });
  if (old === undefined) delete process.env.PERSONAL_MEMORY_DIR;
  else process.env.PERSONAL_MEMORY_DIR = old;
  const entries = [
    {
      type: "message",
      id: "pi-user",
      parentId: null,
      timestamp: "2026-01-01T00:00:00Z",
      message: { role: "user", content: "回答时先给结论。" },
    },
  ];
  const ctx = {
    mode: "print",
    hasUI: false,
    sessionManager: {
      getSessionId: () => "pi-session",
      getEntries: () => entries,
      getLeafId: () => "pi-user",
    },
  };
  await handlers.get("session_start")({}, ctx);
  t.after(() => handlers.get("session_shutdown")({}, ctx));
  await handlers.get("before_agent_start")(
    { messageType: "user", prompt: "回答时先给结论。", systemPromptOptions: { sections: {} } },
    ctx,
  );
  await tools.get("memory_write").execute(
    "pi-call",
    {
      action: "add",
      title: "先给结论",
      content: "回答时先给结论",
      type: "稳定偏好",
      reason: "长期合作习惯",
      entryId: "pi-user",
      quote: "回答时先给结论。",
    },
    undefined,
    undefined,
    ctx,
  );
  await h.hook("SessionStart");
  await h.hook("UserPromptSubmit", { prompt: "I work offline most days." });
  await writeFile(
    h.path,
    JSON.stringify(message("claude-user", "I work offline most days.")) + "\n",
  );
  let result = await h.call("memory_search", { query: "结论" });
  assert.equal(result.memories.length, 1);
  result = await h.call("memory_write", {
    action: "add",
    title: "Offline work",
    content: "Works offline most days.",
    type: "个人背景",
    reason: "Choose tools that work offline",
    entryId: "claude-user",
    quote: "I work offline most days.",
  });
  assert.equal(result.status, "applied");
  const search = await tools.get("memory_search").execute("pi-search", { query: "offline" });
  assert.equal(search.details.memories.length, 1);
  assert.ok(!Object.hasOwn(search.details.memories[0], "content"));
  result = await h.call("memory_write", {
    action: "add",
    title: "Duplicate",
    content: "Works offline most days.",
    type: "个人背景",
    reason: "Same constraint",
    entryId: "claude-user",
    quote: "I work offline most days.",
  });
  assert.equal(result.status, "duplicate");
  assert.match((await h.call("memory_manage", { operation: "list" })).error, /Open/);
  await h.hook("UserPromptSubmit", { prompt: "/agent-personal-memory:memory" });
  let list = await h.call("memory_manage", { operation: "list" });
  assert.equal(list.total, 2);
  const memory = list.memories.find((m) => m.type === "稳定偏好");
  assert.deepEqual((await h.call("memory_manage", { operation: "detail", id: memory.id })).fields, [
    "Content",
    "Type",
  ]);
  await h.store.apply({
    ...record("回答时先给结论，再给依据"),
    action: "update",
    targetId: memory.id,
    targetVersion: memory.version,
  });
  assert.match(
    (
      await h.call("memory_manage", {
        operation: "update",
        id: memory.id,
        version: memory.version,
        content: "stale",
      })
    ).error,
    /changed/,
  );
  const current = (await h.call("memory_manage", { operation: "detail", id: memory.id })).memory;
  result = await h.call("memory_manage", {
    operation: "update",
    id: current.id,
    version: current.version,
    content: "回答时先给结论，并列出依据",
  });
  assert.equal(result.status, "applied");
  assert.equal((await h.store.read()).memories.find((m) => m.id === memory.id).version, 3);
  await h.call("memory_manage", { operation: "toggle", enabled: false });
  assert.equal((await h.store.settings()).enabled, false);
  assert.equal((await tools.get("memory_search").execute("pi-off", {})).details.status, "disabled");
  result = await h.call("memory_write", {
    action: "add",
    reason: "off",
    entryId: "claude-user",
    quote: "I work offline most days.",
  });
  assert.equal(result.status, "disabled");
});
test("Claude background: independent worker extracts, reviews, saves and checkpoints; tasks are shared with Pi", async (t) => {
  const h = await sandbox(t);
  await writeFile(h.path, JSON.stringify(message("u1", "I work offline most days.")) + "\n");
  await h.hook("SessionStart");
  await h.hook("UserPromptSubmit", { prompt: "/agent-personal-memory:extract" });
  const rows = (await h.call("memory_manage", { operation: "conversations" })).conversations;
  assert.equal(rows.length, 1);
  const launched = await h.call("memory_manage", { operation: "start", paths: [h.path] });
  assert.equal(launched.tasks.length, 1);
  const id = launched.tasks[0].id;
  let task;
  for (let tries = 0; tries < 100; tries++) {
    task = (await h.call("memory_manage", { operation: "task", id })).task;
    if (task.phase !== "running") break;
    await delay(50);
  }
  assert.equal(task.phase, "completed", JSON.stringify(task));
  assert.equal(task.applied, 1);
  assert.equal(task.quality.reviewed, 1);
  assert.equal((await h.store.read()).memories[0].sources[0].host, "claude");
  assert.ok((await h.store.read()).scans["claude:session-one"]);
  const { TaskManager } = await jiti.import("../src/agents/tasks.ts");
  const piTasks = await new TaskManager(h.store.dir).list();
  assert.equal(piTasks[0].id, id);
  assert.equal(piTasks[0].phase, "completed");
  assert.equal(piTasks[0].runtime, "claude");
});
test("Claude management: extraction rejects arbitrary paths and a shared Off switch cancels pending tasks", async (t) => {
  const h = await sandbox(t);
  await h.hook("SessionStart");
  await h.hook("UserPromptSubmit", { prompt: "/agent-personal-memory:memory" });
  assert.match(
    (await h.call("memory_manage", { operation: "start", paths: [join(h.dir, "private.json")] }))
      .error,
    /available conversation/,
  );
  const id = "00000000-0000-0000-0000-000000000001",
    dir = join(h.store.dir, "tasks", id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "task.json"),
    JSON.stringify({
      id,
      name: "Pending",
      phase: "running",
      sourcePath: h.path,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      candidates: [],
    }),
  );
  await h.call("memory_manage", { operation: "toggle", enabled: false });
  assert.equal((await readFile(join(dir, "cancel"), "utf8")).trim(), "cancel");
  assert.match(
    (await h.call("memory_manage", { operation: "start", paths: [h.path] })).error,
    /Memory is off/,
  );
});
test("Claude history: generic snapshot loading and extraction checkpoints use the same records", async (t) => {
  const h = await sandbox(t);
  await writeFile(h.path, JSON.stringify(message("u1", "A significant past experience.")) + "\n");
  const snapshot = await readSnapshot(h.path);
  let rows = await listClaudeConversations(
    await h.store.read(),
    join(h.env.CLAUDE_CONFIG_DIR, "projects"),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "Not extracted");
  await h.store.recordScan(snapshot.sessionId, {
    entries: snapshot.entries,
    completedAt: new Date().toISOString(),
    candidates: 0,
  });
  rows = await listClaudeConversations(
    await h.store.read(),
    join(h.env.CLAUDE_CONFIG_DIR, "projects"),
  );
  assert.equal(rows[0].status, "Extracted");
  await writeFile(h.path, JSON.stringify(message("u1", "Changed original words.")) + "\n");
  rows = await listClaudeConversations(
    await h.store.read(),
    join(h.env.CLAUDE_CONFIG_DIR, "projects"),
  );
  assert.equal(rows[0].status, "Updated");
});
