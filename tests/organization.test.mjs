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
const {
  completeOrganization,
  validateOrganizationChanges,
  organizedMemories,
  organizationReviewSupported,
  validateOrganizationReview,
} = await jiti.import("../src/domain/organization.ts");
const { reviewOrganization, organizationDetail } = await jiti.import("../src/ui/organization.ts");
const { visibleWidth } = await import("@earendil-works/pi-tui");
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
  assert.equal((await store.scan("synthetic")).candidates, 3);
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

function modelContext(snapshot, changes, decide = () => ({})) {
  const requests = [];
  return {
    requests,
    model: { contextWindow: 64000, maxTokens: 12000 },
    modelRegistry: {
      streamSimple: (_, payload, options) => {
        const request = JSON.parse(payload.messages[0].content[0].text);
        requests.push({ payload, options, request });
        const result =
          request.stage === "organize"
            ? { changes }
            : {
                reviews: request.candidates.map((candidate, index) => ({
                  index,
                  verdict: "keep",
                  basis: "personal_context",
                  personalQuote: candidate.sources[0].quote,
                  independentUse: "用于今后的职业选择或生活安排讨论。",
                  reason: "各原记录的具体含义、时间与条件均保留。",
                  coverage: candidate.ids.map((id) => ({
                    id,
                    quote: snapshot.find((memory) => memory.id === id).sources[0].quote,
                    retainedMeaning: "该原记录支持的具体个人事实和适用条件保留在新正文中。",
                  })),
                  ...decide(candidate, index),
                })),
              };
        return {
          result: async () => ({
            stopReason: "toolUse",
            content: [{ type: "toolCall", name: payload.tools[0].name, arguments: result }],
          }),
        };
      },
    },
  };
}

