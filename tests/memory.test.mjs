import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const piPath = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
const piRequire = createRequire(piPath);
const { createJiti } = piRequire("jiti");
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { MemoryStore } = await jiti.import("../src/storage/store.ts");
const { TYPES, TYPE_FILES, isDuplicate, sourceKey } = await jiti.import("../src/domain/memory.ts");
const { resolveMemoryDir } = await jiti.import("../src/storage/location.ts");
const { searchMemories, habitContext } = await jiti.import("../src/domain/search.ts");
const { snapshotFromEntries, extractionStatus, extractionChunks, makeSource } = await jiti.import(
  "../src/history/sessions.ts",
);
const { MemoryPicker, pickerState } = await jiti.import("../src/ui/picker.ts");
const { extractCandidates } = await jiti.import("../src/history/extraction.ts");
const factory = (await jiti.import("../index.ts")).default;
const theme = { fg: (_color, text) => text, bold: (text) => text };
const keys = {
  matches: (data, action) =>
    ({
      "tui.select.up": "UP",
      "tui.select.down": "DOWN",
      "tui.select.confirm": "ENTER",
      "tui.select.cancel": "ESC",
    })[action] === data,
};
const fixture = (text = "我长期在内网环境工作，很多工具无法访问外网。") => [
  {
    type: "session",
    id: "session-test",
    version: 3,
    cwd: "/tmp",
    timestamp: "2026-01-01T00:00:00Z",
  },
  {
    type: "message",
    id: "user-1",
    parentId: null,
    timestamp: "2026-01-01T00:00:01Z",
    message: { role: "user", content: text },
  },
  {
    type: "message",
    id: "assistant-1",
    parentId: "user-1",
    timestamp: "2026-01-01T00:00:02Z",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "了解你的工作条件。" },
        { type: "thinking", thinking: "ignore" },
      ],
    },
  },
];
const proposal = (content = "长期在内网工作，工具不能访问外网。", extra = {}) => ({
  action: "add",
  title: "内网工作条件",
  content,
  type: "个人背景",
  scope: "工具选型",
  certainty: "明确",
  tags: ["工作"],
  reason: "未来工具选型需考虑离线可用性",
  origin: "automatic",
  sources: [],
  ...extra,
});
async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), "pi-memory-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function harness(t, options = {}) {
  const dir = await temporary(t);
  const oldEnv = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  const tools = new Map(),
    commands = new Map(),
    handlers = new Map();
  let active = ["read", "bash"];
  const entries = options.entries || fixture(),
    notifications = [],
    messages = [],
    statuses = [];
  const dialogs = [...(options.dialogs || [])];
  factory({
    registerTool: (tool) => tools.set(tool.name, tool),
    registerCommand: (name, command) => commands.set(name, command),
    on: (event, handler) => handlers.set(event, handler),
    getActiveTools: () => active,
    setActiveTools: (names) => (active = names),
    getAllTools: () => [...tools.values()],
    sendUserMessage: (text) => messages.push(text),
  });
  if (oldEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = oldEnv;
  const ctx = {
    mode: options.mode || "tui",
    hasUI: true,
    cwd: "/tmp",
    model: { id: "fake-model", provider: "fake" },
    sessionManager: {
      getSessionId: () => "session-test",
      getEntries: () => entries,
      getLeafId: () => entries.at(-1).id,
      getSessionDir: () => join(dir, "sessions", "--tmp--"),
    },
    ui: {
      theme,
      setFooter() {},
      notify: (text, type) => notifications.push({ text, type }),
      setStatus: (_key, text) => statuses.push(text),
      select: async () => {
        throw new Error("Unexpected confirmation");
      },
      editor: async () => {
        throw new Error("Unexpected confirmation");
      },
      custom: async (create) => {
        let component;
        const value = await new Promise((resolve) => {
          component = create({ terminal: { rows: 30 }, requestRender() {} }, theme, keys, resolve);
          for (const action of dialogs.shift() || ["ESC"]) component.handleInput(action);
        });
        component.dispose?.();
        return value;
      },
    },
  };
  const store = new MemoryStore(join(dir, "memory"));
  await handlers.get("session_start")({}, ctx);
  t.after(() => handlers.get("session_shutdown")?.({}, ctx));
  const start = async (prompt) => {
    const event = { messageType: "user", prompt, systemPromptOptions: { sections: {} } };
    await handlers.get("before_agent_start")(event, ctx);
    return event;
  };
  const call = (params) =>
    tools.get("memory_write").execute("call", params, undefined, undefined, ctx);
  const project = (input) =>
    handlers.get("context_with_system")(
      {
        messages: input || [
          {
            role: "system",
            content: "Base prompt",
            sections: { project: "Preserve project rules" },
            toolsAdded: [{ name: "read", description: "Read", parameters: {} }],
            timestamp: 1,
          },
          { role: "user", content: fixture()[1].message.content, timestamp: 2 },
        ],
      },
      ctx,
    );
  return {
    dir,
    ctx,
    store,
    tools,
    commands,
    handlers,
    start,
    call,
    project,
    entries,
    notifications,
    messages,
    statuses,
    dialogs,
    active: () => active,
  };
}
const toolParams = (extra = {}) => ({
  action: "add",
  title: "内网工作条件",
  content: "长期在内网工作，工具不能访问外网。",
  type: "个人背景",
  reason: "未来工具选型需要考虑离线可用性",
  entryId: "user-1",
  quote: "我长期在内网环境工作，很多工具无法访问外网。",
  ...extra,
});

