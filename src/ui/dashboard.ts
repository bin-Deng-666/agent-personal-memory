import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  Input,
  matchesKey,
  Key,
  visibleWidth,
  truncateToWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";
import { TYPE_LABELS, CERTAINTY_LABELS } from "../domain/memory.ts";
import type { Memory } from "../domain/memory.ts";
import type { ExtractionTask, ConversationSummary } from "../domain/task.ts";
import {
  FULL_SCREEN,
  coverViewport,
  activeText,
  inputField,
  conversationLabel,
  terminalText as safe,
} from "./screen.ts";

interface DashboardData {
  memories: Memory[];
  enabled: boolean;
  loadedHabits?: number;
  tasks: ExtractionTask[];
  conversations: ConversationSummary[];
  notice?: string;
}
interface DashboardState {
  page: "home" | "content";
  homeIndex: number;
  tab: number;
  queries: string[];
  selected: string[];
  focus: "action" | "search" | "list";
}
export const dashboardState = (): DashboardState => ({
  page: "home",
  homeIndex: 0,
  tab: 0,
  queries: ["", "", ""],
  selected: ["", "", ""],
  focus: "list",
});
const views = ["📚 Library", "🛰️  Extraction", "💬 Advice"];
interface Row {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  status?: ConversationSummary["status"];
}
interface Hit {
  x: number;
  y: number;
  width: number;
  height: number;
  action: string;
}
export class MemoryDashboard {
  readonly searchInput = new Input({ prompt: "", placeholder: "Type to search…" });
  readonly questionInput = new Input({ prompt: "", placeholder: "Type your question…" });
  get input() {
    return this.state.tab === 2 ? this.questionInput : this.searchInput;
  }
  private _focused = false;
  private hits: Hit[] = [];
  private scroll = 0;
  private previewOffset = 0;
  get focused() {
    return this._focused;
  }
  set focused(value: boolean) {
    this._focused = value;
    this.searchInput.focused =
      value &&
      this.state.page === "content" &&
      this.state.tab !== 2 &&
      this.state.focus === "search";
    this.questionInput.focused = value && this.state.page === "content" && this.state.tab === 2;
  }
  error = "";
  busy = false;
  constructor(
    public data: DashboardData,
    readonly state: DashboardState,
    readonly theme: Theme,
    readonly kb: { matches(data: string, action: any): boolean },
    readonly done: (action: string | null) => void,
    readonly refresh: () => void,
    readonly toggle: () => void,
    public terminalRows = 30,
  ) {
    this.input.setValue(state.queries[state.tab]);
    this.ensureSelection();
  }
  update(data: DashboardData) {
    this.data = data;
    this.ensureSelection();
  }
  rows(): Row[] {
    const terms = this.input.getValue().trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (this.state.tab === 0)
      return this.data.memories
        .filter((m) =>
          terms.every((term) =>
            `${m.title} ${m.content} ${m.scope} ${m.type} ${TYPE_LABELS[m.type]} ${m.tags.join(" ")}`
              .toLowerCase()
              .includes(term),
          ),
        )
        .map((m) => ({
          id: m.id,
          title: m.title,
          subtitle: `${TYPE_LABELS[m.type]} · ${CERTAINTY_LABELS[m.certainty]}`,
          body: `${m.content}${m.scope ? `\n\nApplies to: ${m.scope}` : ""}${m.sources?.length ? `\n\nOriginal words · ${m.sources[0].timestamp.slice(0, 10)}\n“${m.sources[0].quote}”` : ""}`,
        }));
    if (this.state.tab === 1)
      return this.data.conversations
        .filter((c) => terms.every((term) => `${c.title} ${c.status}`.toLowerCase().includes(term)))
        .map((c) => {
          const job = this.data.tasks.find((t) => t.sourcePath === c.path && t.phase === "running");
          return {
            id: `conversation:${c.path}`,
            title: `${c.title}${job ? " · Running" : ""}`,
            status: c.status,
            subtitle: "",
            body: "",
          };
        });
    return [];
  }
  private ensureSelection() {
    const rows = this.rows();
    if (!rows.some((r) => r.id === this.state.selected[this.state.tab]))
      this.state.selected[this.state.tab] = rows[0]?.id || "";
  }
  private open(view: number) {
    this.state.page = "content";
    this.state.tab = view;
    this.state.homeIndex = view;
    this.state.focus = "list";
    this.error = "";
    this.input.setValue(this.state.queries[view]);
    this.focused = this._focused;
    this.scroll = 0;
    this.previewOffset = 0;
    this.ensureSelection();
    this.refresh();
  }
  handleInput(data: string) {
    if (matchesKey(data, Key.tab)) {
      this.toggle();
      return;
    }
    if (matchesKey(data, Key.ctrl("r"))) {
      this.done("history");
      return;
    }
    if (this.kb.matches(data, "tui.select.cancel")) {
      if (this.state.page === "home") this.done(null);
      else {
        this.state.queries[this.state.tab] = this.input.getValue();
        this.state.page = "home";
        this.error = "";
        this.focused = this._focused;
        this.refresh();
      }
      return;
    }
    if (this.state.page === "home") {
      if (this.kb.matches(data, "tui.select.up"))
        this.state.homeIndex = (this.state.homeIndex + 2) % 3;
      else if (this.kb.matches(data, "tui.select.down"))
        this.state.homeIndex = (this.state.homeIndex + 1) % 3;
      else if (this.kb.matches(data, "tui.select.confirm")) {
        this.open(this.state.homeIndex);
        return;
      }
      this.refresh();
      return;
    }
    if (this.state.tab === 2) {
      if (this.kb.matches(data, "tui.select.confirm")) {
        const question = this.questionInput.getValue().trim();
        if (!this.data.enabled) this.error = "Memory is Off. Press Tab to enable.";
        else if (!this.data.memories.length) this.error = "Extract a conversation first.";
        else if (question) this.done(`advice:${question}`);
      } else this.questionInput.handleInput(data);
      this.state.queries[2] = this.questionInput.getValue();
      this.refresh();
      return;
    }
    if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.pageDown)) {
      this.previewOffset = Math.max(
        0,
        this.previewOffset + (matchesKey(data, Key.pageUp) ? -6 : 6),
      );
      this.refresh();
      return;
    }
    if (this.state.focus === "action") {
      if (this.kb.matches(data, "tui.select.confirm")) this.done("history");
      else if (this.kb.matches(data, "tui.select.down")) {
        this.state.focus = "search";
        this.focused = this._focused;
      }
      this.refresh();
      return;
    }
    if (this.state.focus === "search") {
      if (this.kb.matches(data, "tui.select.up")) {
        if (this.state.tab === 1) this.state.focus = "action";
      } else if (
        this.kb.matches(data, "tui.select.down") ||
        this.kb.matches(data, "tui.select.confirm")
      )
        this.state.focus = "list";
      else {
        this.input.handleInput(data);
        this.state.queries[this.state.tab] = this.input.getValue();
        this.ensureSelection();
      }
      this.focused = this._focused;
      this.refresh();
      return;
    }
    const rows = this.rows();
    const index = Math.max(
      0,
      rows.findIndex((r) => r.id === this.state.selected[this.state.tab]),
    );
    if (this.kb.matches(data, "tui.select.confirm")) {
      if (rows[index]) this.done(rows[index].id);
      else if (this.state.tab === 1) this.done("history");
      return;
    }
    if (this.kb.matches(data, "tui.select.up")) {
      if (index === 0) {
        this.state.focus = "search";
        this.focused = this._focused;
      } else this.state.selected[this.state.tab] = rows[index - 1]?.id || "";
    } else if (this.kb.matches(data, "tui.select.down"))
      this.state.selected[this.state.tab] = rows[Math.min(index + 1, rows.length - 1)]?.id || "";
    else {
      this.state.focus = "search";
      this.focused = this._focused;
      this.input.handleInput(data);
      this.state.queries[this.state.tab] = this.input.getValue();
      this.ensureSelection();
    }
    this.previewOffset = 0;
    this.refresh();
  }
  handleMouse(event: TuiMouseEvent) {
    if (event.type === "wheel" && this.state.page === "content") {
      this.previewOffset = Math.max(0, this.previewOffset + (event.wheelDelta || 0));
      this.refresh();
      return { handled: true };
    }
    if (event.type !== "click" || event.button !== "left") return;
    const hit = this.hits.find(
      (h) =>
        event.x >= h.x && event.x < h.x + h.width && event.y >= h.y && event.y < h.y + h.height,
    );
    if (!hit) return;
    if (hit.action.startsWith("view:")) this.open(Number(hit.action.slice(5)));
    else if (hit.action === "search") {
      this.state.focus = "search";
      this.focused = this._focused;
      this.refresh();
    } else if (hit.action.startsWith("select:")) {
      this.state.focus = "list";
      this.focused = this._focused;
      this.state.selected[this.state.tab] = hit.action.slice(7);
      this.previewOffset = 0;
      if ((event.clickCount || 1) > 1) this.done(hit.action.slice(7));
      this.refresh();
    } else if (hit.action === "toggle") this.toggle();
    else this.done(hit.action);
    return { handled: true, focus: true };
  }
  render(width: number): string[] {
    width = Math.max(1, width);
    const inner = Math.max(1, width - 4);
    const height = Math.max(1, this.terminalRows);
    const accent = (s: string) => this.theme.fg("accent", s),
      muted = (s: string) => this.theme.fg("dim", s);
    const pad = (s: string, w: number) =>
      truncateToWidth(s, w) + " ".repeat(Math.max(0, w - Math.min(w, visibleWidth(s))));
    const decorate = (s: string) => truncateToWidth(`  ${s}`, width);
    const header: string[] = [""];
    this.hits = [];
    const hit = (x: number, y: number, w: number, action: string, rows = 1) =>
      this.hits.push({ x, y, width: w, height: rows, action });
    const toggle =
      inner < 46
        ? this.data.enabled
          ? "● On"
          : "○ Off"
        : this.data.enabled
          ? "● Memory On"
          : "○ Memory Off";
    const title = accent(
      this.theme.bold(this.state.page === "home" ? "🧠 Memory" : views[this.state.tab]),
    );
    header.push(
      decorate(
        title +
          " ".repeat(Math.max(1, inner - visibleWidth(title) - visibleWidth(toggle))) +
          this.theme.fg(this.data.enabled ? "success" : "dim", toggle),
      ),
    );
    hit(Math.max(2, width - visibleWidth(toggle) - 2), 1, visibleWidth(toggle), "toggle");
    header.push(
      decorate(
        this.error
          ? this.theme.fg("error", safe(this.error))
          : muted(
              this.busy
                ? "Saving settings…"
                : this.data.notice
                  ? safe(this.data.notice)
                  : `${this.data.memories.length} memories · ${this.data.enabled ? this.data.loadedHabits || 0 : 0} habits loaded`,
            ),
      ),
    );
    const compact = inner < 45;
    const controls =
      this.state.page === "home"
        ? "↑↓ Select · Enter Open"
        : this.state.tab === 2
          ? "Enter Ask"
          : this.state.focus === "search"
            ? "↑↓ Focus · Enter Results"
            : this.state.focus === "action"
              ? "↑↓ Focus · Enter Extract"
              : compact
                ? "↑↓ Select · Enter Open"
                : this.state.tab === 0
                  ? "↑↓ Select · Enter Open"
                  : "↑↓ Select · Enter Open · Ctrl+R Extract";
    const footer = [
      decorate(muted(controls)),
      decorate(muted(compact ? "Esc Back · Tab On/Off" : "Esc Back · Tab Memory On/Off")),
    ];
    const available = Math.max(0, height - header.length - footer.length);
    const body: string[] = [];
    const row = (text: string) => body.push(decorate(text));
    if (this.state.page === "home") {
      const descriptions = [
        "Your memories, with their original words.",
        "Choose conversations. Track saved results.",
        "Ask a question using relevant memories.",
      ];
      if (available >= 9) row("");
      views.forEach((view, i) => {
        hit(2, header.length + body.length, inner, `view:${i}`, available >= 9 ? 2 : 1);
        row(this.state.homeIndex === i ? accent(this.theme.bold(`› ${view}`)) : `  ${view}`);
        if (available >= 9) {
          row(muted(`  ${descriptions[i]}`));
          row("");
        }
      });
    } else if (this.state.tab === 2) {
      row("");
      row(inputField(this.questionInput, this.theme, inner, this._focused, "Question"));
      row("");
      if (!this.data.enabled) row(muted("Tab to enable Memory."));
      else if (!this.data.memories.length) row(muted("Extract a conversation first."));
      else row(muted("Answer continues in your conversation."));
    } else {
      row("");
      if (this.state.tab === 1) {
        const primary = "＋ Select conversations";
        hit(2, header.length + body.length, visibleWidth(primary) + 2, "history");
        row(this.state.focus === "action" ? activeText(this.theme, `› ${primary}`) : primary);
      }
      hit(2, header.length + body.length, inner, "search");
      row(inputField(this.input, this.theme, inner, this.state.focus === "search"));
      row("");
      const rows = this.rows();
      const selectedIndex = rows.findIndex((r) => r.id === this.state.selected[this.state.tab]);
      const selected = rows[selectedIndex];
      const stride = this.state.tab === 1 ? 1 : 2;
      const slotsHeight = Math.max(0, available - body.length - 1);
      const slots = Math.max(1, Math.floor(slotsHeight / stride));
      if (selectedIndex < this.scroll) this.scroll = Math.max(0, selectedIndex);
      if (selectedIndex >= this.scroll + slots) this.scroll = selectedIndex - slots + 1;
      this.scroll = Math.min(this.scroll, Math.max(0, rows.length - slots));
      const wide = this.state.tab === 0 && inner >= 70;
      const leftWidth = wide ? Math.floor(inner * 0.42) : inner;
      const rightWidth = Math.max(1, inner - leftWidth - 3);
      const left: string[] = [];
      if (!rows.length)
        left.push(
          muted(
            this.input.getValue()
              ? "No matches"
              : this.state.tab === 0
                ? "No memories yet"
                : "No extractions yet",
          ),
          muted(
            this.state.tab === 0
              ? "Extract from past conversations."
              : "Choose conversations to get started.",
          ),
        );
      for (const entry of rows.slice(this.scroll, this.scroll + slots)) {
        hit(2, header.length + body.length + left.length, leftWidth, `select:${entry.id}`, stride);
        const selectedRow = entry.id === selected?.id && this.state.focus === "list";
        const label = entry.status
          ? conversationLabel(this.theme, entry.status, entry.title)
          : safe(entry.title);
        const title = truncateToWidth(`${selectedRow ? "› " : "  "}${label}`, leftWidth);
        left.push(selectedRow ? activeText(this.theme, pad(title, leftWidth)) : title);
        if (stride > 1)
          left.push(
            selectedRow
              ? activeText(this.theme, pad(`  ${entry.subtitle}`, leftWidth))
              : truncateToWidth(muted(`  ${entry.subtitle}`), leftWidth),
          );
      }
      const right = selected
        ? [
            accent(this.theme.bold(safe(selected.title))),
            "",
            ...safe(selected.body)
              .split("\n")
              .flatMap((s) => (s ? wrapTextWithAnsi(s, rightWidth) : [""])),
          ]
        : [];
      this.previewOffset = Math.min(this.previewOffset, Math.max(0, right.length - slotsHeight));
      const bodyY = header.length + body.length;
      for (let i = 0; i < slotsHeight; i++)
        row(
          wide
            ? `${pad(left[i] || "", leftWidth)}   ${right[this.previewOffset + i] || ""}`
            : left[i] || "",
        );
      if (wide && selected) hit(leftWidth + 5, bodyY, rightWidth, selected.id, slotsHeight);
      row(
        muted(
          this.state.tab === 1
            ? `${rows.length} conversations${rows.length ? ` · ${Math.max(1, selectedIndex + 1)} / ${rows.length}` : ""}`
            : rows.length
              ? `${Math.max(1, selectedIndex + 1)} / ${rows.length}`
              : "",
        ),
      );
    }
    return coverViewport(
      [...header, ...Array.from({ length: available }, (_, i) => body[i] || ""), ...footer],
      width,
      height,
    );
  }
  invalidate() {
    this.input.invalidate();
  }
}
export async function dashboard(
  ctx: ExtensionContext,
  state: DashboardState,
  load: () => Promise<DashboardData>,
  setEnabled: (enabled: boolean) => Promise<void>,
): Promise<string | null> {
  const initial = await load();
  return ctx.ui.custom<string | null>((tui, theme, kb, done) => {
    let disposed = false;
    let closing = false;
    let loading = false;
    let revision = 0;
    let pending: Promise<void> = Promise.resolve();
    const finish = (action: string | null) => {
      if (closing || disposed) return;
      closing = true;
      if (!component.busy) done(action);
      else
        void pending.then(() => {
          if (!disposed) done(action);
        });
    };
    const toggle = () => {
      const enabled = !component.data.enabled;
      const current = ++revision;
      component.update({ ...component.data, enabled });
      component.busy = true;
      component.error = "";
      tui.requestRender();
      pending = pending.then(async () => {
        try {
          await setEnabled(enabled);
        } catch (error) {
          if (!disposed && current === revision)
            component.error = error instanceof Error ? error.message : String(error);
        }
        try {
          const data = await load();
          if (!disposed && current === revision) component.update(data);
        } catch (error) {
          if (!disposed && current === revision)
            component.error = error instanceof Error ? error.message : String(error);
        }
        if (!disposed && current === revision) {
          component.busy = false;
          tui.requestRender();
        }
      });
    };
    const component = new MemoryDashboard(
      initial,
      state,
      theme,
      kb,
      finish,
      () => tui.requestRender(),
      toggle,
      Math.max(1, tui.terminal.rows),
    );
    const timer = setInterval(() => {
      if (disposed || closing || loading || component.busy) return;
      loading = true;
      const current = revision;
      load()
        .then((data) => {
          if (!disposed && !closing && current === revision) {
            component.update(data);
            tui.requestRender();
          }
        })
        .catch(() => {})
        .finally(() => {
          loading = false;
        });
    }, 1000);
    return {
      get focused() {
        return component.focused;
      },
      set focused(value: boolean) {
        component.focused = value;
      },
      render: (width: number) => {
        component.terminalRows = Math.max(1, tui.terminal.rows);
        return component.render(width);
      },
      invalidate: () => component.invalidate(),
      handleInput: (data: string) => {
        if (!closing && !disposed) component.handleInput(data);
      },
      handleMouse: (event: TuiMouseEvent) => {
        if (!closing && !disposed) return component.handleMouse(event);
      },
      dispose() {
        disposed = true;
        clearInterval(timer);
        component.focused = false;
        tui.requestRender(true);
      },
    };
  }, FULL_SCREEN);
}