test("organization: reads the full library, outputs edits only, then independently reviews all source records", async (t) => {
  const { snapshot, groups } = await fixture(t);
  const ctx = modelContext(snapshot, [groups[0]]);
  const progress = [];
  const result = await planOrganization(ctx, snapshot, new AbortController().signal, (text) =>
    progress.push(text),
  );
  assert.deepEqual(result.groups, groups);
  assert.deepEqual(result.filtered, []);
  assert.equal(ctx.requests.length, 2);
  assert.deepEqual(ctx.requests[0].request.records, snapshot);
  assert.deepEqual(ctx.requests[1].request.records, snapshot);
  assert.equal(ctx.requests[0].payload.tools.length, 1);
  assert.equal(ctx.requests[1].payload.tools[0].name, "submit_memory_organization_review");
  assert.deepEqual(ctx.requests[1].request.candidates[0].ids, groups[0].ids);
  assert.ok(!ctx.requests[1].request.candidates.some((item) => item.ids.includes(snapshot[2].id)));
  assert.equal(progress.length, 2);
  assert.equal(ctx.requests[0].options.maxTokens, 12000);
  assert.equal(ctx.requests[1].options.maxTokens, 12000);
  const small = { ...ctx, model: { contextWindow: 1000 } };
  await assert.rejects(planOrganization(small, snapshot, new AbortController().signal), /exceeds/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(planOrganization(ctx, snapshot, controller.signal), /cancelled/);
  assert.equal(ctx.requests.length, 2, "No requests for pre-cancelled or oversized inputs");
});

function scriptedUI(ctx, actions) {
  const screens = [];
  return Object.assign(ctx, {
    screens,
    ui: {
      custom: (factory) =>
        new Promise((resolve) => {
          let component;
          let closed = false;
          component = factory(
            { terminal: { rows: 30 }, requestRender() {} },
            theme,
            kb,
            (value) => {
              closed = true;
              component?.dispose?.();
              resolve(value);
            },
          );
          const screen = component.render(100).join("\n");
          screens.push(screen);
          for (const width of [1, 24, 70, 120]) {
            const lines = component.render(width);
            assert.equal(lines.length, 30);
            assert.ok(lines.every((line) => visibleWidth(line) <= width));
          }
          component.render(100);
          if (screen.includes("Analysis → independent review")) return;
          const step = actions.shift();
          assert.ok(step, `Unscripted screen: ${screen}`);
          if (step.title) assert.ok(screen.includes(step.title), screen);
          for (const key of step.keys) {
            assert.equal(closed, false, "No input after the screen closed");
            component.handleInput(key);
          }
        }),
    },
  });
}

test("organization UI: cancellation saves nothing; final Apply is explicit and refreshes habits", async (t) => {
  const { store, snapshot, groups } = await fixture(t);
  let refreshed = 0;
  await organizeLibrary(
    scriptedUI(modelContext(snapshot, [groups[0]]), [
      { title: "Organization review", keys: ["ESC"] },
    ]),
    store,
    async () => refreshed++,
  );
  assert.deepEqual((await store.read()).memories, snapshot);
  assert.equal(refreshed, 0);
  const ctx = scriptedUI(modelContext(snapshot, [groups[0]]), [
    // Start on the first suggestion; up twice focuses Review & apply selected.
    { title: "Organization review", keys: ["UP", "UP", "ENTER"] },
    { title: "Apply selected organization?", keys: ["DOWN", "ENTER"] },
    { title: "Library organized", keys: ["ENTER"] },
  ]);
  await organizeLibrary(ctx, store, async () => refreshed++);
  assert.equal((await store.read()).memories.length, 2);
  assert.equal(refreshed, 1);
  assert.ok(ctx.screens.some((screen) => screen.includes("Back to review")));
});

test("organization: sparse plans preserve omitted/no-op records and reject repeated or invented IDs", async (t) => {
  const { snapshot, groups, a, c } = await fixture(t);
  assert.deepEqual(validateOrganizationChanges({ changes: [group(c)] }, snapshot), []);
  assert.deepEqual(completeOrganization(snapshot, []), snapshot.map(group));
  assert.deepEqual(completeOrganization(snapshot, [groups[0]]), groups);
  for (const changes of [[groups[0], group(a)], [{ ...group(a), ids: ["missing"] }]])
    assert.throws(() => validateOrganizationChanges({ changes }, snapshot), /repeats|invents/);
});

test("organization: empty plans need one request, leave versions intact and do not rewrite files", async (t) => {
  const { store, snapshot } = await fixture(t);
  const before = await readFile(store.file, "utf8");
  const ctx = modelContext(snapshot, []);
  const plan = await planOrganization(ctx, snapshot, new AbortController().signal);
  assert.equal(ctx.requests.length, 1);
  await store.organize(snapshot, plan.groups);
  assert.deepEqual((await store.read()).memories, snapshot);
  assert.equal(await readFile(store.file, "utf8"), before);
  assert.deepEqual(plan.filtered, []);
});

test("organization: complementary fragments from one experience merge without absorbing a different goal", async (t) => {
  const { store, c } = await fixture(t);
  const fragments = [];
  for (const [index, quote] of [
    "去年那次转行，我需要稳定收入承担家庭支出。",
    "去年那次转行，我照顾家人后每晚只能学习半小时。",
  ].entries()) {
    fragments.push(
      await store.apply(
        createProposal({
          title: `去年转行的约束 ${index + 1}`,
          content: quote,
          type: "个人经历",
          scope: "去年那次转行尝试",
          certainty: "明确",
          sources: [
            {
              sessionId: "synthetic",
              entryId: `fragment-${index}`,
              fingerprint: `fragment-${index}`,
              timestamp: "2024-01-01",
              quote,
            },
          ],
        }),
      ),
    );
  }
  const snapshot = (await store.read()).memories;
  const combined = {
    ...group(fragments[0]),
    ids: fragments.map((memory) => memory.id),
    title: "去年转行时的家庭与学习约束",
    content: "用户去年转行时需要稳定收入承担家庭支出；照顾家人后每晚只能学习半小时。",
    reason: "同一次转行经历中的收入约束和学习时间限制，合并后便于完整理解。",
  };
  const plan = await planOrganization(
    modelContext(snapshot, [combined]),
    snapshot,
    new AbortController().signal,
  );
  const result = await store.organize(snapshot, plan.groups);
  assert.equal(result.length, snapshot.length - 1);
  const merged = result.find((memory) => memory.content === combined.content);
  assert.equal(merged.sources.length, 2);
  assert.ok(merged.content.includes("稳定收入") && merged.content.includes("半小时"));
  assert.deepEqual(
    result.find((memory) => memory.id === c.id),
    c,
  );
});

test("organization: independent review rejects broad-topic merges, missing source coverage and fabricated supporting quotes", async (t) => {
  const { snapshot, groups } = await fixture(t);
  const cases = [
    () => ({ verdict: "drop", reason: "只是主题相似，不能消除各自条件。", coverage: [] }),
    () => ({ coverage: [] }),
    (candidate) => ({
      coverage: candidate.ids.map((id) => ({
        id,
        quote: "捏造的原话",
        retainedMeaning: "原意保留",
      })),
    }),
    (candidate) => ({
      coverage: candidate.ids.map(() => ({
        id: candidate.ids[0],
        quote: candidate.sources[0].quote,
        retainedMeaning: "原意保留",
      })),
    }),
    () => ({ personalQuote: "不是用户说的" }),
    () => ({ independentUse: "  " }),
  ];
  for (const decide of cases) {
    const plan = await planOrganization(
      modelContext(snapshot, [groups[0]], decide),
      snapshot,
      new AbortController().signal,
    );
    assert.deepEqual(plan.groups, snapshot.map(group));
    assert.equal(plan.filtered.length, 1);
  }
});

test("organization: unsafe edits stay unchanged before review, and store independently rejects them", async (t) => {
  const { store, snapshot, a, c } = await fixture(t);
  const cases = [
    [{ ...group(c), certainty: "明确", content: "用户决定全职学习。" }, snapshot, /certainty/],
    [
      { ...group(a), content: "用户曾在 nonexistent-example.com 参加转行培训。" },
      snapshot,
      /service\/domain/,
    ],
    [{ ...group(a), content: "用户性格谨慎且害怕失败。" }, snapshot, /personality/],
    [
      { ...group(a), content: "用户尝试转行并考虑家庭支出。" },
      snapshot.map((memory) => (memory.id === a.id ? { ...memory, sources: [] } : memory)),
      /missing/,
    ],
  ];
  for (const [change, records, reason] of cases) {
    const ctx = modelContext(records, [change]);
    const plan = await planOrganization(ctx, records, new AbortController().signal);
    assert.equal(ctx.requests.length, 1);
    assert.deepEqual(plan.groups, records.map(group));
    assert.match(plan.filtered[0].reason, reason);
    await assert.rejects(store.organize(records, completeOrganization(records, [change])), reason);
    assert.deepEqual((await store.read()).memories, snapshot);
  }
});

test("organization: review protocol requires every index and coverage must use each original's own evidence", async (t) => {
  const { snapshot, groups } = await fixture(t);
  const merged = groups[0];
  const base = {
    index: 0,
    verdict: "keep",
    basis: "personal_context",
    personalQuote: snapshot[0].sources[0].quote,
    independentUse: "未来职业讨论",
    reason: "保留原意",
    coverage: merged.ids.map((id) => ({
      id,
      quote: snapshot.find((memory) => memory.id === id).sources[0].quote,
      retainedMeaning: "保留其原话中的约束",
    })),
  };
  assert.equal(organizationReviewSupported(base, merged, snapshot), true);
  assert.equal(
    organizationReviewSupported(
      { ...base, coverage: base.coverage.map((item) => ({ ...item, quote: base.personalQuote })) },
      merged,
      snapshot,
    ),
    false,
  );
  assert.throws(() => validateOrganizationReview({ reviews: [] }, 1), /incomplete/);
  assert.throws(() => validateOrganizationReview({ reviews: [base, base] }, 2), /Repeated/);
  assert.throws(
    () => validateOrganizationReview({ reviews: [{ ...base, index: 1 }] }, 1),
    /incomplete/,
  );
});

test("organization: stable survivor/order and exact provenance do not depend on model ID ordering", async (t) => {
  const { snapshot, groups, a, b } = await fixture(t);
  const records = snapshot.map((memory) => ({
    ...memory,
    createdAt: memory.id === a.id ? "2024-01-01" : "2024-02-01",
  }));
  // Same normalized source key, but a different original timestamp/text must still survive.
  records[1].sources = [
    records[0].sources[0],
    {
      ...records[0].sources[0],
      timestamp: "2024-03-01",
      quote: `${records[0].sources[0].quote}！`,
    },
  ];
  const next = organizedMemories({ memories: records }, records, {
    groups: [{ ...groups[0], ids: [b.id, a.id] }, groups[1]],
  });
  assert.equal(next[0].id, a.id);
  assert.equal(next[0].createdAt, "2024-01-01");
  assert.equal(next[0].version, a.version + 1);
  assert.equal(next[0].sources.length, 2);
  assert.ok(
    next[0].sources.some(
      (source) => source.timestamp === "2024-03-01" && source.quote.endsWith("！"),
    ),
  );
  assert.equal(next[1], records[2], "Untouched record is returned without version/field changes");
});

test("organization: one invalid submission can recover; repeated invalid, truncated or failed review never becomes an empty plan", async (t) => {
  const { snapshot, groups } = await fixture(t);
  const ctx = modelContext(snapshot, [groups[0]]);
  const original = ctx.modelRegistry.streamSimple;
  let calls = 0;
  ctx.modelRegistry.streamSimple = (...args) =>
    ++calls === 1
      ? {
          result: async () => ({
            stopReason: "stop",
            content: [{ type: "text", text: "Here is my plan" }],
          }),
        }
      : original(...args);
  const result = await planOrganization(ctx, snapshot, new AbortController().signal);
  assert.equal(calls, 3);
  assert.deepEqual(result.groups, groups);
  assert.match(ctx.requests[0].request.feedback, /Previous submission was invalid/);
  for (const response of [
    { stopReason: "stop", content: [] },
    { stopReason: "length", content: [] },
    { stopReason: "error", errorMessage: "Provider unavailable", content: [] },
    {
      stopReason: "toolUse",
      content: [
        {
          type: "toolCall",
          name: "submit_memory_organization",
          arguments: { changes: [{ ...groups[0], ids: ["unknown"] }] },
        },
      ],
    },
  ]) {
    let attempts = 0;
    const bad = {
      ...ctx,
      modelRegistry: {
        streamSimple: () => {
          attempts++;
          return { result: async () => response };
        },
      },
    };
    await assert.rejects(planOrganization(bad, snapshot, new AbortController().signal));
    assert.ok(attempts <= 2);
  }
  const badReview = modelContext(snapshot, [groups[0]]);
  const first = badReview.modelRegistry.streamSimple;
  badReview.modelRegistry.streamSimple = (...args) =>
    args[1].tools[0].name.endsWith("_review")
      ? {
          result: async () => ({
            stopReason: "toolUse",
            content: [
              {
                type: "toolCall",
                name: "submit_memory_organization_review",
                arguments: { reviews: [] },
              },
            ],
          }),
        }
      : first(...args);
  await assert.rejects(
    planOrganization(badReview, snapshot, new AbortController().signal),
    /incomplete/,
  );
});

test("organization: abort during independent review and on the progress screen leaves the library untouched", async (t) => {
  const { store, snapshot, groups } = await fixture(t);
  const controller = new AbortController();
  const ctx = modelContext(snapshot, [groups[0]]);
  const original = ctx.modelRegistry.streamSimple;
  ctx.modelRegistry.streamSimple = (...args) => {
    if (args[1].tools[0].name.endsWith("_review")) controller.abort();
    return original(...args);
  };
  await assert.rejects(planOrganization(ctx, snapshot, controller.signal), /cancelled/);
  assert.deepEqual((await store.read()).memories, snapshot);
  let signal;
  const loading = {
    model: ctx.model,
    modelRegistry: {
      streamSimple: (_model, _payload, options) => {
        signal = options.signal;
        return {
          result: () =>
            new Promise((resolve) =>
              signal.addEventListener(
                "abort",
                () => resolve({ stopReason: "aborted", content: [] }),
                { once: true },
              ),
            ),
        };
      },
    },
    ui: {
      custom: (factory) =>
        new Promise((resolve) => {
          const component = factory(
            { terminal: { rows: 20 }, requestRender() {} },
            theme,
            kb,
            resolve,
          );
          component.handleInput("ESC");
          component.dispose();
        }),
    },
  };
  await organizeLibrary(loading, store, async () => assert.fail("Must not refresh after cancel"));
  assert.equal(signal.aborted, true);
  assert.deepEqual((await store.read()).memories, snapshot);
});

test("organization UI: exclude a merge, inspect all fields/evidence, and only apply the other change", async (t) => {
  const { store, snapshot, groups, c, a, b } = await fixture(t);
  const refined = {
    ...group(c),
    title: "全职学习的探索",
    content: "用户目前更想全职学习，仍需要评估家庭支出。",
    reason: "保留探索状态和家庭支出的条件。",
  };
  const details = organizationDetail(groups[0], snapshot);
  for (const label of [
    "Scope:",
    "Certainty:",
    "Tags:",
    "Original words",
    "Before",
    "After",
    a.sources[0].quote,
    b.sources[0].quote,
    a.createdAt,
  ])
    assert.ok(details.includes(label), label);
  const plan = { groups: completeOrganization(snapshot, [groups[0], refined]), filtered: [] };
  const ctx = scriptedUI({}, [
    { title: "Organization review", keys: ["ENTER"] },
    { title: "Suggestion 1/2", keys: ["DOWN", "ENTER"] },
    { title: "Excluded", keys: ["UP", "UP", "ENTER"] },
    { title: "Apply selected organization?", keys: ["DOWN", "ENTER"] },
  ]);
  const selected = await reviewOrganization(ctx, snapshot, plan);
  const result = await store.organize(snapshot, selected);
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.find((memory) => memory.id === a.id),
    a,
  );
  assert.deepEqual(
    result.find((memory) => memory.id === b.id),
    b,
  );
  assert.equal(result.find((memory) => memory.id === c.id).title, refined.title);
  assert.equal(result.find((memory) => memory.id === c.id).certainty, "探索中");
});

test("organization UI: Enter on final confirmation defaults to Back; no-op plans report filtered reasons", async (t) => {
  const { snapshot, groups } = await fixture(t);
  const ctx = scriptedUI({}, [
    { keys: ["UP", "UP", "ENTER"] },
    { title: "Apply selected organization?", keys: ["ENTER"] },
    { title: "Organization review", keys: ["ESC"] },
  ]);
  assert.equal(await reviewOrganization(ctx, snapshot, { groups, filtered: [] }), null);
  const noChange = scriptedUI({}, [{ title: "No verified changes", keys: ["ENTER"] }]);
  await reviewOrganization(noChange, snapshot, {
    groups: snapshot.map(group),
    filtered: [{ title: "Bad merge", reason: "Different conditions" }],
  });
  assert.ok(noChange.screens[0].includes("Different conditions"));
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