test("storage: Pi library selection preserves existing data and rejects ambiguous directories", async (t) => {
  const home = await temporary(t),
    primary = join(home, ".pi", "agent", "memory"),
    alternate = join(home, ".local", "share", "agent-personal-memory");
  assert.equal(resolveMemoryDir({ home, env: {} }), primary);
  await new MemoryStore(alternate).initialize();
  assert.equal(resolveMemoryDir({ home, env: {} }), alternate);
  await new MemoryStore(primary).initialize();
  assert.throws(() => resolveMemoryDir({ home, env: {} }), /Two initialized memory libraries/);
  assert.equal(resolveMemoryDir({ home, env: { PERSONAL_MEMORY_DIR: primary } }), primary);
  assert.equal(
    resolveMemoryDir({ home, env: { PI_CODING_AGENT_DIR: join(home, "profile") } }),
    join(home, "profile", "memory"),
  );
  assert.throws(
    () => resolveMemoryDir({ home, env: { PERSONAL_MEMORY_DIR: "relative" } }),
    /absolute/,
  );
});

test("storage: stored origin namespaces survive edits and retain deletion suppression", async (t) => {
  const store = new MemoryStore(await temporary(t));
  const source = {
    ...makeSource(
      snapshotFromEntries("session-test", fixture()),
      "user-1",
      fixture()[1].message.content,
    ),
    host: "archive",
  };
  const saved = await store.apply(
    proposal("A supported original personal condition", { origin: "manual", sources: [source] }),
  );
  const updated = await store.apply(
    proposal("A manually clarified personal condition", {
      action: "update",
      targetId: saved.id,
      targetVersion: saved.version,
      origin: "manual",
    }),
  );
  assert.equal(updated.sources[0].host, "archive");
  assert.ok(sourceKey(source).startsWith("source:archive:"));
  await store.apply(
    proposal(updated.content, {
      action: "delete",
      targetId: updated.id,
      targetVersion: updated.version,
      origin: "manual",
    }),
  );
  assert.ok((await store.read()).suppressed.includes(sourceKey(source)));
});

test("storage: five independent category files and concurrent instances", async (t) => {
  const dir = await temporary(t),
    a = new MemoryStore(dir),
    b = new MemoryStore(dir);
  await a.initialize();
  assert.equal((await a.settings()).enabled, true);
  await Promise.all(
    Array.from({ length: 14 }, (_, i) =>
      (i % 2 ? a : b).apply(
        proposal(`重要个人经历 ${i}`, { title: `经历 ${i}`, type: TYPES[i % 5] }),
      ),
    ),
  );
  assert.equal((await a.read()).memories.length, 14);
  assert.deepEqual((await readdir(a.recordsDir)).sort(), Object.values(TYPE_FILES).sort());
  const metadata = await readFile(a.file, "utf8");
  assert.ok(!metadata.includes("重要个人经历"));
  for (const type of TYPES) assert.ok((await a.readType(type)).every((m) => m.type === type));
});

