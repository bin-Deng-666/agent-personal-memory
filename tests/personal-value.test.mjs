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
const { validatePersonalEvidence } = await jiti.import("../packages/core/src/domain/evidence.ts");
const { memoryStatusLabel } = await jiti.import("../packages/core/src/domain/presentation.ts");
const { CaptureSession } = await jiti.import("../packages/core/src/capture.ts");
const { MemoryStore } = await jiti.import("../packages/core/src/storage/store.ts");
const { snapshotFromEntries, makeSource } = await jiti.import(
  "../packages/core/src/history/sessions.ts",
);
const { extractCandidates } = await jiti.import("../packages/core/src/history/extraction.ts");
const { emptyState } = await jiti.import("../packages/core/src/domain/memory.ts");
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
test("presentation: both hosts share Personal Memory name and zero/one/many grammar", () => {
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
    return JSON.stringify({ candidates: [{ ...params, certainty: "明确" }] });
  });
  assert.deepEqual(extracted, []);
  assert.deepEqual(stages, ["extract"]);
});
