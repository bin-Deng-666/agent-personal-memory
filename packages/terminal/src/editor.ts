import type { PanelContext as ExtensionContext } from "./context.ts";
import {
  Editor,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { Memory } from "../../core/src/domain/memory.ts";
import { TYPE_LABELS } from "../../core/src/domain/memory.ts";
import { FULL_SCREEN, activeText, coverViewport, terminalText } from "./screen.ts";

export async function chooseMemoryField(
  ctx: ExtensionContext,
  memory: Memory,
): Promise<"content" | "type" | null> {
  return ctx.ui.custom((tui, theme, kb, done) => {
    const fields = ["content", "type"] as const;
    let index = 0;
    let offset = 0;
    return {
      render(width: number) {
        const inner = Math.max(1, width - 4);
        const height = tui.terminal.rows;
        const wide = inner >= 60;
        const leftWidth = wide ? 18 : inner;
        const previewWidth = Math.max(1, wide ? inner - leftWidth - 3 : inner);
        const current = index === 0 ? memory.content : TYPE_LABELS[memory.type];
        const preview = [
          `Current ${fields[index]}`,
          "",
          ...terminalText(current)
            .split("\n")
            .flatMap((line) => (line ? wrapTextWithAnsi(line, previewWidth) : [""])),
        ];
        const room = Math.max(0, height - (wide ? 6 : 11));
        offset = Math.min(offset, Math.max(0, preview.length - room));
        const menu = ["Content", "Type"].flatMap((label, i) => {
          const text = truncateToWidth(`${i === index ? "›" : " "} ${label}`, leftWidth);
          const padded = text + " ".repeat(Math.max(0, leftWidth - visibleWidth(text)));
          return [i === index ? activeText(theme, padded) : padded, ""];
        });
        const lines = ["", `  ${theme.fg("accent", theme.bold("Edit memory"))}`, ""];
        if (wide) {
          for (let i = 0; i < room; i++)
            lines.push(
              `  ${menu[i] || " ".repeat(leftWidth)}   ${i + offset === 0 ? theme.fg("dim", preview[0]) : preview[i + offset] || ""}`,
            );
        } else {
          lines.push(...menu.map((line) => `  ${line}`), "");
          for (let i = 0; i < room; i++) lines.push(`  ${preview[i + offset] || ""}`);
        }
        while (lines.length < height - 2) lines.push("");
        lines.push(`  ${theme.fg("dim", "↑↓ Select · Enter Edit · Esc Back")}`, "");
        return coverViewport(lines, width, height);
      },
      handleInput(data: string) {
        if (kb.matches(data, "tui.select.cancel")) {
          done(null);
          return;
        }
        if (kb.matches(data, "tui.select.confirm")) {
          done(fields[index]);
          return;
        }
        if (kb.matches(data, "tui.select.up")) {
          index = Math.max(0, index - 1);
          offset = 0;
        } else if (kb.matches(data, "tui.select.down")) {
          index = Math.min(fields.length - 1, index + 1);
          offset = 0;
        } else if (matchesKey(data, Key.pageUp)) offset = Math.max(0, offset - 6);
        else if (matchesKey(data, Key.pageDown)) offset += 6;
        tui.requestRender();
      },
      invalidate() {},
    };
  }, FULL_SCREEN);
}

export async function editText(
  ctx: ExtensionContext,
  title: string,
  prefill: string,
): Promise<string | undefined> {
  return ctx.ui.custom<string | undefined>((tui, theme, kb, done) => {
    const editor = new Editor(tui, {
      borderColor: (text) => theme.fg("border", text),
      selectList: {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", text),
        description: (text) => theme.fg("muted", text),
        scrollInfo: (text) => theme.fg("dim", text),
        noMatch: (text) => theme.fg("warning", text),
      },
    });
    editor.setText(prefill);
    editor.onSubmit = done;
    return {
      get focused() {
        return editor.focused;
      },
      set focused(value: boolean) {
        editor.focused = value;
      },
      render(width: number) {
        return coverViewport(
          [
            "",
            theme.fg("accent", theme.bold(`✏️ ${title}`)),
            "",
            ...editor.render(width),
            "",
            theme.fg("dim", "Enter Save · Shift+Enter New line · Esc Cancel"),
          ],
          width,
          tui.terminal.rows,
        );
      },
      handleInput(data: string) {
        if (kb.matches(data, "tui.select.cancel")) done(undefined);
        else {
          editor.handleInput(data);
          tui.requestRender();
        }
      },
      invalidate() {
        editor.invalidate();
      },
    };
  }, FULL_SCREEN);
}
