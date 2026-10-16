import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { createJiti } = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"))(
  "jiti",
);
const jiti = createJiti(import.meta.url);
const { extractCandidates } = await jiti.import("../src/history/extraction.ts");
const { snapshotFromEntries } = await jiti.import("../src/history/sessions.ts");
const { searchMemories, habitContext } = await jiti.import("../src/domain/search.ts");
const { emptyState } = await jiti.import("../src/domain/memory.ts");
const snapshot = (text, date = "2023-01-01T00:00:00Z") =>
  snapshotFromEntries("session", [
    {
      type: "message",
      id: "user",
      parentId: null,
      timestamp: date,
      message: { role: "user", content: text },
    },
  ]);
const candidate = (text, extra = {}) => ({
  action: "add",
  title: "职业方向",
  content: text,
  type: "目标与方向",
  scope: "职业选择",
  certainty: "探索中",
  tags: [],
  reason: "后续职业选择讨论需要考虑该方向及条件",
  entryId: "user",
  quote: text,
  ...extra,
});
const review = (p, extra = {}) => ({
  index: p.index,
  verdict: "keep",
  basis: "personal_context",
  personalQuote: p.sources[0].quote,
  independentUse: "未来职业选择中考虑个人条件",
  reason: "用户原话支持范围和当前倾向",
  ...extra,
});
const approved = (candidates) => async (payload) =>
  payload.stage === "extract"
    ? { candidates }
    : { reviews: payload.candidates.map((p) => review(p)) };

test("protocol: prose and markdown are never accepted as a completed extraction", async () => {
  for (const response of [
    "没有可以保存的记忆。",
    '说明\n```json\n{"candidates":[]}\n```',
    '{"candidates":[]}',
    {},
    { candidates: null },
  ])
    await assert.rejects(
      extractCandidates(
        { snapshot: snapshot("个人问题"), state: emptyState() },
        async () => response,
      ),
      /structured extraction/,
    );
  assert.deepEqual(
    await extractCandidates({ snapshot: snapshot("普通任务"), state: emptyState() }, async () => ({
      candidates: [],
    })),
    [],
  );
});

test("quality: a plausible but overstated personal claim is dropped before acceptance", async () => {
  const text = "我正在考虑辞职，但还没决定，取决于家庭支出。";
  const stages = [];
  let stats;
  const values = await extractCandidates(
    { snapshot: snapshot(text), state: emptyState() },
    async (payload) => {
      stages.push(payload.stage);
      return payload.stage === "extract"
        ? { candidates: [candidate(text, { content: "用户已经决定辞职。", certainty: "明确" })] }
        : {
            reviews: payload.candidates.map((p) =>
              review(p, {
                verdict: "drop",
                basis: "uncertain",
                personalQuote: "",
                independentUse: "",
                reason: "原话保留了未决定状态和家庭支出条件",
              }),
            ),
          };
    },
    () => {},
    () => false,
    (value) => (stats = value),
  );
  assert.deepEqual(stages, ["extract", "review"]);
  assert.deepEqual(values, []);
  assert.equal(stats.filtered, 1);
  assert.equal(stats.reviewed, 1);
});

test("quality: review must cover every candidate exactly once", async () => {
  const text = "我认真考虑转向产品工作。";
  for (const invalid of [
    [],
    [{ index: 8, verdict: "keep", reason: "wrong" }],
    [{ index: 0, verdict: "unknown", reason: "wrong" }],
  ])
    await assert.rejects(
      extractCandidates({ snapshot: snapshot(text), state: emptyState() }, async (payload) =>
        payload.stage === "extract" ? { candidates: [candidate(text)] } : { reviews: invalid },
      ),
      /quality review/,
    );
  await assert.rejects(
    extractCandidates({ snapshot: snapshot(text), state: emptyState() }, async (payload) =>
      payload.stage === "extract"
        ? { candidates: [candidate(text), candidate(text, { content: "用户认真考虑职业转换。" })] }
        : { reviews: [review(payload.candidates[0]), review(payload.candidates[0])] },
    ),
    /quality review/,
  );
});

