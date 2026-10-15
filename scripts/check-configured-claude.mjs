// Optional integration check: uses the user's installed Claude plugin and configured model.
// Synthetic statements are saved only in a temporary PERSONAL_MEMORY_DIR.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const exec = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), "agent-memory-configured-claude-"));
const reportPath = process.argv[2] || join(directory, "report.json");
const report = { directory, cases: [], success: false };
const env = { ...process.env, PERSONAL_MEMORY_DIR: join(directory, "library") };
delete env.CLAUDECODE;
const cases = [
  [
    "个人背景",
    "我长期在只能使用内网的单位工作，工作电脑不能连接公共互联网。这是持续的工作条件，之后讨论工具时需要考虑离线可用。我最近在整理适合自己的工作方法，先简单回应一句即可。",
  ],
  [
    "个人经历",
    "去年我第一次独立负责产品发布，上线前一晚因为回滚方案不完整而很焦虑。最后顺利上线了，但这段经历让我以后做发布准备时会认真检查回滚步骤。这是我亲身经历的一件重要事情，先简单回应一句即可。",
  ],
  [
    "目标与方向",
    "我最近在认真探索从后端开发转向产品设计，还没有决定。我准备未来三个月每周花六小时学习和做小练习，能否转方向还取决于家庭支出。这是我正在投入的长期方向，先简单回应一句即可。",
  ],
  [
    "观点与想法",
    "我现在形成了一个想继续实践的原则：选择职业方向时，应先做小规模的真实尝试，再决定是否长期投入。这个看法来自我对过往选择的反思，但我还在验证它，不能说它始终有效。先简单回应一句即可。",
  ],
  [
    "稳定偏好",
    "以后我们讨论问题时，我希望你总是先给出结论，再解释依据和可执行步骤；不要用比喻。这是我希望长期适用的沟通习惯，先简单回应一句即可。",
  ],
];
async function memories() {
  try {
    return (
      await Promise.all(
        (await readdir(join(env.PERSONAL_MEMORY_DIR, "records"))).map(
          async (name) =>
            JSON.parse(await readFile(join(env.PERSONAL_MEMORY_DIR, "records", name), "utf8"))
              .memories,
        ),
      )
    ).flat();
  } catch {
    return [];
  }
}
async function run(prompt) {
  const result = await exec(
    "claude",
    [
      "-p",
      prompt,
      "--verbose",
      "--output-format",
      "stream-json",
      "--permission-mode",
      "dontAsk",
      "--max-budget-usd",
      "0.70",
    ],
    { cwd: directory, env, timeout: 65000, maxBuffer: 8_000_000 },
  );
  return result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}
try {
  for (const [type, prompt] of cases) {
    const before = await memories();
    let events = [],
      error = "";
    try {
      events = await run(prompt);
    } catch (e) {
      error = e.message.slice(0, 500);
    }
    const after = await memories();
    const fresh = after.filter((memory) => !before.some((old) => old.id === memory.id));
    const tools = events
      .filter((event) => event.type === "assistant")
      .flatMap((event) => event.message?.content || [])
      .filter((block) => block.type === "tool_use")
      .map((block) => ({
        name: block.name,
        category: block.input?.type,
        entryId: block.input?.entryId,
      }));
    const toolErrors = events
      .filter((event) => event.type === "user")
      .flatMap((event) => event.message?.content || [])
      .filter((block) => block.type === "tool_result" && block.is_error)
      .map((block) => String(block.content).slice(0, 500));
    const item = {
      type,
      savedTypes: fresh.map((memory) => memory.type),
      tools,
      toolErrors,
      error,
      passed: fresh.some((memory) => memory.type === type),
    };
    report.cases.push(item);
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`${type}: ${item.passed ? "saved" : "not saved"}; ${tools.length} tool calls`);
  }
  const values = await memories();
  report.total = values.length;
  report.types = [...new Set(values.map((memory) => memory.type))];
  report.success = report.cases.every((item) => item.passed);
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      success: report.success,
      total: report.total,
      types: report.types,
      reportPath,
    }),
  );
  if (!report.success) process.exitCode = 1;
} finally {
  if (process.env.KEEP_MEMORY_FIXTURE !== "1")
    await rm(directory, { recursive: true, force: true });
}
