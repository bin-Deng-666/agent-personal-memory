import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { MemoryStore } from "../storage/store.ts";
import type { OrganizationGroup } from "../domain/organization.ts";
import { TYPE_LABELS } from "../domain/memory.ts";
import { planOrganization } from "../agents/organization.ts";
import { FULL_SCREEN, coverViewport, terminalText } from "../ui/screen.ts";
import { preview } from "../ui/preview.ts";

export async function organizeLibrary(
  ctx: ExtensionContext,
  store: MemoryStore,
  onChanged: () => Promise<void>,
) {
  const memories = (await store.read()).memories;
  if (!memories.length) throw new Error("The library is empty; nothing to organize");
  type Result = { groups?: OrganizationGroup[]; error?: string } | null;
  const result = await ctx.ui.custom<Result>((tui, theme, kb, done) => {
    const controller = new AbortController();
    let closed = false;
    const finish = (result: Result) => {
      if (!closed) {
        closed = true;
        done(result);
      }
    };
    void planOrganization(ctx, memories, controller.signal).then(
      (groups) => finish({ groups }),
      (error) => finish({ error: error instanceof Error ? error.message : String(error) }),
    );
    return {
      render: (width: number) =>
        coverViewport(
          [
            "",
            `  ${theme.fg("accent", theme.bold("Organize all memories"))}`,
            "",
            `  Reviewing ${memories.length} memories for overlap, clarity and personal value…`,
            "  No changes have been saved. Esc cancels.",
          ],
          width,
          tui.terminal.rows,
        ),
      invalidate() {},
      handleInput: (data: string) => {
        if (kb.matches(data, "tui.select.cancel")) {
          controller.abort();
          finish(null);
        }
      },
      dispose: () => {
        closed = true;
        controller.abort();
      },
    };
  }, FULL_SCREEN);
  if (!result) return;
  if (result.error) throw new Error(result.error);
  const groups = result.groups!;
  const changed = groups.filter((group) => {
    const old = memories.find((memory) => memory.id === group.ids[0])!;
    return (
      group.ids.length > 1 ||
      ["title", "content", "type", "scope", "certainty", "tags"].some(
        (key) =>
          JSON.stringify(old[key as keyof typeof old]) !==
          JSON.stringify(group[key as keyof OrganizationGroup]),
      )
    );
  });
  const text = [
    `${memories.length} memories → ${groups.length} memories · ${memories.length - groups.length} redundant entries merged`,
    "All original quotes and dates are retained. Different facts and conditions should remain distinct.",
    ...changed.map((group, i) => {
      const originals = group.ids.map((id) => memories.find((memory) => memory.id === id)!);
      return `\n${i + 1}. ${group.ids.length > 1 ? "Merge" : "Refine"} · ${group.title}\n\nBefore:\n${originals.map((old) => `[${TYPE_LABELS[old.type]}] ${old.title}\n${old.content}`).join("\n\n")}\n\nAfter: [${TYPE_LABELS[group.type as keyof typeof TYPE_LABELS]}] ${group.title}\n${group.content}\nScope: ${group.scope}\nCertainty: ${group.certainty}\nReason: ${group.reason}`;
    }),
  ].join("\n\n");
  const choice = await preview(
    ctx,
    "Organization preview",
    terminalText(changed.length ? text : "No redundant memories or wording changes found."),
    changed.length
      ? [
          { value: "apply", label: "Apply organization" },
          { value: "back", label: "Cancel" },
        ]
      : [{ value: "back", label: "Back" }],
  );
  if (choice !== "apply") return;
  await store.organize(memories, groups);
  await onChanged();
  await preview(
    ctx,
    "Library organized",
    `${memories.length} memories → ${groups.length} memories. Original evidence retained.`,
    [{ value: "back", label: "Back" }],
  );
}
