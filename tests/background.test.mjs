import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
const piPath = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = createRequire(piPath)("jiti");
const jiti = createJiti(import.meta.url);
const { TaskManager } = await jiti.import("../packages/pi/src/agents/tasks.ts");
const { MemoryStore } = await jiti.import("../packages/core/src/storage/store.ts");
const { readSnapshot, extractionStatus } = await jiti.import(
  "../packages/core/src/history/sessions.ts",
);
const { MemoryDashboard, dashboardState } = await jiti.import("../packages/pi/src/ui/dashboard.ts");
const { listConversations } = await jiti.import("../packages/pi/src/history/catalog.ts");
const factory = (await jiti.import("../packages/pi/src/extension.ts")).default;
const { visibleWidth } = await import("@earendil-works/pi-tui");
const theme = { fg: (_color, text) => text, bold: (text) => text };
const keys = {
  matches: (data, action) =>
    ({
      "tui.select.up": "UP",
      "tui.select.down": "DOWN",
      "tui.select.confirm": "ENTER",
      "tui.select.cancel": "ESC",
      "tui.input.tab": "TAB",
    })[action] === data,
};
async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), "pi-memory-background-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function waitFor(predicate, timeout = 25000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await delay(100);
  }
  throw new Error("Timed out waiting for worker");
}
async function source(dir, number, text) {
  const sessionDir = join(dir, "sessions", "--tmp--");
  await mkdir(sessionDir, { recursive: true });
  const path = join(sessionDir, `source-${number}.jsonl`);
  await writeFile(
    path,
    [
      {
        type: "session",
        id: `source-${number}`,
        version: 3,
        cwd: "/tmp",
        timestamp: "2026-01-01T00:00:00Z",
      },
      {
        type: "message",
        id: `user-${number}`,
        parentId: null,
        timestamp: "2026-01-01T00:00:01Z",
        message: { role: "user", content: text },
      },
    ]
      .map((e) => JSON.stringify(e))
      .join("\n") + "\n",
  );
  return path;
}
async function mockModel(t, dir, gate = Promise.resolve()) {
  const requests = [];
  const server = createServer(async (request, response) => {
    try {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      requests.push(body);
      await gate;
      const last = [...body.messages].reverse().find((m) => m.role === "user");
      const text =
        typeof last.content === "string"
          ? last.content
          : last.content
              .filter((p) => p.type === "text")
              .map((p) => p.text)
              .join("\n");
      const payload = JSON.parse(text);
      const user =
        payload.stage === "review"
          ? undefined
          : payload.conversation.find(
              (m) => payload.allowedUserIds.includes(m.id) && m.role === "user",
            );
      const output =
        payload.stage === "review"
          ? payload.candidates.some((c) => c.content.includes("错误复核结果"))
            ? "not JSON"
            : JSON.stringify({
                reviews: payload.candidates.map((c) => ({
                  index: c.index,
                  verdict: "keep",
                  reason: "The quoted user statement supports this reusable experience.",
                })),
              })
          : user.text.includes("错误模型结果")
            ? "not JSON"
            : JSON.stringify({
                candidates: [
                  {
                    action: "add",
                    title: `个人经历 ${user.id}`,
                    content: user.text,
                    type: "个人经历",
                    scope: "",
                    certainty: "明确",
                    tags: [],
                    reason: "这段重要经历能帮助未来讨论职业选择",
                    entryId: user.id,
                    quote: user.text,
                  },
                ],
              });
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      response.write(
        `data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", model: "fake-model", choices: [{ index: 0, delta: { role: "assistant", content: output }, finish_reason: null }] })}\n\n`,
      );
      response.write(
        `data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", model: "fake-model", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } })}\n\n`,
      );
      response.end("data: [DONE]\n\n");
    } catch (e) {
      response.writeHead(500);
      response.end(String(e));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  await writeFile(
    join(dir, "models.json"),
    JSON.stringify({
      providers: {
        fake: {
          baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
          api: "openai-completions",
          apiKey: "local-test-key",
          models: [
            {
              id: "fake-model",
              name: "Test model",
              contextWindow: 64000,
              maxTokens: 4096,
              reasoning: false,
              input: ["text"],
            },
          ],
        },
      },
    }),
  );
  return requests;
}
function guardWorkers(t, manager) {
  t.after(async () => {
    for (const job of await manager.list().catch(() => []))
      if (job.phase === "running") {
        await manager.cancel(job.id).catch(() => {});
        if (job.pid) {
          try {
            process.kill(job.pid, "SIGTERM");
          } catch {}
        }
      }
  });
}

test("dashboard: independent tabs, mouse switch, Chinese search and bounded layouts", () => {
  const memory = {
    id: "m1",
    title: "重要工作经历",
    content: "一次职业转折的经历和当时的感受。",
    type: "个人经历",
    certainty: "明确",
    scope: "",
    tags: ["职业"],
    updatedAt: "2026-01-01",
  };
  let action;
  const state = dashboardState();
  const component = new MemoryDashboard(
    { memories: [memory], enabled: true, tasks: [], conversations: [] },
    state,
    theme,
    keys,
    (value) => (action = value),
    () => {},
    () => (action = "toggle"),
    26,
  );
  component.handleInput("ENTER");
  assert.equal(state.page, "content");
  component.focused = true;
  assert.equal(component.input.focused, false);
  component.handleInput("经");
  component.handleInput("历");
  assert.equal(component.input.focused, true);
  assert.equal(component.rows().length, 1);
  for (const width of [20, 50, 80, 120]) {
    const lines = component.render(width);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
    assert.ok(lines.length <= 26);
  }
  component.handleInput("ESC");
  component.handleInput("DOWN");
  component.handleInput("ENTER");
  assert.equal(state.tab, 1);
  assert.equal(component.rows().length, 0);
  component.handleInput("ESC");
  component.handleInput("DOWN");
  component.handleInput("ENTER");
  component.handleInput("如何开始我的产品？");
  component.handleInput("ENTER");
  assert.equal(action, "advice:如何开始我的产品？");
  component.render(100);
  component.handleMouse({ type: "click", button: "left", x: 92, y: 1, clickCount: 1 });
  assert.equal(action, "toggle");
  component.handleInput("ESC");
  assert.equal(state.page, "home");
  component.handleInput("ESC");
  assert.equal(action, null);
});

test("catalog: three extraction states are visible and respect the selected agent directory", async (t) => {
  const dir = await temporary(t);
  const path = await source(dir, 1, "一段重要的个人经历。");
  const ctx = {
    cwd: "/tmp",
    sessionManager: { getSessionDir: () => join(dir, "sessions", "--tmp--") },
  };
  const state = { schemaVersion: 1, memories: [], suppressed: [], scans: {} };
  let rows = await listConversations(
    ctx,
    state,
    join(dir, "sessions"),
    join(dir, "claude-projects"),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "Not extracted");
  assert.equal(Object.hasOwn(rows[0], "description"), false);
  const snap = await readSnapshot(path);
  state.scans[snap.sessionId] = { entries: snap.entries, completedAt: "2026-01-01", candidates: 0 };
  rows = await listConversations(ctx, state, join(dir, "sessions"), join(dir, "claude-projects"));
  assert.equal(rows[0].status, "Extracted");
  const previous = await readFile(path, "utf8");
  await writeFile(
    path,
    previous +
      JSON.stringify({
        type: "message",
        id: "new",
        parentId: "user-1",
        timestamp: "2026-01-02",
        message: { role: "user", content: "新的个人观点。" },
      }) +
      "\n",
  );
  rows = await listConversations(ctx, state, join(dir, "sessions"), join(dir, "claude-projects"));
  assert.equal(rows[0].status, "Updated");
});

test(
  "background: one selected conversation per independent process; cancel is isolated",
  { timeout: 35000 },
  async (t) => {
    const dir = await temporary(t);
    const requests = await mockModel(t, dir);
    const manager = new TaskManager(join(dir, "memory"));
    guardWorkers(t, manager);
    const first = await source(dir, 1, "我曾独立负责一次产品发布，这段经历让我很重视用户反馈。");
    const second = await source(dir, 2, "我曾经历一次职业转折，并花了一年重新学习。");
    const third = await source(dir, 3, "这是一段准备取消提取的经历。");
    const jobs = await Promise.all(
      [first, second, third].map((path, i) =>
        manager.start({
          sourcePath: path,
          name: `对话${i + 1}`,
          agentDir: dir,
          model: { provider: "fake", id: "fake-model" },
        }),
      ),
    );
    assert.equal(new Set(jobs.map((j) => j.id)).size, 3);
    await manager.cancel(jobs[2].id);
    const finished = await waitFor(async () => {
      const all = await manager.list();
      return all.length === 3 && all.every((j) => j.phase !== "running") ? all : null;
    });
    assert.equal(
      finished.filter((j) => j.phase === "completed").length,
      2,
      JSON.stringify(finished),
    );
    assert.equal(finished.find((j) => j.id === jobs[2].id).phase, "cancelled");
    assert.equal(new Set(finished.map((j) => j.pid)).size, 3);
    assert.equal(requests.length, 4);
    assert.ok(requests.every((body) => !body.tools?.length));
    const store = new MemoryStore(join(dir, "memory"));
    const state = await store.read();
    assert.equal(state.memories.length, 2);
    assert.equal(extractionStatus(await readSnapshot(first), state.scans["source-1"]), "已提取");
    assert.equal(extractionStatus(await readSnapshot(third), state.scans["source-3"]), "未提取");
    const firstTask = finished.find((j) => j.id === jobs[0].id);
    assert.equal(firstTask.applied, 1);
    assert.equal(firstTask.savedIds.length, 1);
    assert.equal(
      state.memories.find((m) => m.id === firstTask.savedIds[0]).sources[0].sessionId,
      "source-1",
    );
    assert.ok((await manager.log(jobs[0].id)).includes("Done."));
  },
);

test(
  "background: malformed model output fails without advancing the source checkpoint",
  { timeout: 30000 },
  async (t) => {
    const dir = await temporary(t);
    await mockModel(t, dir);
    const manager = new TaskManager(join(dir, "memory"));
    guardWorkers(t, manager);
    const path = await source(dir, 1, "错误模型结果：这是需要保留的重要经历。");
    const job = await manager.start({
      sourcePath: path,
      name: "格式错误测试",
      agentDir: dir,
      model: { provider: "fake", id: "fake-model" },
    });
    const result = await waitFor(async () =>
      (await manager.list()).find((j) => j.id === job.id && j.phase !== "running"),
    );
    assert.equal(result.phase, "failed");
    assert.equal(
      extractionStatus(
        await readSnapshot(path),
        (await new MemoryStore(join(dir, "memory")).read()).scans["source-1"],
      ),
      "未提取",
    );
  },
);

test(
  "background: malformed quality review saves nothing and preserves the checkpoint",
  { timeout: 30000 },
  async (t) => {
    const dir = await temporary(t);
    await mockModel(t, dir);
    const manager = new TaskManager(join(dir, "memory"));
    guardWorkers(t, manager);
    const path = await source(dir, 1, "错误复核结果：我曾经历一次职业转折。");
    const job = await manager.start({
      sourcePath: path,
      name: "Review failure",
      agentDir: dir,
      model: { provider: "fake", id: "fake-model" },
    });
    const result = await waitFor(async () =>
      (await manager.list()).find((j) => j.id === job.id && j.phase !== "running"),
    );
    assert.equal(result.phase, "failed");
    const state = await new MemoryStore(join(dir, "memory")).read();
    assert.equal(state.memories.length, 0);
    assert.equal(extractionStatus(await readSnapshot(path), state.scans["source-1"]), "未提取");
  },
);

test(
  "/personal-memory: multi-select launches two agents and returns before model responses",
  { timeout: 35000 },
  async (t) => {
    const dir = await temporary(t);
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    await mockModel(t, dir, gate);
    const paths = [
      await source(dir, 1, "我曾负责一次重要的团队协作。"),
      await source(dir, 2, "我曾用一年时间完成职业转型。"),
    ];
    const handlers = new Map(),
      commands = new Map(),
      notifications = [],
      tools = new Map();
    let active = ["read", "bash"];
    const previous = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = dir;
    try {
      factory({
        registerTool: (tool) => tools.set(tool.name, tool),
        registerCommand: (name, c) => commands.set(name, c),
        on: (name, h) => handlers.set(name, h),
        getActiveTools: () => active,
        setActiveTools: (names) => (active = names),
        getAllTools: () => [...tools.values()],
        sendUserMessage() {},
      });
      const actions = [["\x12"], [" ", "DOWN", " ", "ENTER"], ["ESC", "ESC"]];
      const entries = JSON.parse((await readFile(paths[0], "utf8")).trim().split("\n").at(-1));
      const ctx = {
        mode: "tui",
        hasUI: true,
        cwd: "/tmp",
        model: { provider: "fake", id: "fake-model" },
        sessionManager: {
          getSessionId: () => "main",
          getEntries: () => [entries],
          getLeafId: () => entries.id,
          getSessionDir: () => join(dir, "sessions", "--tmp--"),
        },
        ui: {
          theme,
          setFooter() {},
          setStatus() {},
          notify: (text) => notifications.push(text),
          custom: async (create) => {
            let component;
            const result = await new Promise((resolve) => {
              component = create(
                { terminal: { rows: 30 }, requestRender() {} },
                theme,
                keys,
                resolve,
              );
              for (const action of actions.shift() || ["ESC"]) component.handleInput(action);
            });
            component.dispose?.();
            return result;
          },
        },
      };
      await handlers.get("session_start")({}, ctx);
      t.after(() => handlers.get("session_shutdown")({}, ctx));
      const manager = new TaskManager(join(dir, "memory"));
      guardWorkers(t, manager);
      await commands.get("personal-memory").handler("", ctx);
      const jobs = await manager.list();
      assert.equal(jobs.length, 2);
      assert.ok(jobs.every((j) => j.phase === "running"));
      assert.deepEqual(notifications, []);
      release();
      await waitFor(async () => (await manager.list()).every((j) => j.phase !== "running"));
      assert.equal((await new MemoryStore(join(dir, "memory")).read()).memories.length, 2);
    } finally {
      release?.();
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
    }
  },
);

test(
  "background: concurrent managers do not start duplicate agents for the same source",
  { timeout: 30000 },
  async (t) => {
    const dir = await temporary(t);
    const requests = await mockModel(t, dir);
    const a = new TaskManager(join(dir, "memory")),
      b = new TaskManager(join(dir, "memory"));
    guardWorkers(t, a);
    const path = await source(dir, 1, "我曾花一年时间重新建立自己的工作方向。");
    const input = {
      sourcePath: path,
      name: "Shared source",
      agentDir: dir,
      model: { provider: "fake", id: "fake-model" },
    };
    const [first, second] = await Promise.all([a.start(input), b.start(input)]);
    assert.equal(first.id, second.id);
    await waitFor(async () => (await a.list()).every((j) => j.phase !== "running"));
    assert.equal((await a.list()).length, 1);
    assert.equal(requests.length, 2);
    assert.equal((await new MemoryStore(join(dir, "memory")).read()).memories.length, 1);
  },
);

test(
  "background: switching Off in another process context aborts an in-flight extraction",
  { timeout: 30000 },
  async (t) => {
    const dir = await temporary(t);
    let release;
    const requests = await mockModel(t, dir, new Promise((resolve) => (release = resolve)));
    const manager = new TaskManager(join(dir, "memory"));
    guardWorkers(t, manager);
    try {
      const path = await source(dir, 1, "我曾经历一次对人生选择很重要的转折。");
      const job = await manager.start({
        sourcePath: path,
        name: "In-flight extraction",
        agentDir: dir,
        model: { provider: "fake", id: "fake-model" },
      });
      await waitFor(() => requests.length > 0);
      const store = new MemoryStore(join(dir, "memory"));
      await store.setEnabled(false);
      const task = await waitFor(async () =>
        (await manager.list()).find((j) => j.id === job.id && j.phase !== "running"),
      );
      assert.equal(task.phase, "cancelled");
      assert.equal((await store.read()).memories.length, 0);
      assert.equal(
        extractionStatus(await readSnapshot(path), (await store.read()).scans["source-1"]),
        "未提取",
      );
    } finally {
      release?.();
    }
  },
);
