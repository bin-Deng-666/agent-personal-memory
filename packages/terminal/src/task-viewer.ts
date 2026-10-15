import type { PanelContext as ExtensionContext } from "./context.ts";
import { Key, matchesKey, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { ExtractionTask } from "../../core/src/domain/task.ts";
import { TASK_LABELS } from "../../core/src/domain/task.ts";
import { FULL_SCREEN, coverViewport, activeText, terminalText } from "./screen.ts";

export async function taskViewer(
  ctx: ExtensionContext,
  load: () => Promise<{ task: ExtractionTask; log: string }>,
): Promise<string | null> {
  let data = await load();
  return ctx.ui.custom<string | null>((tui, theme, kb, done) => {
    let disposed = false;
    let loading = false;
    let index = 0;
    let offset = 0;
    let showLog = false;
    const choices = () => [
      ...(data.task.applied
        ? [{ value: "memories", label: `Memories (${data.task.applied})` }]
        : []),
      { value: "log", label: showLog ? "Summary" : "View log" },
      ...(data.task.phase === "running" ? [{ value: "cancel", label: "Cancel" }] : []),
      ...(["failed", "cancelled"].includes(data.task.phase)
        ? [{ value: "retry", label: "Retry" }]
        : []),
      { value: "back", label: "Back" },
    ];
    const timer = setInterval(() => {
      if (disposed || loading) return;
      loading = true;
      load()
        .then((next) => {
          if (!disposed) {
            const selected = choices()[index].value;
            data = next;
            index = choices().findIndex((choice) => choice.value === selected);
            if (index < 0) index = choices().length - 1;
            tui.requestRender();
          }
        })
        .catch(() => {})
        .finally(() => {
          loading = false;
        });
    }, 500);
    return {
      render(width: number) {
        const inner = Math.max(1, width - 4);
        const height = Math.max(1, tui.terminal.rows);
        const header = [
          "",
          `  ${theme.fg("accent", theme.bold(terminalText(data.task.name)))}`,
          `  ${theme.fg("dim", `${TASK_LABELS[data.task.phase]} · ${data.task.applied || 0} saved`)}`,
          "",
        ];
        const summary = [
          data.task.progress,
          ...(data.task.quality
            ? [
                "",
                `${data.task.quality.reviewed} checked · ${data.task.quality.filtered} filtered · ${data.task.quality.duplicates} duplicates`,
              ]
            : []),
          ...(data.task.error ? ["", data.task.error] : []),
        ];
        const body = (
          showLog ? terminalText(data.log).split("\n") : summary.map(terminalText)
        ).flatMap((line) => (line ? wrapTextWithAnsi(line, inner) : [""]));
        const room = Math.max(0, height - header.length - 3);
        offset = Math.min(offset, Math.max(0, body.length - room));
        let toolbar = `  ${choices()
          .map((choice, i) =>
            i === index
              ? activeText(theme, `[${choice.label}]`)
              : theme.fg("dim", ` ${choice.label} `),
          )
          .join("  ")}`;
        if (visibleWidth(toolbar) > width)
          toolbar = `  ${activeText(theme, `[${choices()[index].label}]`)} ${index + 1}/${choices().length}`;
        return coverViewport(
          [
            ...header,
            ...Array.from({ length: room }, (_, i) => `  ${body[offset + i] || ""}`),
            toolbar,
            `  ${theme.fg("dim", "←→ Action · Enter · Esc Back")}`,
            "",
          ],
          width,
          height,
        );
      },
      invalidate() {},
      handleInput(key: string) {
        if (kb.matches(key, "tui.select.cancel")) {
          done(null);
          return;
        }
        if (kb.matches(key, "tui.select.confirm")) {
          const value = choices()[index].value;
          if (value === "log") {
            showLog = !showLog;
            offset = 0;
            tui.requestRender();
          } else done(value);
          return;
        }
        if (matchesKey(key, Key.left) || kb.matches(key, "tui.select.up"))
          index = (index - 1 + choices().length) % choices().length;
        else if (matchesKey(key, Key.right) || kb.matches(key, "tui.select.down"))
          index = (index + 1) % choices().length;
        else if (matchesKey(key, Key.pageUp)) offset = Math.max(0, offset - 8);
        else if (matchesKey(key, Key.pageDown)) offset += 8;
        tui.requestRender();
      },
      dispose() {
        disposed = true;
        clearInterval(timer);
        tui.requestRender(true);
      },
    };
  }, FULL_SCREEN);
}
