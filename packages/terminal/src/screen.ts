import type { ConversationSummary } from "../../core/src/domain/task.ts";
import type { PanelTheme as Theme } from "./context.ts";
import { Input, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export function inputField(
  input: Input,
  theme: Theme,
  width: number,
  focused: boolean,
  name = "Search",
): string {
  const label = theme.fg(focused ? "accent" : "dim", `${focused ? "›" : " "} ${name}`);
  const separator = theme.fg("dim", " │ ");
  const content = input.render(Math.max(1, width - visibleWidth(label) - 3))[0] || "";
  return label + separator + (focused ? activeText(theme, content) : content);
}

export function activeText(theme: Theme, text: string): string {
  const highlighted = theme.fg("accent", theme.bold(text));
  return typeof theme.bg === "function" ? theme.bg("selectedBg", highlighted) : highlighted;
}

export function conversationLabel(
  theme: Theme,
  status: ConversationSummary["status"],
  title: string,
): string {
  const styles = {
    "Not extracted": { color: "accent", icon: "○" },
    Extracted: { color: "success", icon: "✓" },
    Updated: { color: "warning", icon: "↻" },
  } as const;
  const style = styles[status];
  return `${theme.fg(style.color, `${style.icon} ${status}`)}  ${terminalText(title)}`;
}

export const FULL_SCREEN = {
  overlay: true,
  overlayOptions: { width: "100%", maxHeight: "100%", anchor: "top-left", margin: 0 },
} as const;

export const silentTool = () => ({ render: (_width: number): string[] => [], invalidate() {} });

export const terminalText = (text: string) =>
  text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");

// Fill every cell, including blank rows, so no parent transcript/footer shows through.
export function coverViewport(lines: string[], width: number, height: number): string[] {
  width = Math.max(1, width);
  height = Math.max(1, height);
  return Array.from({ length: height }, (_, i) => {
    const line = truncateToWidth(lines[i] || "", width);
    return line + " ".repeat(Math.max(0, width - visibleWidth(line)));
  });
}
