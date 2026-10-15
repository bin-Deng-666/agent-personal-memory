import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Editor } from "@earendil-works/pi-tui";
import { FULL_SCREEN, coverViewport } from "./screen.ts";
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