test("storage: independent processes serialize writes without losing records", async (t) => {
  const dir = await temporary(t);
  const path = fileURLToPath(new URL("../src/storage/store.ts", import.meta.url));
  const jitiPath = piRequire.resolve("jiti");
  const script = `import {createJiti} from ${JSON.stringify(jitiPath)}; const j=createJiti(import.meta.url); const {MemoryStore}=await j.import(${JSON.stringify(path)}); await new MemoryStore(process.argv[1]).apply(JSON.parse(process.argv[2]));`;
  await Promise.all(
    [0, 1, 2, 3].map(
      (i) =>
        new Promise((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [
              "--input-type=module",
              "-e",
              script,
              dir,
              JSON.stringify(proposal(`跨进程经历 ${i}`, { title: `经历 ${i}` })),
            ],
            { stdio: ["ignore", "ignore", "pipe"] },
          );
          let stderr = "";
          child.stderr.on("data", (d) => (stderr += d));
          child.on("error", reject);
          child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(stderr))));
        }),
    ),
  );
  assert.equal((await new MemoryStore(dir).read()).memories.length, 4);
});

test("storage: moving a record between types is versioned and leaves no duplicate", async (t) => {
  const store = new MemoryStore(await temporary(t));
  const original = await store.apply(proposal());
  await store.apply(
    proposal("重要的职业转折经历", {
      action: "update",
      targetId: original.id,
      targetVersion: 1,
      type: "个人经历",
    }),
  );
  assert.equal((await store.readType("个人背景")).length, 0);
  assert.equal((await store.readType("个人经历"))[0].version, 2);
  await assert.rejects(
    store.apply(
      proposal("旧确认不能覆盖新内容", {
        action: "update",
        targetId: original.id,
        targetVersion: 1,
      }),
    ),
    /another session/,
  );
});

test("storage: journal recovery republishes all categories before reads", async (t) => {
  const store = new MemoryStore(await temporary(t));
  const m = await store.apply(proposal());
  const state = await store.read();
  state.memories[0] = { ...m, type: "个人经历", version: 2 };
  await writeFile(store.journalFile, JSON.stringify(state));
  const recovered = await store.read();
  assert.equal(recovered.memories[0].type, "个人经历");
  assert.equal((await store.readType("个人背景")).length, 0);
  assert.equal((await store.readType("个人经历")).length, 1);
  await assert.rejects(readFile(store.journalFile), /ENOENT/);
});

