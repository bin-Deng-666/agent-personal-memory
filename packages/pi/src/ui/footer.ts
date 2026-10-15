import { isAbsolute, relative, resolve, sep } from "node:path";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import type {
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { terminalText } from "./screen.ts";

const statusKey = "personal-memory";
function tokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1000000).toFixed(1)}M`;
}
function align(left: string, right: string, width: number): string {
  // Reserve one visible column for the path even in a narrow terminal.
  right = truncateToWidth(right, Math.max(0, width - 3), "…");
  left = truncateToWidth(left, Math.max(0, width - visibleWidth(right) - (right ? 2 : 0)), "…");
  return left + " ".repeat(Math.max(0, width - visibleWidth(left) - visibleWidth(right))) + right;
}
function cwdLabel(cwd: string): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return terminalText(cwd);
  const child = relative(resolve(home), resolve(cwd));
  return terminalText(
    child === ""
      ? "~"
      : child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child)
        ? `~${sep}${child}`
        : cwd,
  );
}

// Use the public footer factory so host files and terminal rendering stay under Pi's control.
export function installMemoryFooter(
  ctx: ExtensionContext,
  getContext: () => ExtensionContext,
  getThinking: () => string,
  agentDir: string,
) {
  const settings = SettingsManager.create(ctx.cwd, agentDir);
  ctx.ui.setFooter((tui, theme, data) => {
    const footer = new MemoryFooter(getContext, theme, data, getThinking, () =>
      settings.getCompactionEnabled(),
    );
    const unsubscribe = data.onBranchChange(() => tui.requestRender());
    return {
      render: (width: number) => footer.render(width),
      invalidate: () => footer.invalidate(),
      dispose: unsubscribe,
    };
  });
  return () => settings.reload();
}

export class MemoryFooter {
  private usageKey = "";
  private usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    hit: undefined as number | undefined,
  };
  constructor(
    readonly context: () => ExtensionContext,
    readonly theme: Theme,
    readonly data: ReadonlyFooterDataProvider,
    readonly thinking: () => string,
    readonly autoCompact: () => boolean,
  ) {}
  invalidate() {
    this.usageKey = "";
  }
  render(width: number): string[] {
    width = Math.max(1, width);
    const ctx = this.context(),
      manager = ctx.sessionManager;
    const entries = manager.getEntries();
    const key = `${manager.getSessionId()}:${manager.getLeafId()}:${entries.length}`;
    if (key !== this.usageKey) {
      const totals: typeof this.usage = {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
        hit: undefined,
      };
      for (const entry of entries) {
        const usage =
          entry.type === "usage"
            ? entry.usage
            : entry.type === "message" &&
                (entry.message.role === "assistant" || entry.message.role === "toolResult")
              ? entry.message.usage
              : entry.type === "compaction" || entry.type === "branch_summary"
                ? entry.usage
                : undefined;
        if (!usage) continue;
        totals.input += usage.input;
        totals.output += usage.output;
        totals.cacheRead += usage.cacheRead;
        totals.cacheWrite += usage.cacheWrite;
        totals.cost += usage.cost.total;
        if (entry.type === "message" && entry.message.role === "assistant") {
          const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
          totals.hit = prompt ? (usage.cacheRead / prompt) * 100 : undefined;
        }
      }
      this.usage = totals;
      this.usageKey = key;
    }
    const dim = (text: string) => this.theme.fg("dim", text);
    const branch = this.data.getGitBranch(),
      sessionName = manager.getSessionName();
    const path =
      cwdLabel(manager.getCwd()) +
      (branch ? ` (${terminalText(branch)})` : "") +
      (sessionName ? ` • ${terminalText(sessionName)}` : "");
    const statuses = this.data.getExtensionStatuses();
    const memory = statuses.get(statusKey) || "";
    const lines = [align(dim(path), memory, width)];
    const parts: string[] = [];
    const total = this.usage;
    if (total.input) parts.push(`↑${tokens(total.input)}`);
    if (total.output) parts.push(`↓${tokens(total.output)}`);
    if (total.cacheRead) parts.push(`R${tokens(total.cacheRead)}`);
    if (total.cacheWrite) parts.push(`W${tokens(total.cacheWrite)}`);
    if ((total.cacheRead || total.cacheWrite) && total.hit !== undefined)
      parts.push(`CH${total.hit.toFixed(1)}%`);
    if (total.cost) parts.push(`$${total.cost.toFixed(3)}`);
    const usage = ctx.getContextUsage();
    const context = `${usage?.percent === null ? "?" : (usage?.percent ?? 0).toFixed(1) + "%"}/${tokens(usage?.contextWindow ?? ctx.model?.contextWindow ?? 0)}${this.autoCompact() ? " (auto)" : ""}`;
    parts.push(
      (usage?.percent ?? 0) > 90
        ? this.theme.fg("error", context)
        : (usage?.percent ?? 0) > 70
          ? this.theme.fg("warning", context)
          : context,
    );
    let model = ctx.model?.id || "no-model";
    if (ctx.model?.reasoning)
      model += ` • ${this.thinking() === "off" ? "thinking off" : this.thinking()}`;
    if (ctx.model && this.data.getAvailableProviderCount() > 1) {
      const withProvider = `(${ctx.model.provider}) ${model}`;
      if (visibleWidth(parts.join(" ")) + 2 + visibleWidth(withProvider) <= width)
        model = withProvider;
    }
    const left = truncateToWidth(parts.join(" "), width);
    const available = Math.max(0, width - visibleWidth(left) - 2);
    const right = truncateToWidth(terminalText(model), available, "");
    lines.push(
      dim(left) +
        " ".repeat(Math.max(0, width - visibleWidth(left) - visibleWidth(right))) +
        dim(right),
    );
    const others = [...statuses]
      .filter(([key]) => key !== statusKey)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, text]) => text.replace(/[\r\n\t]/g, " ").trim());
    if (others.length) lines.push(truncateToWidth(others.join(" "), width));
    return lines;
  }
}
