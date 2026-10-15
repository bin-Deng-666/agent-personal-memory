import type { PanelContext as ExtensionContext } from "./context.ts";
import {
  Key,
  matchesKey,
  visibleWidth,
  truncateToWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";
import type { Item } from "./picker.ts";
import { FULL_SCREEN, coverViewport, activeText, terminalText } from "./screen.ts";

export async function preview(
  ctx: ExtensionContext,
  title: string,
  text: string,
  options: Item[],
): Promise<string | null> {
  return ctx.ui.custom<string | null>((tui, theme, kb, done) => {
    let index = 0;
    let offset = 0;
    let buttons: { x: number; width: number; index: number }[] = [];
    let actionY = 0;
    return {
      render(width: number) {
        const inner = Math.max(1, width - 4);
        const height = Math.max(1, tui.terminal.rows);
        const header = ["", `  ${theme.fg("accent", theme.bold(terminalText(title)))}`, ""];
        const body = terminalText(text)
          .split("\n")
          .flatMap((line) => (line ? wrapTextWithAnsi(line, inner) : [""]));
        const room = Math.max(0, height - header.length - 3);
        offset = Math.max(0, Math.min(offset, Math.max(0, body.length - room)));
        let toolbar = "  ";
        buttons = [];
        actionY = height - 3;
        options.forEach((option, i) => {
          const label = ` ${terminalText(option.label)} `;
          const x = visibleWidth(toolbar);
          buttons.push({ x, width: visibleWidth(label), index: i });
          toolbar +=
            (i === index ? activeText(theme, `[${label.trim()}]`) : theme.fg("dim", label)) + "  ";
        });
        if (visibleWidth(toolbar) > width) {
          toolbar = `  ${activeText(theme, `[${options[index]?.label || "Back"}]`)}  ${index + 1}/${options.length}`;
          buttons = [];
        }
        const footer = [
          toolbar,
          `  ${theme.fg("dim", inner < 50 ? "←→ Action · Enter · Esc Back" : "←→ Action · Enter Select · PgUp/PgDn Read · Esc Back")}`,
          "",
        ];
        return coverViewport(
          [
            ...header,
            ...Array.from({ length: room }, (_, i) => `  ${body[offset + i] || ""}`),
            ...footer,
          ].map((line) => truncateToWidth(line, width)),
          width,
          height,
        );
      },
      invalidate() {},
      handleInput(data: string) {
        if (kb.matches(data, "tui.select.cancel")) {
          done(null);
          return;
        }
        if (kb.matches(data, "tui.select.confirm")) {
          done(options[index]?.value || null);
          return;
        }
        if (matchesKey(data, Key.left) || kb.matches(data, "tui.select.up"))
          index = (index - 1 + options.length) % options.length;
        else if (matchesKey(data, Key.right) || kb.matches(data, "tui.select.down"))
          index = (index + 1) % options.length;
        else if (matchesKey(data, Key.pageUp)) offset = Math.max(0, offset - 8);
        else if (matchesKey(data, Key.pageDown)) offset += 8;
        tui.requestRender();
      },
      handleMouse(event: TuiMouseEvent) {
        if (event.type === "wheel") {
          offset = Math.max(0, offset + (event.wheelDelta || 0));
          tui.requestRender();
          return { handled: true };
        }
        if (event.type === "click" && event.button === "left" && event.y === actionY) {
          const button = buttons.find((b) => event.x >= b.x && event.x < b.x + b.width);
          if (button) {
            index = button.index;
            done(options[index].value);
            return { handled: true };
          }
        }
      },
    };
  }, FULL_SCREEN);
}