test("quality: unauthorized candidates and fabricated quotes are filtered without losing good candidates", async () => {
  const text = "我正在考虑转行，但还需要照顾家人。";
  let stats;
  const result = await extractCandidates(
    { snapshot: snapshot(text), state: emptyState() },
    approved([
      candidate(text, { entryId: "other-user" }),
      candidate("这句原话不存在。"),
      candidate(text),
    ]),
    () => {},
    () => false,
    (value) => (stats = value),
  );
  assert.equal(result.length, 1);
  assert.equal(stats.filtered, 2);
  assert.equal(result[0].sources[0].entryId, "user");
});

test("quality: historical correction dates refer to user evidence, not save time", async () => {
  const text = "以前考虑学术方向，现在决定转向产品工作。";
  const state = emptyState();
  state.memories.push({
    id: "old",
    version: 1,
    title: "学术方向",
    content: "用户考虑学术方向。",
    type: "目标与方向",
    scope: "",
    certainty: "探索中",
    tags: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    sources: [
      {
        sessionId: "old-session",
        entryId: "old-user",
        fingerprint: "old",
        quote: "考虑学术方向",
        timestamp: "2020-01-01",
      },
    ],
  });
  const complete = approved([
    candidate(text, { action: "update", targetId: "old", targetVersion: 1, certainty: "明确" }),
  ]);
  assert.equal((await extractCandidates({ snapshot: snapshot(text), state }, complete)).length, 1);
  assert.deepEqual(
    await extractCandidates({ snapshot: snapshot(text, "2019-01-01"), state }, complete),
    [],
  );
});

test("quality: review sees user evidence only; multi-message facts preserve sources", async () => {
  const snap = snapshotFromEntries("session", [
    {
      type: "message",
      id: "context",
      parentId: null,
      timestamp: "2023-01-01",
      message: { role: "user", content: "家庭支出是我的重要约束。" },
    },
    {
      type: "message",
      id: "assistant",
      parentId: "context",
      timestamp: "2023-01-01",
      message: { role: "assistant", content: "助手编造：用户决定辞职。" },
    },
    {
      type: "message",
      id: "user",
      parentId: "assistant",
      timestamp: "2023-01-02",
      message: { role: "user", content: "我还在考虑转行，暂时没有决定。" },
    },
  ]);
  const p = candidate("我还在考虑转行，暂时没有决定。", {
    content: "用户仍在考虑转行，尚未决定，需要考虑家庭支出。",
    evidence: [{ entryId: "context", quote: "家庭支出是我的重要约束。" }],
  });
  const values = await extractCandidates(
    {
      snapshot: snap,
      previous: { entries: { context: snap.entries.context }, completedAt: "", candidates: 0 },
      state: emptyState(),
    },
    async (payload) => {
      if (payload.stage === "extract") return { candidates: [p] };
      assert.ok(payload.conversation.every((message) => message.role === "user"));
      assert.ok(!JSON.stringify(payload).includes("助手编造"));
      return { reviews: payload.candidates.map((p) => review(p)) };
    },
  );
  assert.deepEqual(
    values[0].sources.map((source) => source.entryId),
    ["user", "context"],
  );
});

test("retrieval: titles outrank incidental mentions and exploring habits stay out of context", () => {
  const record = (id, title, content, extra = {}) => ({
    id,
    version: 1,
    title,
    content,
    type: "个人经历",
    scope: "",
    certainty: "明确",
    tags: [],
    createdAt: "2023-01-01",
    updatedAt: "2023-01-01",
    sources: [],
    ...extra,
  });
  const values = [
    record("incidental", "一次旅行", "旅途中聊到职业选择。"),
    record("relevant", "职业选择", "家庭责任影响用户的选择。"),
  ];
  assert.equal(searchMemories(values, "职业选择")[0].id, "relevant");
  assert.equal(
    searchMemories(
      [record("english", "career transition", "Learning for a new role")],
      "career transition",
    )[0].id,
    "english",
  );
  assert.deepEqual(searchMemories(values, "the and how"), []);
  assert.equal(
    habitContext([
      record("exploring", "回复方式", "我还在探索是否喜欢简短回答。", {
        type: "稳定偏好",
        certainty: "探索中",
      }),
    ]),
    "",
  );
});
