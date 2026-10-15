import {
  TuiAltScreen,
  ProcessTerminal,
  getKeybindings,
  matchesKey,
  Key,
} from "@earendil-works/pi-tui";
import type { PanelContext, PanelComponent, PanelTheme } from "./context.ts";
const colors = { accent: 36, dim: 90, muted: 90, success: 32, warning: 33, error: 31, border: 90 };
const theme: PanelTheme = {
  fg: (color, text) => `\x1b[${colors[color]}m${text}\x1b[39m`,
  bg: (_color, text) => `\x1b[48;5;236m${text}\x1b[49m`,
  bold: (text) => `\x1b[1m${text}\x1b[22m`,
};
export async function withTerminal<T>(run: (context: PanelContext) => Promise<T>): Promise<T> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      "Personal Memory needs an interactive terminal. Open the same-window panel from a Claude session started with the personal-memory launcher.",
    );
  const tui = new TuiAltScreen(new ProcessTerminal(), true, undefined, { mouse: true });
  let current: PanelComponent | undefined;
  let cancel: (() => void) | undefined;
  const context: PanelContext = {
    ui: {
      custom: (factory, options) =>
        new Promise((resolve, reject) => {
          let complete = false;
          let overlay: ReturnType<typeof tui.showOverlay> | undefined;
          const finish = (value: any) => {
            if (complete) return;
            complete = true;
            current?.dispose?.();
            current = undefined;
            cancel = undefined;
            overlay?.hide();
            tui.requestRender(true);
            resolve(value);
          };
          try {
            current = factory(tui, theme, getKeybindings(), finish);
            overlay = tui.showOverlay(current, options?.overlayOptions);
            cancel = () => finish(null);
          } catch (error) {
            reject(error);
          }
        }),
    },
  };
  const unsubscribe = tui.addInputListener((data) => {
    if (matchesKey(data, Key.ctrl("c"))) {
      cancel?.();
      return { consume: true };
    }
    return undefined;
  });
  tui.start();
  try {
    return await run(context);
  } finally {
    current?.dispose?.();
    unsubscribe();
    tui.stop();
  }
}
