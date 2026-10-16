// Opt-in, paid model evaluation. Synthetic evidence only; never opens or writes a real memory library.
import { readFile, mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { getAgentDir, ModelRuntime } from "@earendil-works/pi-coding-agent";
const args = process.argv.slice(2);
const provider = args[0],
  modelId = args[1];
if (!provider || !modelId)
  throw new Error("Usage: npm run evaluate:quality -- <provider> <model-id>");
const { createJiti } = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"))(
  "jiti",
);
const jiti = createJiti(import.meta.url);
const { extractCandidates } = await jiti.import("../src/history/extraction.ts");
const { snapshotFromEntries } = await jiti.import("../src/history/sessions.ts");
const { extractionSession } = await jiti.import("../src/agents/extraction-session.ts");
const { emptyState } = await jiti.import("../src/domain/memory.ts");
const cases = JSON.parse(
  await readFile(new URL("../tests/fixtures/personal-value.json", import.meta.url), "utf8"),
);
const agentDir = getAgentDir();
const runtime = await ModelRuntime.create({
  authPath: join(agentDir, "auth.json"),
  modelsPath: join(agentDir, "models.json"),
  modelsStorePath: join(agentDir, "models-store.json"),
  refreshOnCreate: false,
  allowModelNetwork: false,
});
const model = runtime.getModel(provider, modelId);
if (!model) throw new Error("Model is not configured");
const directory = await mkdtemp(join(tmpdir(), "personal-memory-quality-"));
const results = [];
let active;
const abort = new AbortController();
process.once("SIGTERM", () => {
  abort.abort();
  void active?.abort();
});
process.once("SIGINT", () => {
  abort.abort();
  void active?.abort();
});
for (const sample of cases) {
  if (abort.signal.aborted) break;
  const dir = join(directory, sample.id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const entries = [
    {
      type: "message",
      id: sample.id,
      parentId: null,
      timestamp: "2025-01-01T00:00:00Z",
      message: { role: "user", content: sample.text },
    },
  ];
  if (sample.assistant)
    entries.push({
      type: "message",
      id: `${sample.id}-assistant`,
      parentId: sample.id,
      timestamp: "2025-01-01T00:00:01Z",
      message: { role: "assistant", content: sample.assistant },
    });
  try {
    const candidates = await extractCandidates(
      {
        snapshot: snapshotFromEntries(sample.id, entries),
        state: emptyState(),
        contextWindow: model.contextWindow,
      },
      (payload) =>
        extractionSession({
          dir,
          agentDir,
          runtime,
          model,
          payload,
          cancelled: () => abort.signal.aborted,
          setSession: (session) => (active = session),
          onEvent() {},
        }),
    );
    const selected = candidates.filter((candidate) => sample.types?.includes(candidate.type));
    const passed =
      sample.expect === "skip"
        ? candidates.length === 0
        : selected.length > 0 &&
          (!sample.scoped ||
            selected.every((candidate) => candidate.scope && candidate.certainty !== "明确"));
    results.push({
      id: sample.id,
      scenario: sample.scenario,
      expected: sample.expect,
      passed,
      candidates,
    });
    console.log(`${passed ? "PASS" : "FAIL"} ${sample.id} · ${candidates.length} accepted`);
  } catch (error) {
    results.push({
      id: sample.id,
      scenario: sample.scenario,
      expected: sample.expect,
      passed: false,
      error: String(error),
    });
    console.log(`ERROR ${sample.id} · ${String(error)}`);
  }
  await writeFile(
    join(directory, "evaluation.json"),
    JSON.stringify({ provider, model: modelId, results }, null, 2),
  );
}
const expectedSkips = results.filter((result) => result.expected === "skip");
const expectedKeeps = results.filter((result) => result.expected === "keep");
console.log(
  JSON.stringify(
    {
      cases: results.length,
      taskExclusions: `${expectedSkips.filter((result) => result.passed).length}/${expectedSkips.length}`,
      personalRetention: `${expectedKeeps.filter((result) => result.passed).length}/${expectedKeeps.length}`,
      report: join(directory, "evaluation.json"),
    },
    null,
    2,
  ),
);
process.exitCode =
  results.length === cases.length && results.every((result) => result.passed) ? 0 : 1;
