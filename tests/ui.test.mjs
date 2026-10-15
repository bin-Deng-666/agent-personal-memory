import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  Container,
  Editor,
  Text,
  TuiMainScreen,
  TuiAltScreen,
  getKeybindings,
  visibleWidth,
} from "@earendil-works/pi-tui";
const piUrl = import.meta.resolve("@earendil-works/pi-coding-agent");
const { createJiti } = createRequire(fileURLToPath(piUrl))("jiti");
const jiti = createJiti(import.meta.url);
const { dashboard, dashboardState, MemoryDashboard } = await jiti.import("../src/ui/dashboard.ts");
const { chooseMemoryField } = await jiti.import("../src/ui/editor.ts");
const { MemoryFooter } = await jiti.import("../src/ui/footer.ts");
const { MemoryPicker, pickerState } = await jiti.import("../src/ui/picker.ts");
const { silentTool } = await jiti.import("../src/ui/screen.ts");
const { ToolExecutionComponent } = await import(
  new URL("./modes/interactive/components/tool-execution.js", piUrl)
);
const { InteractiveMode } = await import(new URL("./modes/interactive/interactive-mode.js", piUrl));
const { createInteractiveTuiReference } = await import(
  new URL("./modes/interactive/tui-renderer.js", piUrl)
);
const { initTheme, getEditorTheme } = await import(
  new URL("./modes/interactive/theme/theme.js", piUrl)
);
initTheme("dark");
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("UI did not settle");
    await delay(5);
  }
}
function nativeUI(t, mode) {
  const writes = [],
    submissions = [];
  const terminal = {
    rows: 30,
    columns: 100,
    start(input) {
      this.send = input;
    },
    stop() {},
    write(text) {
      writes.push(text);
    },
    hideCursor() {},
    showCursor() {},
  };
  const renderer = mode === "regular" ? new TuiMainScreen(terminal) : new TuiAltScreen(terminal);
  const tui = createInteractiveTuiReference(() => renderer);
  const editor = new Editor(tui, getEditorTheme());
  editor.setText("draft: ");
  editor.onSubmit = (text) => submissions.push(text);
  const editorContainer = new Container();
  editorContainer.addChild(editor);
  renderer.addChild(new Text("ORIGINAL CONVERSATION", 0, 0));
  renderer.addChild(editorContainer);
  renderer.setFocus(editor);
  const host = { ui: tui, editor, editorContainer, keybindings: getKeybindings() };
  const ctx = {
    ui: { custom: (...args) => InteractiveMode.prototype.showExtensionCustom.call(host, ...args) },
  };
  renderer.start();
  t.after(() => renderer.stop());
  return { renderer, terminal, editor, submissions, ctx, writes };
}
test("native UI: Content and Type are spaced, preview current values and cancel back to the editor", async (t) => {
  const ui = nativeUI(t, "regular");
  const memory = {
    id: "record",
    title: "Example",
    content: "Original content to preserve.",
    type: "个人经历",
    scope: "internal scope",
    certainty: "明确",
    tags: [],
    sources: [],
  };
  const result = chooseMemoryField(ui.ctx, memory);
  await until(() => ui.renderer.hasOverlay());
  const screen = ui.renderer.getFocusedComponent();
  let lines = screen.render(100);
  const contentRow = lines.findIndex((line) => line.includes("› Content"));
  const typeRow = lines.findIndex((line) => line.includes("Type"));
  assert.equal(typeRow - contentRow, 2);
  assert.ok(lines.some((line) => line.includes("Original content to preserve.")));
  assert.ok(!lines.join("\n").includes("Scope"));
  assert.ok(!lines.join("\n").includes("Certainty"));
  ui.terminal.send("\x1b[B");
  lines = screen.render(100);
  assert.ok(lines.some((line) => line.includes("› Type")));
  assert.ok(lines.some((line) => line.includes("Experiences")));
  for (const width of [20, 50, 100]) {
    lines = screen.render(width);
    assert.equal(lines.length, 30);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
  }
  ui.terminal.send("\x1b");
  assert.equal(await result, null);
  assert.equal(ui.renderer.getFocusedComponent(), ui.editor);
});

test("native UI: memory tools consume no transcript rows, including when expanded", () => {
  const tool = new ToolExecutionComponent(
    "memory_write",
    "call",
    { title: "PRIVATE_TITLE", entryId: "SOURCE_ID" },
    {},
    { renderShell: "self", renderCall: silentTool, renderResult: silentTool },
    { requestRender() {} },
    "/tmp",
  );
  assert.deepEqual(tool.render(100), []);
  tool.updateResult({
    content: [{ type: "text", text: '{"status":"applied","id":"PRIVATE_RECORD_ID"}' }],
    details: { status: "applied" },
  });
  tool.setExpanded(true);
  assert.deepEqual(tool.render(100), []);
});

