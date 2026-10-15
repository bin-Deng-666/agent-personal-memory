import type { Component, OverlayOptions, TUI } from "@earendil-works/pi-tui";
export interface PanelTheme {
  fg(
    color: "accent" | "dim" | "muted" | "success" | "warning" | "error" | "border",
    text: string,
  ): string;
  bg(color: "selectedBg", text: string): string;
  bold(text: string): string;
}
export interface PanelKeys {
  matches(data: string, action: any): boolean;
}
export type PanelComponent = Component & { focused?: boolean; dispose?(): void };
export interface PanelContext {
  ui: {
    custom<T>(
      factory: (
        tui: TUI,
        theme: PanelTheme,
        keys: PanelKeys,
        done: (value: T) => void,
      ) => PanelComponent,
      options?: { overlay?: boolean; overlayOptions?: OverlayOptions },
    ): Promise<T>;
  };
}
