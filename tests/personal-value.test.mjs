import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const { createJiti } = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"))(
  "jiti",
);
const jiti = createJiti(import.meta.url);
const { validatePersonalEvidence } = await jiti.import("../src/domain/evidence.ts");
const { memoryStatusLabel } = await jiti.import("../src/domain/presentation.ts");
const { CaptureSession } = await jiti.import("../src/application/capture.ts");
const { MemoryStore } = await jiti.import("../src/storage/store.ts");
const { snapshotFromEntries, makeSource } = await jiti.import("../src/history/sessions.ts");
const { extractCandidates } = await jiti.import("../src/history/extraction.ts");
const { emptyState } = await jiti.import("../src/domain/memory.ts");
const snap = (text) =>
  snapshotFromEntries("fixture", [
    {
      type: "message",
      id: "user",
      parentId: null,
      timestamp: "2026-01-01T00:00:00Z",
      message: { role: "user", content: text },
    },
  ]);
const proposal = (quote, content = quote, type = "稳定偏好") => ({
  action: "add",
  title: "Synthetic personal claim",
  content,
  type,
  scope: "",
  certainty: "明确",
  tags: [],
  reason: "Useful in future unrelated advice",
  sources: [makeSource(snap(quote), "user", quote)],
});
test("presentation: Personal Memory status uses zero/one/many grammar", () => {
  assert.equal(memoryStatusLabel(true, 1, 1), "Personal Memory On · 1 total · 1 habit loaded");
  assert.equal(memoryStatusLabel(true, 2, 2), "Personal Memory On · 2 total · 2 habits loaded");
  assert.equal(memoryStatusLabel(false, 2, 0), "Personal Memory Off · 2 total · 0 habits loaded");
});
test("personal value: task requirements cannot become personality or enduring preferences", () => {
  for (const quote of [
    "这个插件要显示五种分类。",
    "这个项目要支持两种安装方式。",
    "README 不要打补丁式更新。",
    "Remember this project should use a blue button.",
  ]) {
    assert.throws(() => validatePersonalEvidence(proposal(quote)), /project-specific/);
  }
  assert.throws(
    () =>
      validatePersonalEvidence(proposal("这次判断要谨慎。", "用户谨慎程度较高，遇事考虑全面。")),
    /personality/,
  );
  assert.throws(
    () =>
      validatePersonalEvidence(
        proposal("有时候连得上，有时候连不上，判断要谨慎。", "用户网络持续不稳定。", "个人背景"),
      ),
    /troubleshooting/,
  );
  assert.throws(
    () =>
      validatePersonalEvidence(
        proposal("连接有时候会失败。", "访问 example.invalid 时需要分路径验证。", "个人背景"),
      ),
    /domain/,
  );
});
test("personal value: meaningful experiences and personal conditions are retained even in project conversations", () => {
  for (const [quote, type] of [
    ["我长期只能在内网办公。", "个人背景"],
    ["这个项目发布失败让我当时很挫败。", "个人经历"],
    ["我未来半年每周投入六小时探索转行，尚未决定。", "目标与方向"],
    ["我正在形成先小规模尝试再长期投入的原则，还在验证。", "观点与想法"],
    ["以后所有讨论请先给结论再解释，这是长期沟通习惯。", "稳定偏好"],
  ])
    assert.doesNotThrow(() => validatePersonalEvidence(proposal(quote, quote, type)));
});
test("personal value: project durations do not qualify tasks; scoped validation and reuse principles do", () => {
  for (const quote of [
    "后续可能不定时更新补充数据，重新做回测。",
    "下一环节我打算开始改 WebUI。",
    "把回测模块独立拆出来，方便多个策略复用。",
    "之后最常用的更新是增量拉取数据，要优化这个更新速度。",
    "不要上传数据，只上传一个 demo 策略。",
    "这个项目长期要更新数据并重新做回测。",
  ])
    assert.throws(
      () => validatePersonalEvidence(proposal(quote, quote, "目标与方向")),
      /project-specific/,
    );
  for (const [quote, content] of [
    ["下一环节先做回测。", "用户在讨论策略时当前倾向先验证效果。"],
    ["把回测模块独立拆出来，方便多个策略复用。", "用户在架构设计中倾向复用公共能力。"],
  ]) {
    const p = {
      ...proposal(quote, content, "观点与想法"),
      scope: "策略讨论和架构设计",
      certainty: "当前倾向",
    };
    assert.doesNotThrow(() => validatePersonalEvidence(p));
    assert.throws(() => validatePersonalEvidence({ ...p, certainty: "明确" }), /project-specific/);
  }
});

