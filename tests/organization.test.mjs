import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { createJiti } = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"))(
  "jiti",
);
const jiti = createJiti(import.meta.url);
const { MemoryStore } = await jiti.import("../src/storage/store.ts");
const { createProposal, memoryFields, sourceKey } = await jiti.import("../src/domain/memory.ts");
const { planOrganization } = await jiti.import("../src/agents/organization.ts");
const { organizeLibrary } = await jiti.import("../src/application/organization.ts");
const { MemoryDashboard, dashboardState } = await jiti.import("../src/ui/dashboard.ts");
const theme = { fg: (_, text) => text, bold: (text) => text };
const kb = {
  matches: (data, action) =>
    ({
      "tui.select.up": "UP",
      "tui.select.down": "DOWN",
      "tui.select.confirm": "ENTER",
      "tui.select.cancel": "ESC",
    })[action] === data,
};
const group = (memory) => ({
  ids: [memory.id],
  ...memoryFields(memory),
  reason: "No change needed",
});
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "memory-organization-"));
  t.after(() => rm(dir, { force: true, recursive: true }));
  const store = new MemoryStore(dir);
  await store.initialize();
  const add = (content, number, extra = {}) =>
    store.apply(
      createProposal({
        title: `Memory ${number}`,
        content,
        type: "个人经历",
        sources: [
          {
            entryId: `user-${number}`,
            sessionId: "synthetic",
            fingerprint: `fingerprint-${number}`,
            quote: content,
            timestamp: `2024-01-0${number}`,
          },
        ],
        ...extra,
      }),
    );
  const a = await add("我曾尝试转行，家庭支出让我很在意收入稳定。", 1);
  const b = await add("我尝试转行时也需要稳定收入，以承担家庭支出。", 2);
  const c = await add("目前我更想全职学习，仍需评估家庭支出。", 3, { certainty: "探索中" });
  const snapshot = (await store.read()).memories;
  const merged = {
    ...group(a),
    ids: [a.id, b.id],
    content: "用户在转行尝试中需要稳定收入来承担家庭支出。",
    reason: "相同经历和约束的重复表述",
  };
  return { store, snapshot, a, b, c, groups: [merged, group(c)] };
}

test("organization: atomic merge preserves every quote, original date, conflicting goal and scan", async (t) => {
  const { store, snapshot, groups, a, b, c } = await fixture(t);
  await store.recordScan("synthetic", {
    entries: { original: "fingerprint" },
    completedAt: "2024-01-01",
    candidates: 3,
  });
  const result = await store.organize(snapshot, groups);
  assert.equal(result.length, 2);
  const merged = result.find((memory) => memory.id === a.id);
  assert.equal(merged.version, a.version + 1);
  assert.deepEqual(
    merged.sources.map(sourceKey),
    [a, b].flatMap((memory) => memory.sources.map(sourceKey)),
  );
  assert.equal(merged.createdAt, a.createdAt);
  assert.deepEqual(
    result.find((memory) => memory.id === c.id),
    c,
  );
  const persisted = await store.read();
  assert.equal(persisted.scans.synthetic.candidates, 3);
  assert.ok(!persisted.suppressed.some((key) => key.startsWith("source:")));
  assert.deepEqual(persisted.memories, result);
});

test("organization: omitted/unknown/repeated IDs and concurrent edits cannot partially overwrite the library", async (t) => {
  const { store, snapshot, groups, a } = await fixture(t);
  for (const invalid of [
    groups.slice(0, 1),
    [...groups, group(a)],
    [{ ...groups[0], ids: ["made-up"] }, groups[1]],
  ]) {
    await assert.rejects(store.organize(snapshot, invalid), /omitted|repeats|invents/);
    assert.deepEqual((await store.read()).memories, snapshot);
  }
  await store.apply(
    createProposal({
      ...memoryFields(a),
      action: "update",
      targetId: a.id,
      targetVersion: a.version,
      content: "用户刚刚修改了这段经历。",
    }),
  );
  const afterEdit = await store.read();
  await assert.rejects(store.organize(snapshot, groups), /library changed/);
  assert.deepEqual(await store.read(), afterEdit);
  await assert.rejects(readFile(store.journalFile), /ENOENT/);
});

test("organization: model receives the full library and must submit a schema-valid, complete plan", async (t) => {
  const { snapshot, groups } = await fixture(t);
  let request;
  const ctx = {
    model: { contextWindow: 64000 },
    modelRegistry: {
      streamSimple: (_, payload) => {
        request = payload;
        return {
          result: async () => ({
            stopReason: "toolUse",
            content: [
              { type: "toolCall", name: "submit_memory_organization", arguments: { groups } },
            ],
          }),
        };
      },
    },
  };
  const result = await planOrganization(ctx, snapshot, new AbortController().signal);
  assert.deepEqual(result, groups);
  assert.deepEqual(JSON.parse(request.messages[0].content[0].text).records, snapshot);
  const small = { ...ctx, model: { contextWindow: 1000 } };
  await assert.rejects(planOrganization(small, snapshot, new AbortController().signal), /exceeds/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(planOrganization(ctx, snapshot, controller.signal), /cancelled/);
});

function previewContext(groups, action) {
  let screen = 0;
  return {
    model: { contextWindow: 64000 },
    modelRegistry: {
      streamSimple: () => ({
        result: async () => ({
          stopReason: "toolUse",
          content: [
            { type: "toolCall", name: "submit_memory_organization", arguments: { groups } },
          ],
        }),
      }),
    },
    ui: {
      custom: (factory) =>
        new Promise((resolve) => {
          const component = factory(
            { terminal: { rows: 30 }, requestRender() {} },
            theme,
            kb,
            resolve,
          );
          assert.equal(component.render(90).length, 30);
          if (screen++ === 1) {
            if (action === "cancel") component.handleInput("ESC");
            else component.handleInput("ENTER");
          } else if (screen > 2) component.handleInput("ENTER");
        }),
    },
  };
}

test("organization UI: cancellation saves nothing; explicit Apply updates the library and refreshes habits", async (t) => {
  const { store, snapshot, groups } = await fixture(t);
  let refreshed = 0;
  await organizeLibrary(previewContext(groups, "cancel"), store, async () => refreshed++);
  assert.deepEqual((await store.read()).memories, snapshot);
  assert.equal(refreshed, 0);
  await organizeLibrary(previewContext(groups, "apply"), store, async () => refreshed++);
  assert.equal((await store.read()).memories.length, 2);
  assert.equal(refreshed, 1);
});

test("Library: Organize is accessible through action focus and Ctrl+O, including an empty library", () => {
  for (const shortcut of [false, true]) {
    let selected;
    const state = dashboardState();
    const component = new MemoryDashboard(
      { memories: [], enabled: false, tasks: [], conversations: [] },
      state,
      theme,
      kb,
      (value) => (selected = value),
      () => {},
      () => {},
      20,
    );
    component.handleInput("ENTER");
    assert.ok(component.render(90).join("\n").includes("Organize all memories"));
    if (shortcut) component.handleInput("\x0f");
    else {
      component.handleInput("UP");
      component.handleInput("UP");
      component.handleInput("ENTER");
    }
    assert.equal(selected, "organize");
  }
});
