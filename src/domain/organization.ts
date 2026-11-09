import { Type } from "typebox";
import { Check } from "typebox/value";
import {
  TYPES,
  CERTAINTY_LABELS,
  createProposal,
  validateProposal,
  memoryFields,
  normalize,
} from "./memory.ts";
import { validatePersonalEvidence } from "./evidence.ts";
import { reviewItemProperties, validateBaseReview, personalReviewSupported } from "./extraction.ts";
import type { BaseReviewOutput } from "./extraction.ts";
import type { Memory, State } from "./memory.ts";

const groupSchema = Type.Object(
  {
    ids: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, uniqueItems: true }),
    title: Type.String({ minLength: 1, maxLength: 160 }),
    content: Type.String({ minLength: 1, maxLength: 6000 }),
    type: Type.Union(TYPES.map((value) => Type.Literal(value))),
    scope: Type.String({ maxLength: 2000 }),
    certainty: Type.Union(
      (Object.keys(CERTAINTY_LABELS) as (keyof typeof CERTAINTY_LABELS)[]).map((value) =>
        Type.Literal(value),
      ),
    ),
    tags: Type.Array(Type.String({ maxLength: 100 }), { maxItems: 12 }),
    reason: Type.String({ minLength: 1, maxLength: 2000 }),
  },
  { additionalProperties: false },
);
export const organizationSchema = Type.Object(
  { groups: Type.Array(groupSchema) },
  { additionalProperties: false },
);
/** The model submits edits only; code carries untouched records forward. */
export const organizationChangesSchema = Type.Object(
  { changes: Type.Array(groupSchema) },
  { additionalProperties: false },
);
export interface OrganizationGroup
  extends Pick<Memory, "title" | "content" | "type" | "scope" | "certainty" | "tags"> {
  ids: string[];
  reason: string;
}
export interface OrganizationPlan {
  groups: OrganizationGroup[];
  filtered: { title: string; reason: string }[];
}

export interface OrganizationReview extends BaseReviewOutput {
  coverage: { id: string; quote: string; retainedMeaning: string }[];
}

export function organizationReviewSchema(count: number) {
  return Type.Object(
    {
      reviews: Type.Array(
        Type.Object(
          {
            ...reviewItemProperties(count),
            coverage: Type.Array(
              Type.Object(
                {
                  id: Type.String({ minLength: 1 }),
                  quote: Type.String({ minLength: 1, maxLength: 30000 }),
                  retainedMeaning: Type.String({ minLength: 1, maxLength: 2000 }),
                },
                { additionalProperties: false },
              ),
            ),
          },
          { additionalProperties: false },
        ),
        { minItems: count, maxItems: count },
      ),
    },
    { additionalProperties: false },
  );
}

export function validateOrganizationReview(value: unknown, count: number): OrganizationReview[] {
  if (!Check(organizationReviewSchema(count), value))
    throw new Error("Invalid or incomplete organization review; no memories changed");
  const reviews = value.reviews as OrganizationReview[];
  validateBaseReview({ reviews: reviews.map(({ coverage, ...review }) => review) }, count);
  return reviews;
}

export function organizationReviewSupported(
  review: OrganizationReview,
  group: OrganizationGroup,
  memories: Memory[],
) {
  if (!personalReviewSupported(review, organizationProposal(group, memories))) return false;
  const ids = new Set(review.coverage.map((item) => item.id));
  return (
    review.coverage.length === group.ids.length &&
    ids.size === group.ids.length &&
    group.ids.every((id) => ids.has(id)) &&
    review.coverage.every(
      (item) =>
        Boolean(item.quote.trim() && item.retainedMeaning.trim()) &&
        memories
          .find((memory) => memory.id === item.id)
          ?.sources.some((source) => source.quote.includes(item.quote)),
    )
  );
}

export function unchangedGroup(memory: Memory): OrganizationGroup {
  return { ids: [memory.id], ...memoryFields(memory), reason: "No change needed" };
}

export function organizationChanged(group: OrganizationGroup, memories: Memory[]): boolean {
  if (group.ids.length > 1) return true;
  const old = memories.find((memory) => memory.id === group.ids[0]);
  return (
    !old ||
    Object.entries(memoryFields(old)).some(
      ([key, value]) =>
        JSON.stringify(value) !== JSON.stringify(group[key as keyof OrganizationGroup]),
    )
  );
}