test("UI: extraction statuses retain distinct semantic colors in selected and unselected rows", () => {
  const colorCodes = { accent: 34, success: 32, warning: 33, dim: 90 };
  const theme = {
    fg: (color, text) => `\x1b[${colorCodes[color] || 39}m${text}\x1b[39m`,
    bold: (text) => text,
    bg: (_color, text) => `\x1b[44m${text}\x1b[49m`,
  };
  const keys = {
    matches: (data, action) =>
      ({
        "tui.select.up": "UP",
        "tui.select.down": "DOWN",
        "tui.select.confirm": "ENTER",
        "tui.select.cancel": "ESC",
      })[action] === data,
  };
  const conversations = ["Not extracted", "Extracted", "Updated"].map((status, i) => ({
    path: String(i),
    title: `Conversation ${i}`,
    status,
  }));
  const state = dashboardState();
  state.page = "content";
  state.tab = 1;
  const component = new MemoryDashboard(
    { memories: [], enabled: true, tasks: [], conversations },
    state,
    theme,
    keys,
    () => {},
    () => {},
    () => {},
    20,
  );
  let text = component.render(120).join("\n");
  assert.ok(text.includes("🛰️  Extraction"));
  for (const [code, label] of [
    [34, "○ Not extracted"],
    [32, "✓ Extracted"],
    [33, "↻ Updated"],
  ])
    assert.ok(text.includes(`\x1b[${code}m${label}`));
  component.handleInput("DOWN");
  text = component.render(120).join("\n");
  assert.ok(text.includes("\x1b[32m✓ Extracted"));
  assert.ok(text.includes("› "));
  const picker = new MemoryPicker(
    "Conversations",
    conversations.map((c) => ({ value: c.path, label: c.title, status: c.status })),
    pickerState(),
    theme,
    keys,
    () => {},
    () => {},
    true,
    20,
  );
  const picked = picker.render(120).join("\n");
  for (const [code, label] of [
    [34, "○ Not extracted"],
    [32, "✓ Extracted"],
    [33, "↻ Updated"],
  ])
    assert.ok(picked.includes(`\x1b[${code}m${label}`));
});

test("footer: Memory aligns right beside the path, above model stats, without duplicating its status", () => {
  const theme = { fg: (_color, text) => text };
  const statuses = new Map([
    ["personal-memory", "Memory On · 0 total · 0 habits loaded"],
    ["other", "Other extension"],
  ]);
  const ctx = {
    sessionManager: {
      getEntries: () => [],
      getSessionId: () => "session",
      getLeafId: () => null,
      getCwd: () => process.env.HOME,
      getSessionName: () => undefined,
    },
    model: {
      provider: "openrouter",
      id: "deepseek/deepseek-v4.1-flash",
      contextWindow: 1000000,
      reasoning: true,
    },
    getContextUsage: () => ({ percent: 0, contextWindow: 1000000, tokens: 0 }),
  };
  const data = {
    getGitBranch: () => null,
    getExtensionStatuses: () => statuses,
    getAvailableProviderCount: () => 2,
  };
  const footer = new MemoryFooter(
    () => ctx,
    theme,
    data,
    () => "high",
    () => true,
  );
  const lines = footer.render(100);
  assert.ok(lines[0].startsWith("~"));
  assert.ok(lines[0].endsWith(statuses.get("personal-memory")));
  assert.equal(visibleWidth(lines[0]), 100);
  assert.ok(lines[1].includes("(openrouter) deepseek/deepseek-v4.1-flash • high"));
  assert.ok(lines[1].includes("0.0%/1.0M (auto)"));
  assert.deepEqual(lines.slice(2), ["Other extension"]);
  statuses.set("personal-memory", "Memory Off · 0 total · 0 habits loaded");
  assert.ok(footer.render(100)[0].includes("Memory Off"));
  for (const width of [1, 10, 40, 80])
    assert.ok(footer.render(width).every((line) => visibleWidth(line) <= width));
});