test("extraction: market opinions and real attempts survive while project instructions are filtered", async () => {
  for (const [quote, content, type, certainty, scope] of [
    [
      "我认为 A 股常受情绪和资金影响，基本面解释不了全部波动。",
      "用户认为 A 股常受情绪和资金影响，基本面无法解释全部波动。",
      "观点与想法",
      "明确",
      "讨论 A 股市场时",
    ],
    [
      "我试了三个月日频策略，发现自己很难坚持回撤期。",
      "用户尝试了三个月日频策略，自述很难坚持回撤期。",
      "个人经历",
      "明确",
      "讨论投资经历时",
    ],
    [
      "下一环节先做回测。",
      "用户在讨论策略时当前倾向先验证效果。",
      "观点与想法",
      "当前倾向",
      "讨论策略研究时",
    ],
    [
      "把回测模块独立拆出来，方便多个策略复用。",
      "用户在架构设计中倾向复用公共能力。",
      "观点与想法",
      "当前倾向",
      "讨论架构设计时",
    ],
  ]) {
    const snapshot = snap(quote);
    const result = await extractCandidates({ snapshot, state: emptyState() }, async (payload) =>
      payload.stage === "extract"
        ? {
            candidates: [
              {
                action: "add",
                title: "个人观点或尝试",
                content,
                type,
                certainty,
                scope,
                tags: [],
                reason: "今后讨论个人取舍和经历时需要考虑",
                entryId: "user",
                quote,
              },
            ],
          }
        : {
            reviews: [
              {
                index: 0,
                verdict: "keep",
                basis: "personal_context",
                personalQuote: quote,
                independentUse: "今后讨论市场看法、尝试经历或研究方法时可对照。",
                reason: "用户原话支持有范围的个人意义",
              },
            ],
          },
    );
    assert.equal(result.length, 1, content);
    assert.equal(result[0].certainty, certainty);
  }
});

test("review: a keep verdict without personal evidence or with task basis cannot pass", async () => {
  const quote = "我认为 A 股受情绪和资金影响。";
  for (const extra of [
    { basis: "project_detail" },
    { personalQuote: "我已经实盘十年。" },
    { independentUse: "" },
  ]) {
    const result = await extractCandidates(
      { snapshot: snap(quote), state: emptyState() },
      async (payload) =>
        payload.stage === "extract"
          ? {
              candidates: [
                {
                  action: "add",
                  title: "市场看法",
                  content: quote,
                  type: "观点与想法",
                  certainty: "明确",
                  scope: "A股讨论",
                  tags: [],
                  reason: "未来讨论市场观点",
                  entryId: "user",
                  quote,
                },
              ],
            }
          : {
              reviews: [
                {
                  index: 0,
                  verdict: "keep",
                  basis: "personal_context",
                  personalQuote: quote,
                  independentUse: "讨论市场看法",
                  reason: "测试无效通过决定",
                  ...extra,
                },
              ],
            },
    );
    assert.deepEqual(result, []);
  }
});

test("live capture and historical extraction apply the same project exclusion, even for remember requests", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "personal-value-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new MemoryStore(dir);
  await store.initialize();
  const quote = "记住，这个插件要显示五种分类。",
    snapshot = snap(quote),
    capture = new CaptureSession(store);
  capture.begin(snapshot, quote);
  const params = {
    action: "add",
    title: "分类展示",
    content: "这个插件要显示五种分类。",
    type: "稳定偏好",
    reason: "Remember this implementation",
    entryId: "user",
    quote,
    explicitRequestQuote: quote,
  };
  const result = await capture.write(params, snapshot);
  assert.equal(result.status, "filtered");
  assert.equal(await store.count(), 0);
  let stages = [];
  const extracted = await extractCandidates({ snapshot, state: emptyState() }, async (payload) => {
    stages.push(payload.stage);
    return {
      candidates: [
        {
          action: "add",
          title: params.title,
          content: params.content,
          type: params.type,
          reason: params.reason,
          entryId: params.entryId,
          quote: params.quote,
          scope: "",
          tags: [],
          certainty: "明确",
        },
      ],
    };
  });
  assert.deepEqual(extracted, []);
  assert.deepEqual(stages, ["extract"]);
});
