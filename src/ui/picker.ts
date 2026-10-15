import type { ConversationSummary } from "../domain/task.ts";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Input, Key, matchesKey, wrapTextWithAnsi, truncateToWidth } from "@earendil-works/pi-tui";
import {
  FULL_SCREEN,
  coverViewport,
  activeText,
  inputField,
  conversationLabel,
  terminalText as clean,
} from "./screen.ts";

export interface Item {
  value: string;
  label: string;
  description?: string;
  fixed?: boolean;
  status?: ConversationSummary["status"];
}
interface PickerState {
  query: string;
  selected: string;
  marked: Set<string>;
}
export const pickerState = (): PickerState => ({ query: "", selected: "", marked: new Set() });
export class MemoryPicker {
  readonly input = new Input({ prompt: "", placeholder: "Type to search…" });
  private _focused = false;
  private scroll = 0;
  get focused() {
    return this._focused;
  }
  set focused(value: boolean) {
    this._focused = value;
    this.input.focused = value;
  }
  constructor(
    readonly title: string,
    readonly items: Item[],
    readonly state: PickerState,
    readonly theme: Theme,
    readonly kb: { matches(data: string, action: any): boolean },
    readonly finish: (value: string | null) => void,
    readonly refresh: () => void,
    readonly multi = false,
    public rows = 24,
  ) {
    this.input.setValue(state.query);
    this.ensureSelection();
  }
  filtered() {
    const terms = this.input.getValue().trim().toLowerCase().split(/\s+/).filter(Boolean);
    return this.items.filter(
      (item) =>
        item.fixed ||
        terms.every((term) =>
          `${item.label} ${item.status || ""} ${item.description || ""}`
            .toLowerCase()
            .includes(term),
        ),
    );
  }
  private ensureSelection() {
    const items = this.filtered();
    if (!items.some((i) => i.value === this.state.selected))
      this.state.selected = items.find((i) => !i.fixed)?.value || items[0]?.value || "";
  }
  handleInput(data: string) {
    const items = this.filtered();
    const index = Math.max(
      0,
      items.findIndex((i) => i.value === this.state.selected),
    );
    if (this.kb.matches(data, "tui.select.cancel")) {
      this.finish(null);
      return;
    }
    if (this.kb.matches(data, "tui.select.confirm")) {
      if (items.length) this.finish(this.state.selected);
      return;
    }
    if (this.kb.matches(data, "tui.select.up"))
      this.state.selected = items[(index - 1 + items.length) % items.length]?.value || "";
    else if (this.kb.matches(data, "tui.select.down"))
      this.state.selected = items[(index + 1) % items.length]?.value || "";
    else if (
      this.multi &&
      (matchesKey(data, Key.ctrl("space")) || (data === " " && !this.input.getValue())) &&
      !items[index]?.fixed
    ) {
      const value = items[index]?.value;
      if (value)
        this.state.marked.has(value)
          ? this.state.marked.delete(value)
          : this.state.marked.add(value);
    } else {
      this.input.handleInput(data);
      this.state.query = this.input.getValue();
      this.ensureSelection();
    }
    this.refresh();
  }
  render(width: number): string[] {
    width = Math.max(1, width);
    const inner = Math.max(1, width - 4),
      height = Math.max(1, this.rows);
    const accent = (s: string) => this.theme.fg("accent", s),
      dim = (s: string) => this.theme.fg("dim", s);
    const row = (s: string) => truncateToWidth(`  ${s}`, width);
    const items = this.filtered(),
      records = items.filter((item) => !item.fixed);
    const label = (item: Item) => {
      const mark =
        this.multi && !item.fixed ? (this.state.marked.has(item.value) ? "☑ " : "☐ ") : "";
      const title = item.status
        ? conversationLabel(this.theme, item.status, item.label)
        : clean(item.label);
      const text = `${item.value === this.state.selected ? "› " : "  "}${mark}${title}`;
      return row(item.value === this.state.selected ? activeText(this.theme, text) : text);
    };
    const header = [
      row(accent(this.theme.bold(clean(this.title)))),
      row(inputField(this.input, this.theme, inner, this._focused)),
      ...items.filter((item) => item.fixed).map(label),
      "",
    ];
    const footer = [
      row(
        dim(
          this.multi
            ? `${this.state.marked.size} selected · ${records.length} conversations`
            : `${records.length} items`,
        ),
      ),
      row(
        dim(
          this.multi
            ? inner < 65
              ? "↑↓ · Space Select · Enter · Esc"
              : "↑↓ Select · Ctrl+Space Mark · Enter Extract · Esc Back"
            : "↑↓ Select · Enter Open · Esc Back",
        ),
      ),
    ];
    const available = Math.max(0, height - header.length - footer.length);
    const count = Math.max(1, available - 2);
    const selectedIndex = records.findIndex((item) => item.value === this.state.selected);
    if (selectedIndex >= 0) {
      if (selectedIndex < this.scroll) this.scroll = selectedIndex;
      if (selectedIndex >= this.scroll + count) this.scroll = selectedIndex - count + 1;
    }
    this.scroll = Math.min(this.scroll, Math.max(0, records.length - count));
    const body = records.slice(this.scroll, this.scroll + count).map(label);
    if (!records.length)
      body.push(row(dim(this.input.getValue() ? "No matches" : "No records yet")));
    const description = records[selectedIndex]?.description;
    if (description) {
      while (body.length < Math.max(0, available - 2)) body.push("");
      body.push(
        ...wrapTextWithAnsi(dim(clean(description)), inner)
          .slice(0, 2)
          .map(row),
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
export async function select(
  ctx: ExtensionContext,
  title: string,
  options: string[],
  selected = "",
): Promise<string | undefined> {
  return (
    (await pick(
      ctx,
      title,
      options.map((value) => ({ value, label: value })),
      { ...pickerState(), selected },
    )) || undefined
  );
}

export async function pick(
  ctx: ExtensionContext,
  title: string,
  items: Item[],
  state = pickerState(),
  multi = false,
): Promise<string | null> {
  return ctx.ui.custom<string | null>((tui, theme, kb, done) => {
    const component = new MemoryPicker(
      title,
      items,
      state,
      theme,
      kb,
      done,
      () => tui.requestRender(),
      multi,
      tui.terminal.rows,
    );
    return {
      get focused() {
        return component.focused;
      },
      set focused(value: boolean) {
        component.focused = value;
      },
      render: (width: number) => {
        component.rows = tui.terminal.rows;
        return component.render(width);
      },
      handleInput: (data: string) => component.handleInput(data),
      invalidate: () => component.invalidate(),
    };
  }, FULL_SCREEN);
}