test("UI: Search and selection have one visible focus; extraction uses status rows only", () => {
  const theme = {
    fg: (_color, text) => text,
    bold: (text) => text,
    bg: (_color, text) => "\x1b[44m" + text + "\x1b[49m",
  };
  const keys = {
    matches: (data, action) =>
      ({
        "tui.select.up": "UP",
        "tui.select.down": "DOWN",
        "tui.select.confirm": "ENTER",
        "tui.select.cancel": "ESC",
      })[action] === data,
  };
  const memories = [
    {
      id: "one",
      title: "一段经历",
      content: "有原话支持的个人经历。",
      type: "个人经历",
      certainty: "明确",
      scope: "",
      tags: [],
      sources: [],
    },
    {
      id: "two",
      title: "第二段经历",
      content: "另一段个人经历。",
      type: "个人经历",
      certainty: "明确",
      scope: "",
      tags: [],
      sources: [],
    },
  ];
  const state = dashboardState();
  const component = new MemoryDashboard(
    { memories, enabled: true, tasks: [], conversations: [] },
    state,
    theme,
    keys,
    () => {},
    () => {},
    () => {},
    18,
  );
  component.handleInput("ENTER");
  component.focused = true;
  assert.equal(state.focus, "list");
  assert.equal(component.input.focused, false);
  component.handleInput("UP");
  assert.equal(state.focus, "search");
  assert.equal(component.input.focused, true);
  component.handleInput("经历");
  assert.ok(component.render(90).join("\n").includes("› Search │ "));
  component.handleInput("UP");
  assert.equal(state.focus, "search");
  assert.equal(component.input.focused, true);
  assert.equal(component.input.getValue(), "经历");
  component.handleInput("DOWN");
  component.handleInput("DOWN");
  assert.equal(state.selected[0], "two");
  assert.ok(component.render(90).join("\n").includes("› 第二段经历"));
  state.tab = 1;
  state.focus = "list";
  component.input.setValue("");
  component.update({
    memories,
    enabled: true,
    tasks: [],
    conversations: [
      { path: "a", title: "会话一", status: "Not extracted" },
      { path: "b", title: "会话二", status: "Extracted" },
      { path: "c", title: "会话三", status: "Updated" },
    ],
  });
  const rendered = component.render(120).join("\n");
  for (const label of ["Not extracted", "Extracted", "Updated", "3 conversations"])
    assert.ok(rendered.includes(label));
  for (const height of [10, 16, 30]) {
    component.terminalRows = height;
    const lines = component.render(60);
    assert.equal(lines.length, height);
    assert.ok(lines.at(-1).includes("Esc"));
  }
});

test("UI: Advice separates Question from text, keeps focus and submits the original question", () => {
  const theme = {
    fg: (_color, text) => text,
    bold: (text) => text,
    bg: (_color, text) => "\x1b[44m" + text + "\x1b[49m",
  };
  const keys = {
    matches: (data, action) =>
      ({
        "tui.select.up": "UP",
        "tui.select.down": "DOWN",
        "tui.select.confirm": "ENTER",
        "tui.select.cancel": "ESC",
      })[action] === data,
  };
  const state = dashboardState();
  let action;
  const memory = {
    id: "one",
    title: "工作经历",
    content: "原话支持的经历",
    type: "个人经历",
    scope: "",
    certainty: "明确",
    tags: [],
    sources: [],
  };
  const component = new MemoryDashboard(
    { memories: [memory], enabled: true, tasks: [], conversations: [] },
    state,
    theme,
    keys,
    (value) => (action = value),
    () => {},
    () => {},
    16,
  );
  component.focused = true;
  component.handleInput("DOWN");
  component.handleInput("DOWN");
  component.handleInput("ENTER");
  assert.equal(state.tab, 2);
  assert.equal(component.questionInput.focused, true);
  assert.equal(component.searchInput.focused, false);
  component.handleInput("如何安排下一步？");
  const lines = component.render(90);
  const question = lines.find((line) => line.includes("Question"));
  assert.ok(question.includes("› Question │ "));
  assert.ok(question.includes("如何安排下一步？"));
  assert.ok(question.includes("\x1b[44m"));
  component.handleInput("ENTER");
  assert.equal(action, "advice:如何安排下一步？");
});

test("UI: Library has no manual Add action, including an empty library and Ctrl+N", () => {
  const theme = { fg: (_color, text) => text, bold: (text) => text };
  const keys = {
    matches: (data, action) =>
      ({
        "tui.select.up": "UP",
        "tui.select.down": "DOWN",
        "tui.select.confirm": "ENTER",
        "tui.select.cancel": "ESC",
      })[action] === data,
  };
  let action;
  const state = dashboardState();
  const component = new MemoryDashboard(
    { memories: [], enabled: true, tasks: [], conversations: [] },
    state,
    theme,
    keys,
    (value) => (action = value),
    () => {},
    () => {},
    16,
  );
  component.handleInput("ENTER");
  component.handleInput("ENTER");
  assert.equal(action, undefined);
  component.handleInput("\x0e");
  assert.equal(action, undefined);
  assert.ok(!component.render(90).join("\n").includes("Add"));
  assert.ok(!component.render(90).join("\n").includes("Ctrl+N"));
});

