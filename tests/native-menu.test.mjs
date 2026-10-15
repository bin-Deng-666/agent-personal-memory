import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
const { createJiti } = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"))(
  "jiti",
);
const jiti = createJiti(import.meta.url);
const { NativeMenu } = await jiti.import("../packages/claude-code/src/native-menu.ts");
const { ClaudeSessions } = await jiti.import("../packages/claude-code/src/sessions.ts");
const { MemoryStore } = await jiti.import("../packages/core/src/storage/store.ts");
const { createProposal } = await jiti.import("../packages/core/src/domain/memory.ts");
async function harness(t, count = 1) {
  const directory = await mkdtemp(join(tmpdir(), "personal-memory-native-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new MemoryStore(join(directory, "memory"));
  await store.initialize();
  for (let i = 0; i < count; i++)
    await store.apply(
      createProposal({
        title: `Habit ${i}`,
        content: `Answer with conclusion ${i} first.`,
        type: "稳定偏好",
        scope: "Preserve this internal scope",
      }),
    );
  const sessions = new ClaudeSessions(store.dir),
    input = {
      session_id: "fixture",
      transcript_path: join(directory, "fixture.jsonl"),
      prompt: "/personal-memory",
    };
  await writeFile(input.transcript_path, "");
  const session = await sessions.register(input, true);
  const menu = new NativeMenu(store, sessions);
  await menu.start(session);
  let index = 0;
  const question = async () => {
    const id = `tool-${++index}`;
    const input = await menu.question(session.id, id);
    assert.ok(input.questions[0].options.length >= 2 && input.questions[0].options.length <= 4);
    return { id, input };
  };
  const choose = async (label) => {
    const { id, input } = await question();
    assert.ok(
      input.questions[0].options.some((option) => option.label === label),
      label,
    );
    return menu.answer(session.id, id, label);
  };
  return { directory, store, sessions, menu, session, question, choose };
}
test("native menu: normal session starts with supported choices, visible categories and pageable records", async (t) => {
  const h = await harness(t, 5);
  let q = (await h.question()).input.questions[0];
  assert.deepEqual(
    q.options.map((option) => option.label),
    ["Library", "Extraction", "Advice", "Settings"],
  );
  assert.equal(q.question, "Personal Memory On · 5 total · 5 habits loaded");
  await h.choose("Library");
  q = (await h.question()).input.questions[0];
  assert.ok(q.options[0].label.startsWith("[Preferences]"));
  assert.ok(q.options.some((option) => option.label === "More"));
  await h.choose("More");
  assert.equal((await h.sessions.read(h.session.id)).menu.offset, 2);
  await h.choose("Search / Back");
  const { id } = await h.question();
  await h.menu.answer(h.session.id, id, "Habit 4");
  q = (await h.question()).input.questions[0];
  assert.equal(q.options[0].label, "[Preferences] Habit 4");
});
test("native menu: only a matching host tool answer can edit; current value and internal scope are preserved", async (t) => {
  const h = await harness(t);
  await h.choose("Library");
  await h.choose("[Preferences] Habit 0");
  await h.choose("Edit");
  await h.choose("Content");
  const { id, input } = await h.question();
  assert.ok(input.questions[0].question.includes("Answer with conclusion 0 first."));
  assert.deepEqual(await h.menu.answer(h.session.id, "forged-tool", "Invented content"), {
    ignored: true,
  });
  assert.equal((await h.store.read()).memories[0].version, 1);
  await h.menu.answer(h.session.id, id, "Updated exact user replacement.");
  const memory = (await h.store.read()).memories[0];
  assert.equal(memory.content, "Updated exact user replacement.");
  assert.equal(memory.scope, "Preserve this internal scope");
  assert.equal(memory.version, 2);
});
test("native menu: all five types are reachable and stale edits cannot overwrite another host", async (t) => {
  const h = await harness(t);
  await h.choose("Library");
  await h.choose("[Preferences] Habit 0");
  await h.choose("Edit");
  await h.choose("Type");
  let q = (await h.question()).input.questions[0];
  assert.deepEqual(
    q.options.slice(0, 3).map((o) => o.label),
    ["Background", "Experiences", "Goals & direction"],
  );
  await h.choose("More types");
  q = (await h.question()).input.questions[0];
  assert.deepEqual(
    q.options.slice(0, 2).map((o) => o.label),
    ["Ideas & insights", "Preferences"],
  );
  await h.choose("Ideas & insights");
  assert.equal((await h.store.read()).memories[0].type, "观点与想法");
  await h.choose("Edit");
  await h.choose("Content");
  const { id } = await h.question();
  const old = (await h.store.read()).memories[0];
  await h.store.apply(
    createProposal({
      ...old,
      action: "update",
      targetId: old.id,
      targetVersion: old.version,
      content: "Saved by another host.",
    }),
  );
  await h.menu.answer(h.session.id, id, "Stale replacement");
  assert.equal((await h.store.read()).memories[0].content, "Saved by another host.");
  assert.match((await h.sessions.read(h.session.id)).menu.notice, /changed/);
});
test("native menu: Off/On, explicit deletion and Close share persistent state", async (t) => {
  const h = await harness(t);
  await h.choose("Settings");
  await h.choose("Turn Off");
  assert.equal((await h.store.settings()).enabled, false);
  assert.equal(
    (await h.question()).input.questions[0].question,
    "Personal Memory Off · 1 total · 0 habits loaded",
  );
  await h.choose("Turn On");
  await h.choose("Back");
  await h.choose("Library");
  await h.choose("[Preferences] Habit 0");
  await h.choose("Delete");
  assert.equal(await h.store.count(), 0);
  assert.ok((await h.store.read()).suppressed.length);
  await h.choose("Search / Back");
  await h.choose("Back");
  await h.choose("Settings");
  assert.equal((await h.choose("Close")).closed, true);
  assert.equal(await h.menu.active(h.session.id), undefined);
});
test("native menu: merely mentioning the command leaves ordinary questions untouched", async (t) => {
  const h = await harness(t);
  await h.sessions.register(
    {
      session_id: h.session.id,
      transcript_path: h.session.transcriptPath,
      prompt: "Explain why /personal-memory was unavailable earlier",
    },
    true,
  );
  const session = await h.sessions.read(h.session.id);
  assert.equal(session.mode, "ordinary");
  assert.equal(await h.menu.active(session.id), undefined);
});

test("native menu: multi-select starts independent tasks for the selected discovered conversations", async (t) => {
  const h = await harness(t);
  const original = {
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
  };
  process.env.CLAUDE_CONFIG_DIR = join(h.directory, "claude");
  process.env.PI_CODING_AGENT_DIR = join(h.directory, "pi");
  t.after(() => {
    for (const [key, value] of Object.entries(original))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });
  const project = join(process.env.CLAUDE_CONFIG_DIR, "projects", "fixture");
  await mkdir(project, { recursive: true });
  for (let i = 0; i < 2; i++)
    await writeFile(
      join(project, `${i}.jsonl`),
      JSON.stringify({
        type: "user",
        uuid: `user-${i}`,
        parentUuid: null,
        sessionId: `session-${i}`,
        timestamp: "2026-01-01T00:00:00Z",
        message: { role: "user", content: `Original conversation ${i}` },
      }) + "\n",
    );
  const launched = [];
  h.menu.tasks.start = async (path, name) => {
    launched.push({ path, name });
    return { id: path };
  };
  await h.choose("Extraction");
  await h.choose("Select conversations");
  const { id, input } = await h.question();
  assert.equal(input.questions[0].multiSelect, true);
  const labels = input.questions[0].options
    .filter((option) => option.label !== "Back")
    .map((option) => option.label);
  assert.equal(labels.length, 2);
  await h.menu.answer(h.session.id, id, labels.join(", "));
  assert.equal(launched.length, 2);
  assert.equal((await h.sessions.read(h.session.id)).menu.screen, "extraction");
});

test("native menu: Advice uses actual typed answer, changes lookup mode and cannot outlive a user turn", async (t) => {
  const h = await harness(t);
  await h.choose("Advice");
  const { id } = await h.question();
  assert.deepEqual(await h.menu.answer(h.session.id, id, "A real user question?"), {
    advice: "A real user question?",
  });
  assert.equal((await h.sessions.read(h.session.id)).mode, "advice");
  await h.sessions.register(
    {
      session_id: h.session.id,
      transcript_path: h.session.transcriptPath,
      prompt: "Continue unrelated work",
    },
    true,
  );
  assert.equal(await h.menu.active(h.session.id), undefined);
});
