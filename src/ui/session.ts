import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import { FULL_SCREEN } from "./screen.ts";

/** What this host needs from a screen; the shape `ctx.ui.custom` already returns. */
interface Screen {
  render(width: number): string[];
  invalidate?(): void;
  handleInput?(data: string): void;
  handleMouse?(event: TuiMouseEvent): TuiMouseEventResult | undefined;
  dispose?(): void;
  focused?: boolean;
}
type CustomFactory = Parameters<ExtensionContext["ui"]["custom"]>[0];
type Tui = Parameters<CustomFactory>[0];
type Theme = Parameters<CustomFactory>[1];
type Keybindings = Parameters<CustomFactory>[2];
type Factory<T> = (
  tui: Tui,
  theme: Theme,
  keybindings: Keybindings,
  done: (value: T) => void,
) => Screen;

/** Drop-in replacement for `ctx.ui.custom`, valid inside `withScreenSession`. */
export type CustomShow = <T>(factory: Factory<T>, options?: unknown) => Promise<T>;

/**
 * Run a multi-step workflow inside ONE overlay.
 *
 * Pi hides an overlay the moment its component calls the completion callback, and
 * the panel used to open a fresh overlay for every step: dashboard, then a preview,
 * then the dashboard again. Each hand-off therefore left a window in which no
 * overlay existed and the terminal drew the conversation underneath. Measured on
 * the delete path, that window held the whole write — six files with fsync, about
 * 38 ms — which is long enough to see.
 *
 * Here the overlay is opened once and `show` swaps the screen inside it. The stack
 * exists because screens nest: a preview opens from the library, which opened from
 * the dashboard. A step that finishes pops back to the screen below it, and only
 * the end of `body` closes the overlay.
 *
 * Screens are mounted eagerly and render only while on top, so a covered screen
 * keeps its state without painting over the one above it.
 */
export async function withScreenSession<T>(
  ctx: ExtensionContext,
  body: (show: CustomShow) => Promise<T>,
): Promise<T> {
  let failure: unknown;
  let closed = false;
  const result = await ctx.ui.custom<T | undefined>((tui, theme, kb, done) => {
    const stack: { screen: Screen; resolve: (value: unknown) => void }[] = [];
    const show: CustomShow = <R>(factory: Factory<R>) =>
      new Promise<R>((resolve) => {
        let screen: Screen;
        const finish = (value: R) => {
          const index = stack.findIndex((entry) => entry.screen === screen);
          if (index >= 0) stack.splice(index, 1);
          // A screen that reported its result is done, even though the overlay
          // stays open for the next step. Without this its timers keep running:
          // the dashboard polls once a second, the task viewer twice.
          screen.dispose?.();
          resolve(value);
          tui.requestRender();
        };
        screen = factory(tui, theme, kb, finish);
        stack.push({ screen, resolve: resolve as (value: unknown) => void });
        tui.requestRender();
      });
    void body(show).then(
      (value) => {
        if (closed) return;
        closed = true;
        done(value);
      },
      (error) => {
        failure = error;
        if (closed) return;
        closed = true;
        done(undefined);
      },
    );
    return {
      get focused() {
        return stack.at(-1)?.screen.focused ?? false;
      },
      set focused(value: boolean) {
        const top = stack.at(-1)?.screen;
        if (top) top.focused = value;
      },
      render: (width: number) => stack.at(-1)?.screen.render(width) ?? [],
      invalidate: () => stack.at(-1)?.screen.invalidate?.(),
      handleInput: (data: string) => stack.at(-1)?.screen.handleInput?.(data),
      handleMouse: (event: TuiMouseEvent) => stack.at(-1)?.screen.handleMouse?.(event),
      dispose: () => {
        for (const entry of stack.splice(0)) entry.screen.dispose?.();
      },
    };
  }, FULL_SCREEN);
  if (failure) throw failure;
  return result as T;
}