/** Every input record must be accounted for exactly once. Omission is never deletion. */
export function validateOrganization(value: unknown, memories: Memory[]): OrganizationGroup[] {
  if (!Check(organizationSchema, value))
    throw new Error("Invalid organization result; no memories changed");
  const ids = new Set(memories.map((memory) => memory.id));
  const seen = new Set<string>();
  const contents = new Set<string>();
  for (const group of value.groups) {
    const key = normalize(group.content);
    if (contents.has(key))
      throw new Error("Organization contains duplicate output; no memories changed");
    contents.add(key);
    for (const id of group.ids) {
      if (seen.has(id) || !ids.has(id))
        throw new Error("Organization repeats or invents a memory ID; no memories changed");
      seen.add(id);
    }
    validateProposal(createProposal({ ...group }));
  }
  if (seen.size !== memories.length)
    throw new Error("Organization omitted memories; no memories changed");
  return value.groups;
}

export function completeOrganization(memories: Memory[], changes: OrganizationGroup[]) {
  const touched = new Set(changes.flatMap((group) => group.ids));
  const groups = [
    ...changes,
    ...memories.filter((memory) => !touched.has(memory.id)).map(unchangedGroup),
  ];
  validateOrganization({ groups }, memories);
  // Preserve library ordering regardless of the model's group/ID order.
  const positions = new Map(memories.map((memory, index) => [memory.id, index]));
  return groups.sort(
    (a, b) =>
      Math.min(...a.ids.map((id) => positions.get(id)!)) -
      Math.min(...b.ids.map((id) => positions.get(id)!)),
  );
}

export function validateOrganizationChanges(value: unknown, memories: Memory[]) {
  if (!Check(organizationChangesSchema, value))
    throw new Error("Invalid organization changes; no memories changed");
  // Validate before discarding no-ops so repeated/invented IDs cannot disappear.
  completeOrganization(memories, value.changes);
  return value.changes.filter((group) => organizationChanged(group, memories));
}

export function organizationProposal(group: OrganizationGroup, memories: Memory[]) {
  return createProposal({
    ...group,
    sources: memories
      .filter((memory) => group.ids.includes(memory.id))
      .flatMap((memory) => memory.sources),
  });
}

/** Conservative gates; semantic fidelity and whether facts belong together still need review. */
export function validateOrganizationEvidence(group: OrganizationGroup, memories: Memory[]) {
  const originals = memories.filter((memory) => group.ids.includes(memory.id));
  if (originals.some((memory) => !memory.sources.some((source) => source.quote.trim())))
    throw new Error("Original words are missing; keep these records unchanged");
  const certainty = { 探索中: 0, 当前倾向: 1, 明确: 2 };
  if (originals.some((memory) => certainty[group.certainty] > certainty[memory.certainty]))
    throw new Error("Organization cannot increase certainty without new user evidence");
  validatePersonalEvidence(organizationProposal(group, memories));
}

export function organizedMemories(state: State, snapshot: Memory[], value: unknown): Memory[] {
  const groups = validateOrganization(value, snapshot);
  const current = new Map(state.memories.map((memory) => [memory.id, memory]));
  if (
    state.memories.length !== snapshot.length ||
    snapshot.some((old) => current.get(old.id)?.version !== old.version)
  )
    throw new Error(
      "The library changed during organization. Run Organize again; no memories changed",
    );
  const now = new Date().toISOString();
  const byId = new Map(snapshot.map((memory) => [memory.id, memory]));
  return completeOrganization(snapshot, groups).map((group) => {
    const originals = group.ids
      .map((id) => byId.get(id)!)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const first = originals[0];
    if (!organizationChanged(group, snapshot)) return first;
    validateOrganizationEvidence(group, snapshot);
    // Exact provenance is retained even when normalized source keys coincide.
    const seen = new Set<string>();
    const sources = originals
      .flatMap((memory) => memory.sources)
      .filter((source) => {
        const key = JSON.stringify([
          source.host,
          source.sessionId,
          source.entryId,
          source.fingerprint,
          source.quote,
          source.timestamp,
        ]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const { ids, reason, ...fields } = group;
    return {
      ...first,
      ...fields,
      sources,
      version: first.version + 1,
      updatedAt: now,
    };
  });
}
