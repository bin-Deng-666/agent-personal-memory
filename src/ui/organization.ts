import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Memory } from "../domain/memory.ts";
import { TYPE_LABELS, CERTAINTY_LABELS } from "../domain/memory.ts";
import { completeOrganization, organizationChanged } from "../domain/organization.ts";
import type { OrganizationGroup, OrganizationPlan } from "../domain/organization.ts";
import { pick, pickerState } from "./picker.ts";
import { preview } from "./preview.ts";

function fields(
  memory: Pick<Memory, "title" | "content" | "type" | "scope" | "certainty" | "tags">,
) {
  return [
    `Title: ${memory.title}`,
    `Type: ${TYPE_LABELS[memory.type]}`,
    `Content: ${memory.content}`,
    `Scope: ${memory.scope || "(none)"}`,
    `Certainty: ${CERTAINTY_LABELS[memory.certainty]}`,
    `Tags: ${memory.tags.join(", ") || "(none)"}`,
  ].join("\n");
}

export function organizationDetail(group: OrganizationGroup, memories: Memory[]) {
  const originals = memories.filter((memory) => group.ids.includes(memory.id));
  return [
    `${group.ids.length > 1 ? "Merge" : "Refine"} · ${group.title}`,
    "Before",
    ...originals.map((memory) =>
      [
        fields(memory),
        `Created: ${memory.createdAt} · Updated: ${memory.updatedAt}`,
        "Original words (message dates are not necessarily event dates):",
        ...memory.sources.map(
          (source) => `${source.timestamp} · ${source.entryId}\n${source.quote}`,
        ),
      ].join("\n\n"),
    ),
    `After\n\n${fields(group)}`,
    `Reason: ${group.reason}`,
    "All original quotes and source dates will be retained. Other records stay unchanged.",
  ].join("\n\n");
}

/** Reuses the Library's search/list and detail navigation; no writes happen in UI. */
export async function reviewOrganization(
  ctx: ExtensionContext,
  memories: Memory[],
  plan: OrganizationPlan,
): Promise<OrganizationGroup[] | null> {
  const changes = plan.groups.filter((group) => organizationChanged(group, memories));
  const filtered = plan.filtered.length
    ? `\n\n${plan.filtered.length} suggestions were filtered out; their original records remain unchanged.\n${plan.filtered.map((item) => `${item.title}: ${item.reason}`).join("\n")}`
    : "";
  if (!changes.length) {
    await preview(
      ctx,
      "Organization review",
      `No verified changes to apply. No memories changed.${filtered}`,
      [{ value: "back", label: "Back" }],
    );
    return null;
  }
  const included = new Set(changes.map((_, index) => index));
  const state = pickerState();
  for (;;) {
    const choice = await pick(
      ctx,
      "Organization review · open a suggestion to inspect or exclude",
      [
        {
          value: "apply",
          label: `Review & apply selected (${included.size}/${changes.length})`,
          fixed: true,
        },
        { value: "cancel", label: "Cancel without saving", fixed: true },
        ...changes.map((group, index) => ({
          value: String(index),
          label: `${included.has(index) ? "✓ Included" : "○ Excluded"} · ${group.ids.length > 1 ? `Merge ${group.ids.length}` : "Refine"} · ${group.title}`,
          description: group.reason,
        })),
      ],
      state,
    );
    if (!choice || choice === "cancel") return null;
    if (choice === "apply") {
      const selected = changes.filter((_, index) => included.has(index));
      if (!selected.length) {
        await preview(
          ctx,
          "Nothing selected",
          "Include at least one suggestion, or cancel without saving.",
          [{ value: "back", label: "Back" }],
        );
        continue;
      }
      let groups: OrganizationGroup[];
      try {
        groups = completeOrganization(memories, selected);
      } catch {
        await preview(
          ctx,
          "Selected changes conflict",
          "This selection would create duplicate records. Review the related suggestions together or exclude them. No memories changed.",
          [{ value: "back", label: "Back" }],
        );
        continue;
      }
      const choice = await preview(
        ctx,
        "Apply selected organization?",
        [
          `${memories.length} memories → ${groups.length} memories · ${selected.length} selected changes`,
          "Only the selected groups will change. Excluded suggestions retain their original records and versions.",
          ...selected.map((group) => organizationDetail(group, memories)),
          filtered,
          "The complete library is checked again before saving. Concurrent edits reject this plan.",
        ].join("\n\n"),
        [
          { value: "back", label: "Back to review" },
          { value: "apply", label: "Apply organization" },
        ],
      );
      if (choice === "apply") return groups;
      continue;
    }
    const index = Number(choice);
    const group = changes[index];
    const action = await preview(
      ctx,
      `Suggestion ${index + 1}/${changes.length}`,
      organizationDetail(group, memories),
      [
        { value: "back", label: "Back to suggestions" },
        {
          value: "toggle",
          label: included.has(index) ? "Exclude this change" : "Include this change",
        },
      ],
    );
    if (action === "toggle") included.has(index) ? included.delete(index) : included.add(index);
  }
}
