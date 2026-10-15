import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import {
  TYPES,
  TYPE_LABELS,
  CERTAINTY_LABELS,
  createProposal,
  memoryFields,
} from "../domain/memory.ts";
import type { Memory } from "../domain/memory.ts";
import type { MemoryStore } from "../storage/store.ts";
import { pick, select } from "../ui/picker.ts";
import { preview } from "../ui/preview.ts";
import { chooseMemoryField, editText } from "../ui/editor.ts";

export function createLibrary(
  ctx: ExtensionContext,
  store: MemoryStore,
  onChanged: () => Promise<void>,
) {
  async function open(id: string) {
    let error = "";
    for (;;) {
      const memory = (await store.read()).memories.find((m) => m.id === id);
      if (!memory) return;
      const summary = `${TYPE_LABELS[memory.type]} · ${CERTAINTY_LABELS[memory.certainty]}\n\n${memory.content}${memory.scope ? `\n\nApplies to: ${memory.scope}` : ""}`;
      const choice = await preview(ctx, memory.title, error ? `${error}\n\n${summary}` : summary, [
        { value: "edit", label: "Edit" },
        { value: "source", label: "Original words" },
        { value: "delete", label: "Delete" },
        { value: "back", label: "Back" },
      ]);
      if (!choice || choice === "back") return;
      if (choice === "source") {
        const source = memory.sources
          .map((s) => `Said on ${s.timestamp.slice(0, 10) || "unknown date"}\n\n“${s.quote}”`)
          .join("\n\n");
        await preview(ctx, "Original words", source || "No conversation source", [
          { value: "back", label: "Back" },
        ]);
        continue;
      }
      let action = choice;
      if (choice === "edit") {
        const field = await chooseMemoryField(ctx, memory);
        if (!field) continue;
        action = field;
      }
      const proposal = createProposal({
        ...memoryFields(memory),
        action: action === "delete" ? "delete" : "update",
        targetId: memory.id,
        targetVersion: memory.version,
      });
      if (action === "content") {
        const text = await editText(ctx, "Edit memory", proposal.content);
        if (text === undefined || !text.trim()) continue;
        proposal.content = text.trim();
      } else if (action === "type") {
        const type = await select(
          ctx,
          "Memory type",
          TYPES.map((t) => TYPE_LABELS[t]),
          TYPE_LABELS[memory.type],
        );
        if (!type) continue;
        proposal.type = TYPES.find((t) => TYPE_LABELS[t] === type)!;
      }
      try {
        await withFileMutationQueue(store.file, () => store.apply(proposal));
        await onChanged();
        error = "";
        if (proposal.action === "delete") return;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
  }
  async function show(memories: Memory[]) {
    const selected = await pick(
      ctx,
      `Saved memories · ${memories.length}`,
      memories.map((m) => ({
        value: m.id,
        label: m.title,
        description: `${TYPE_LABELS[m.type]}\n${m.content}`,
      })),
    );
    if (selected) await open(selected);
  }
  return { open, show };
}