for (const mode of ["regular", "fullscreen"]) {
  test(`native UI (${mode}): Tab keeps one overlay; queued switches and Esc restore input and submission`, async (t) => {
    const ui = nativeUI(t, mode);
    let enabled = true;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    t.after(() => release());
    const changes = [];
    const load = async () => ({ enabled, memories: [], tasks: [], conversations: [] });
    const result = dashboard(ui.ctx, dashboardState(), load, async (value) => {
      await gate;
      changes.push(value);
      enabled = value;
    });
    await until(() => ui.renderer.hasOverlay());
    const screen = ui.renderer.getFocusedComponent();
    const lines = screen.render(100);
    assert.equal(lines.length, 30);
    assert.ok(lines.every((line) => visibleWidth(line) === 100));
    ui.terminal.send("\t");
    ui.terminal.send("\t");
    ui.terminal.send("\t");
    assert.equal(ui.renderer.getFocusedComponent(), screen);
    assert.ok(ui.renderer.hasOverlay());
    assert.ok(screen.render(100).join("\n").includes("Memory Off"));
    // Esc waits for already requested transactions, then closes exactly once.
    ui.terminal.send("\x1b");
    assert.equal(ui.renderer.getFocusedComponent(), screen);
    release();
    assert.equal(await result, null);
    assert.deepEqual(changes, [false, true, false]);
    assert.equal(ui.renderer.hasOverlayEntries, false);
    assert.equal(ui.renderer.getFocusedComponent(), ui.editor);
    assert.equal(ui.editor.focused, true);
    assert.equal(ui.editor.getText(), "draft: ");
    ui.terminal.send("你好");
    ui.terminal.send("\r");
    assert.deepEqual(ui.submissions, ["draft: 你好"]);
    // Repeat opening and closing: no stale focus owner or overlay survives.
    for (let i = 0; i < 3; i++) {
      const again = dashboard(ui.ctx, dashboardState(), load, async (value) => {
        enabled = value;
      });
      await until(() => ui.renderer.hasOverlay());
      ui.terminal.send("\x1b");
      assert.equal(ui.renderer.getFocusedComponent(), ui.editor);
      if (i === 2) {
        ui.terminal.send("continue");
        ui.terminal.send("\r");
        assert.equal(ui.submissions.at(-1), "continue");
      }
      await again;
      assert.equal(ui.renderer.getFocusedComponent(), ui.editor);
      assert.equal(ui.renderer.hasOverlayEntries, false);
    }
  });
}
test("native UI: an outstanding refresh cannot revive a closed panel or steal editor focus", async (t) => {
  const ui = nativeUI(t, "regular");
  let calls = 0;
  let release;
  const slowRefresh = new Promise((resolve) => (release = resolve));
  t.after(() => release({ enabled: false, memories: [], tasks: [], conversations: [] }));
  const result = dashboard(
    ui.ctx,
    dashboardState(),
    async () => {
      if (++calls === 2) return slowRefresh;
      return { enabled: true, memories: [], tasks: [], conversations: [] };
    },
    async () => {},
  );
  await until(() => ui.renderer.hasOverlay());
  const screen = ui.renderer.getFocusedComponent();
  await until(() => calls === 2);
  ui.terminal.send("\x1b");
  ui.terminal.send("continue");
  ui.terminal.send("\r");
  await result;
  release({ enabled: false, memories: [], tasks: [], conversations: [] });
  await delay(5);
  assert.ok(
    screen.render(100).join("\n").includes("Memory On"),
    "The disposed panel ignores late data",
  );
  assert.equal(ui.renderer.hasOverlayEntries, false);
  assert.equal(ui.renderer.getFocusedComponent(), ui.editor);
  assert.deepEqual(ui.submissions, ["draft: continue"]);
});

test("native UI: a failed switch stays in the panel, reports the error and allows retry and exit", async (t) => {
  const ui = nativeUI(t, "regular");
  let enabled = true;
  let fail = true;
  const result = dashboard(
    ui.ctx,
    dashboardState(),
    async () => ({ enabled, memories: [], tasks: [], conversations: [] }),
    async (value) => {
      if (fail) throw new Error("Settings temporarily unavailable");
      enabled = value;
    },
  );
  await until(() => ui.renderer.hasOverlay());
  const screen = ui.renderer.getFocusedComponent();
  ui.terminal.send("\t");
  await until(() => screen.render(100).join("\n").includes("Settings temporarily unavailable"));
  assert.ok(screen.render(100).join("\n").includes("Memory On"));
  assert.equal(ui.renderer.getFocusedComponent(), screen);
  fail = false;
  ui.terminal.send("\t");
  ui.terminal.send("\x1b");
  await result;
  assert.equal(enabled, false);
  assert.equal(ui.renderer.getFocusedComponent(), ui.editor);
});