test("storage: legacy single-file layout migrates without retaining plaintext backups", async (t) => {
  const dir = await temporary(t),
    old = {
      schemaVersion: 1,
      memories: [
        {
          ...proposal("旧记忆"),
          id: "legacy",
          version: 1,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
      ],
      suppressed: [],
      scans: {},
    };
  await writeFile(join(dir, "memories.json"), JSON.stringify(old));
  await writeFile(join(dir, "settings.json"), JSON.stringify({ ask: false }));
  const store = new MemoryStore(dir);
  await store.initialize();
  assert.equal((await store.read()).memories[0].id, "legacy");
  assert.deepEqual(await store.settings(), { enabled: true });
  await assert.rejects(readFile(join(dir, "memories.json")), /ENOENT/);
});

test("storage: retired approval metadata is ignored and dropped on the next commit", async (t) => {
  const store = new MemoryStore(await temporary(t));
  const memory = await store.apply(proposal());
  const scan = { entries: { "user-1": "fingerprint" }, completedAt: "2026-01-01", candidates: 1 };
  await store.recordScan("session-test", scan);
  const metadata = JSON.parse(await readFile(store.file, "utf8"));
  metadata.decisions = { "retired-proposal": "saved" };
  await writeFile(store.file, JSON.stringify(metadata));
  const loaded = await store.read();
  assert.equal(Object.hasOwn(loaded, "decisions"), false);
  assert.deepEqual(loaded.scans["session-test"], scan);
  assert.equal(loaded.memories[0].id, memory.id);
  await store.apply(
    proposal("更新后的个人背景", {
      action: "update",
      targetId: memory.id,
      targetVersion: memory.version,
    }),
  );
  const committed = JSON.parse(await readFile(store.file, "utf8"));
  assert.equal(Object.hasOwn(committed, "decisions"), false);
  assert.deepEqual(committed.scans["session-test"], scan);
  assert.equal(await store.count(), 1);
  assert.equal((await store.read()).memories[0].version, 2);
});

test("storage: deleted content is removed and original sources cannot resurrect it", async (t) => {
  const store = new MemoryStore(await temporary(t));
  const source = makeSource(
    snapshotFromEntries("session-test", fixture()),
    "user-1",
    fixture()[1].message.content,
  );
  const memory = await store.apply(proposal("独特的私人经历正文", { sources: [source] }));
  await store.apply(
    proposal(memory.content, {
      action: "delete",
      targetId: memory.id,
      targetVersion: memory.version,
    }),
  );
  assert.ok(
    !(await readFile(join(store.recordsDir, TYPE_FILES["个人背景"]), "utf8")).includes(
      "独特的私人经历正文",
    ),
  );
  assert.ok(isDuplicate(await store.read(), proposal("换一种表述", { sources: [source] })));
});

test("storage: invalid data is not overwritten", async (t) => {
  const store = new MemoryStore(await temporary(t));
  await writeFile(store.file, "{broken");
  await assert.rejects(store.apply(proposal()), /original file was preserved/);
  assert.equal(await readFile(store.file, "utf8"), "{broken");
});

test("storage: Off rejects automatic writes inside the transaction but allows deliberate UI edits", async (t) => {
  const store = new MemoryStore(await temporary(t));
  await store.setEnabled(false);
  await assert.rejects(store.apply(proposal()), /Memory is off/);
  await store.apply(proposal("手动管理的内容", { origin: "manual" }));
  assert.equal((await store.read()).memories.length, 1);
});

test("history: only three statuses; metadata and compaction do not count as updates", () => {
  const entries = fixture();
  const snap = snapshotFromEntries("session-test", entries);
  const scan = { entries: snap.entries, completedAt: "", candidates: 0 };
  assert.equal(extractionStatus(snap), "未提取");
  assert.equal(extractionStatus(snap, scan), "已提取");
  const changed = [
    ...entries,
    { type: "session_info", id: "rename", parentId: "assistant-1", name: "New name" },
    { type: "compaction", id: "compact", parentId: "rename", summary: "Summary" },
  ];
  assert.equal(extractionStatus(snapshotFromEntries("session-test", changed), scan), "已提取");
  changed.push({
    type: "message",
    id: "new",
    parentId: "compact",
    message: { role: "user", content: "新的个人认识" },
  });
  assert.equal(extractionStatus(snapshotFromEntries("session-test", changed), scan), "有更新");
});

test("history: active branches/context edits and original-user evidence", () => {
  const entries = [
    ...fixture(),
    {
      type: "message",
      id: "other",
      parentId: "user-1",
      message: { role: "user", content: "另一分支" },
    },
    {
      type: "context_edit",
      id: "edit",
      parentId: "assistant-1",
      targetId: "user-1",
      replacement: null,
    },
  ];
  const snap = snapshotFromEntries("session-test", entries, "edit");
  assert.deepEqual(
    snap.messages.map((m) => m.id),
    ["assistant-1"],
  );
  assert.throws(() => makeSource(snap, "user-1", "我长期"), /original user message/);
  assert.throws(() => makeSource(snap, "assistant-1", "了解"), /original user message/);
});

test("history: incremental/long-message chunks retain original source IDs", () => {
  const old = snapshotFromEntries("session-test", fixture());
  const next = snapshotFromEntries("session-test", [
    ...fixture(),
    {
      type: "message",
      id: "new",
      parentId: "assistant-1",
      message: { role: "user", content: "经历".repeat(10000) },
    },
  ]);
  const chunks = extractionChunks(next, { entries: old.entries }, 3000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.some((m) => m.id === "new")));
  assert.deepEqual(extractionChunks(old, { entries: old.entries }), []);
});

test("context: only collaboration habits enter ordinary prompts, with a fixed budget", () => {
  const records = [
    proposal("回答时先给结论，细节按需展开", { id: "habit", type: "稳定偏好" }),
    proposal("一段不应自动加载的经历", { id: "experience", type: "个人经历" }),
    proposal("我喜欢吃草莓", { id: "taste", type: "稳定偏好" }),
  ].map((m) => ({ ...m, version: 1, updatedAt: "2026-01-01" }));
  const text = habitContext(records);
  assert.ok(text.includes("先给结论"));
  assert.ok(!text.includes("经历"));
  assert.ok(!text.includes("草莓"));
  assert.ok(habitContext(records, 30).length <= 30);
});

test("UI: Chinese search, IME focus and selection retained on return", async () => {
  const memory = { ...proposal(), id: "record", version: 1, updatedAt: "2026-01-01" };
  assert.equal(searchMemories([memory], "内网")[0].id, "record");
  const state = pickerState();
  let selected;
  const picker = new MemoryPicker(
    "Library",
    [{ value: "record", label: "内网经历", description: "中文窄窗口长说明" }],
    state,
    theme,
    keys,
    (value) => (selected = value),
    () => {},
  );
  picker.focused = true;
  assert.equal(picker.input.focused, true);
  picker.handleInput("内");
  picker.handleInput("网");
  picker.handleInput("ENTER");
  assert.equal(selected, "record");
  const again = new MemoryPicker(
    "Library",
    picker.items,
    state,
    theme,
    keys,
    () => {},
    () => {},
  );
  assert.equal(again.input.getValue(), "内网");
  const { visibleWidth } = await import("@earendil-works/pi-tui");
  for (const width of [12, 30, 80])
    assert.ok(again.render(width).every((line) => visibleWidth(line) <= width));
});

