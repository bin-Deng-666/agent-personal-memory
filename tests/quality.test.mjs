import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { createJiti } = createRequire(
  fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")),
)("jiti");
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
  scope: "",
  certainty: "探索中",
  tags: [],
  reason: "后续职业选择讨论需要考虑该方向及条件",
  entryId: "user",
  quote: text,
  ...extra,
});
const approved = (candidates) => async (payload) =>
  JSON.stringify(
    payload.stage === "review"
      ? {
          reviews: payload.candidates.map((c) => ({
            index: c.index,
            verdict: "keep",
            reason: "User evidence supports the scope and claim.",
          })),
        }
      : { candidates },
  );

test("quality: an overstatement is dropped before persistence, without rewriting the user claim", async () => {
  const text = "我正在考虑辞职，但还没决定，取决于家庭支出。";
  const stages = [];
  let stats;
  const values = await extractCandidates(
    { snapshot: snapshot(text), state: emptyState() },
    async (payload) => {
      stages.push(payload.stage);
      return JSON.stringify(
        payload.stage === "extract"
          ? { candidates: [candidate(text, { content: "用户已经决定辞职。", certainty: "明确" })] }
          : {
              reviews: [
                {
                  index: 0,
                  verdict: "drop",
                  reason:
                    "The quote says considering, undecided and conditional on household spending.",
                },
              ],
            },
      );
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
test("quality: review decisions must cover each candidate exactly once", async () => {
  const text = "我认真考虑转向产品工作。";
  for (const reviews of [
    [],
    [{ index: 8, verdict: "keep", reason: "Wrong index" }],
    [{ index: 0, verdict: "unknown", reason: "Wrong verdict" }],
  ]) {
    await assert.rejects(
      extractCandidates({ snapshot: snapshot(text), state: emptyState() }, async (payload) =>
        JSON.stringify(
          payload.stage === "extract" ? { candidates: [candidate(text)] } : { reviews },
        ),
      ),
      /quality review/,
    );
  }
});
test("quality: evidence must appear in the segment supplied to the extractor", async () => {
  const text = "这是一段很长的经历。".repeat(1600) + "结尾是一件独立的重要事情。";
  await assert.rejects(
    extractCandidates(
      { snapshot: snapshot(text), state: emptyState(), contextWindow: 16000 },
      approved([candidate("结尾是一件独立的重要事情。")]),
    ),
    /Evidence is not in this segment/,
  );
});
test("quality: historical corrections compare user evidence dates, not the later storage date", async () => {
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
  const values = await extractCandidates(
    { snapshot: snapshot(text), state },
    approved([
      candidate(text, { action: "update", targetId: "old", targetVersion: 1, certainty: "明确" }),
    ]),
  );
  assert.equal(values.length, 1);
  assert.equal(values[0].action, "update");
  assert.equal(
    (
      await extractCandidates(
        { snapshot: snapshot(text, "2019-01-01"), state },
        approved([candidate(text, { action: "update", targetId: "old", targetVersion: 1 })]),
      )
    ).length,
    0,
  );
});
test("quality: a multi-message memory preserves its supporting original user quotes", async () => {
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
      id: "user",
      parentId: "context",
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
    approved([p]),
  );
  assert.deepEqual(
    values[0].sources.map((s) => s.entryId),
    ["user", "context"],
  );
});
test("retrieval: title/topics outrank incidental body mentions and English queries retain word boundaries", () => {
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
