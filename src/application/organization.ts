import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { MemoryStore } from "../storage/store.ts";
import type { OrganizationPlan } from "../domain/organization.ts";
import { planOrganization } from "../agents/organization.ts";
import { FULL_SCREEN, coverViewport, terminalText } from "../ui/screen.ts";
import { preview } from "../ui/preview.ts";
import { reviewOrganization } from "../ui/organization.ts";

export async function organizeLibrary(
  ctx: ExtensionContext,
  store: MemoryStore,
  onChanged: () => Promise<void>,
) {
  const memories = (await store.read()).memories;
  if (!memories.length) throw new Error("The library is empty; nothing to organize");
  type Result = { plan?: OrganizationPlan; error?: string } | null;
  const result = await ctx.ui.custom<Result>((tui, theme, kb, done) => {
    const controller = new AbortController();
    let closed = false;
    let status = `Reviewing ${memories.length} memories for necessary changes…`;
    const finish = (result: Result) => {
      if (!closed) {
        closed = true;
        done(result);
      }
    };
    void planOrganization(ctx, memories, controller.signal, (text) => {
      if (closed) return;
      status = text;
      tui.requestRender();
    }).then(
      (plan) => finish({ plan }),
      (error) => finish({ error: error instanceof Error ? error.message : String(error) }),
    );
    return {
      render: (width: number) =>
        coverViewport(
          [
            "",
            `  ${theme.fg("accent", theme.bold("Organize all memories"))}`,
            "",
            `  ${terminalText(status)}`,
            "  Analysis → independent review → select changes → apply",
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
  const groups = await reviewOrganization(ctx, memories, result.plan!);
  if (!groups) return;
  await store.organize(memories, groups);
  await onChanged();
  await preview(
    ctx,
    "Library organized",
    `${memories.length} memories → ${groups.length} memories. Selected changes applied; original evidence retained.`,
    [{ value: "back", label: "Back" }],
  );
}