test("live tools: valuable content is saved directly, with no confirmation dialogs", async (t) => {
  const h = await harness(t);
  await h.start(fixture()[1].message.content);
  assert.ok(h.active().includes("memory_write"));
  assert.equal((await h.call(toolParams())).details.status, "applied");
  assert.equal((await h.store.read()).memories.length, 1);
  assert.deepEqual(h.notifications, []);
  const tool = h.tools.get("memory_write");
  assert.equal(tool.renderShell, "self");
  assert.deepEqual(tool.renderCall().render(80), []);
  assert.deepEqual(tool.renderResult().render(80), []);
  assert.equal((await h.call(toolParams())).details.status, "duplicate");
});

test("live tools: changing On/Off from /personal-memory takes effect within the same run", async (t) => {
  const h = await harness(t, {
    dialogs: [
      ["\t", "ESC"],
      ["\t", "ESC"],
    ],
  });
  await h.start(fixture()[1].message.content);
  const on = await h.project();
  assert.ok(on.messages.some((m) => m.sections?.personal_memory));
  await h.commands.get("personal-memory").handler("", h.ctx);
  assert.equal((await h.store.settings()).enabled, false);
  assert.ok(!h.active().includes("memory_write"));
  const off = await h.project(on.messages);
  assert.ok(off.messages.every((m) => !m.sections?.personal_memory));
  assert.equal(off.messages[0].sections.project, "Preserve project rules");
  assert.ok(off.messages.every((m) => !m.toolsAdded?.some((t) => t.name.startsWith("memory_"))));
  assert.equal((await h.call(toolParams())).details.status, "disabled");
  await h.commands.get("personal-memory").handler("", h.ctx);
  assert.equal((await h.store.settings()).enabled, true);
  const restored = await h.project(off.messages);
  assert.ok(restored.messages.some((m) => m.sections?.personal_memory));
  assert.ok(h.active().includes("memory_write"));
});

test("library: deleting a loaded collaboration habit immediately clears the footer and next context", async (t) => {
  const h = await harness(t, {
    dialogs: [
      ["ENTER", "ENTER"],
      ["\x1b[C", "\x1b[C", "ENTER"],
      ["ESC", "ESC"],
    ],
  });
  await h.store.apply(proposal("回答时先给结论", { type: "稳定偏好" }));
  await h.start("继续讨论");
  await h.project();
  assert.ok(h.statuses.at(-1).includes("1 habit loaded"));
  await h.commands.get("personal-memory").handler("", h.ctx);
  assert.equal((await h.store.read()).memories.length, 0);
  assert.ok(h.statuses.at(-1).includes("0 habits loaded"));
  assert.ok(
    !(await h.project()).messages.some((m) =>
      m.sections?.personal_memory?.includes("回答时先给结论"),
    ),
  );
  assert.deepEqual(h.notifications, []);
});

test("storage: independent facts can share one user message and quote", async (t) => {
  const store = new MemoryStore(await temporary(t));
  const source = makeSource(
    snapshotFromEntries("session-test", fixture()),
    "user-1",
    fixture()[1].message.content,
  );
  await store.apply(proposal("工作环境的网络约束", { sources: [source] }));
  await store.apply(
    proposal("选型时需要考虑工具离线可用性", { sources: [source], type: "观点与想法" }),
  );
  assert.equal((await store.read()).memories.length, 2);
});

test("live tools: experiences stay out of regular reads, Advice retrieves them on demand", async (t) => {
  const h = await harness(t);
  const m = await h.store.apply(proposal("一段私人的职业转折经历", { type: "个人经历" }));
  await h.start("解释这个代码问题");
  const normal = await h.tools.get("memory_search").execute("", { id: m.id });
  assert.ok(!normal.details.memories[0].content);
  const context = await h.project();
  assert.ok(!JSON.stringify(context).includes("一段私人的职业转折经历"));
  await h.start("[个人记忆建议请求]\n我应该如何选择职业方向？");
  const advice = await h.tools.get("memory_search").execute("", { id: m.id });
  assert.equal(advice.details.memories[0].content, m.content);
});

test("footer: native dim style, shared total and actual per-conversation habit count", async (t) => {
  const h = await harness(t);
  const colors = [];
  h.ctx.ui.theme = {
    ...theme,
    fg: (color, text) => {
      colors.push(color);
      return text;
    },
  };
  await h.store.apply(proposal("回答时先给结论", { type: "稳定偏好" }));
  await h.store.apply(proposal("讨论需求时先明确问题再实现", { type: "稳定偏好" }));
  await h.store.apply(proposal("一段重要经历", { type: "个人经历" }));
  await h.start("讨论一下需求");
  await h.project();
  assert.equal(await h.store.count(), 3);
  assert.ok(
    h.statuses.some((line) => line.includes("3 total") && line.includes("2 habits loaded")),
  );
  assert.ok(colors.includes("dim"));
  assert.ok(!h.statuses.at(-1).includes("🧠"));
  await h.store.setEnabled(false);
  await h.project();
  assert.ok(h.statuses.at(-1).includes("Memory Off"));
  assert.ok(h.statuses.at(-1).includes("0 habits loaded"));
});

test("footer: restart prepares persisted habits before the first request and counts that same context", async (t) => {
  const h = await harness(t);
  await h.store.apply(proposal("回答时先给结论", { type: "稳定偏好" }));
  await h.store.apply(proposal("不自动加载的经历", { type: "个人经历" }));
  await h.handlers.get("session_shutdown")({}, h.ctx);
  await h.handlers.get("session_start")({ reason: "startup" }, h.ctx);
  assert.ok(h.statuses.at(-1).includes("2 total"));
  assert.ok(h.statuses.at(-1).includes("1 habit loaded"));
  await h.start("重启后继续讨论");
  const context = await h.project();
  assert.ok(
    context.messages.some((message) =>
      message.sections?.personal_memory?.includes("回答时先给结论"),
    ),
  );
  assert.ok(!JSON.stringify(context).includes("不自动加载的经历"));
  assert.ok(h.statuses.at(-1).includes("1 habit loaded"));
  await h.store.setEnabled(false);
  await h.project();
  assert.ok(h.statuses.at(-1).includes("0 habits loaded"));
});

test("live tools: updates need lookup and clear correction; deletions need a current request", async (t) => {
  const h = await harness(t);
  const m = await h.store.apply(proposal());
  await h.start(fixture()[1].message.content);
  await assert.rejects(
    h.call(toolParams({ action: "update", targetId: m.id, targetVersion: 1 })),
    /latest memory ID/,
  );
  await h.tools.get("memory_search").execute("", { id: m.id });
  await assert.rejects(
    h.call(toolParams({ action: "update", targetId: m.id, targetVersion: 1 })),
    /No clear correction/,
  );
  await assert.rejects(
    h.call(toolParams({ action: "delete", targetId: m.id, targetVersion: 1 })),
    /explicit forget/,
  );
  await h.start("本轮只是代码讨论");
  await assert.rejects(h.call(toolParams()), /this run/);
});

test("extraction: original evidence, duplicate filtering and cancellation", async () => {
  const snap = snapshotFromEntries("session-test", fixture());
  const state = { schemaVersion: 1, memories: [], suppressed: [], scans: {} };
  const approved = async (payload) =>
    payload.stage === "review"
      ? JSON.stringify({
          reviews: payload.candidates.map((c) => ({
            index: c.index,
            verdict: "keep",
            reason: "Original user quote supports the personal constraint.",
          })),
        })
      : JSON.stringify({ candidates: [{ ...toolParams(), certainty: "明确" }] });
  const values = await extractCandidates({ snapshot: snap, state }, approved);
  assert.equal(values.length, 1);
  const invalidEvidence = await extractCandidates({ snapshot: snap, state }, async () =>
    JSON.stringify({ candidates: [{ ...toolParams(), quote: "编造的原话" }] }),
  );
  assert.deepEqual(invalidEvidence, []);
  await assert.rejects(
    extractCandidates(
      { snapshot: snap, state },
      async () => '{"candidates":[]}',
      () => {},
      () => true,
    ),
    /cancelled/,
  );
  const existing = { ...values[0], id: "saved", version: 1, createdAt: "", updatedAt: "" };
  assert.equal(
    (
      await extractCandidates(
        { snapshot: snap, state: { ...state, memories: [existing] } },
        async () => JSON.stringify({ candidates: [{ ...toolParams(), certainty: "明确" }] }),
      )
    ).length,
    0,
  );
});
