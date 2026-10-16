import { Type, type Static } from "typebox";
import { Check } from "typebox/value";
import {
  TYPES,
  CERTAINTY_LABELS,
  createProposal,
  validateProposal,
  sourceKey,
  normalize,
} from "./memory.ts";
import type { Memory, State } from "./memory.ts";

export const organizationSchema = Type.Object(
  {
    groups: Type.Array(
      Type.Object(
        {
          ids: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, uniqueItems: true }),
          title: Type.String({ minLength: 1, maxLength: 160 }),
          content: Type.String({ minLength: 1, maxLength: 6000 }),
          type: Type.Union(TYPES.map((value) => Type.Literal(value))),
          scope: Type.String({ maxLength: 2000 }),
          certainty: Type.Union(Object.keys(CERTAINTY_LABELS).map((value) => Type.Literal(value))),
          tags: Type.Array(Type.String({ maxLength: 100 }), { maxItems: 12 }),
          reason: Type.String({ minLength: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type OrganizationGroup = Static<typeof organizationSchema>["groups"][number];

/** Every input record must be accounted for exactly once. Omission is never deletion. */
export function validateOrganization(value: unknown, memories: Memory[]): OrganizationGroup[] {
  if (!Check(organizationSchema, value))
    throw new Error("Invalid organization result; no memories changed");
  const seen = new Set<string>();
  const contents = new Set<string>();
  for (const group of value.groups) {
    const key = normalize(group.content);
    if (contents.has(key))
      throw new Error("Organization contains duplicate output; no memories changed");
    contents.add(key);
    for (const id of group.ids) {
      if (seen.has(id) || !memories.some((memory) => memory.id === id))
        throw new Error("Organization repeats or invents a memory ID; no memories changed");
      seen.add(id);
    }
    validateProposal(
      createProposal({
        ...group,
        type: group.type as Memory["type"],
        certainty: group.certainty as Memory["certainty"],
      }),
    );
  }
  if (seen.size !== memories.length)
    throw new Error("Organization omitted memories; no memories changed");
  return value.groups;
}

export function organizedMemories(state: State, snapshot: Memory[], value: unknown): Memory[] {
  const groups = validateOrganization(value, snapshot);
  if (
    state.memories.length !== snapshot.length ||
    snapshot.some(
      (old) =>
        !state.memories.some((current) => current.id === old.id && current.version === old.version),
    )
  )
    throw new Error(
      "The library changed during organization. Run Organize again; no memories changed",
    );
  const now = new Date().toISOString();
  return groups.map((group) => {
    const originals = group.ids.map((id) => snapshot.find((memory) => memory.id === id)!);
    const first = originals[0];
    const sources = originals
      .flatMap((memory) => memory.sources)
      .filter(
        (source, i, all) => all.findIndex((other) => sourceKey(other) === sourceKey(source)) === i,
      );
    const { ids, reason, ...fields } = group;
    const changed =
      originals.length > 1 ||
      Object.entries(fields).some(
        ([key, value]) => JSON.stringify(first[key as keyof Memory]) !== JSON.stringify(value),
      );
    return changed
      ? {
          ...first,
          ...fields,
          type: group.type as Memory["type"],
          certainty: group.certainty as Memory["certainty"],
          sources,
          version: first.version + 1,
          updatedAt: now,
          createdAt: originals.map((memory) => memory.createdAt).sort()[0],
        }
      : first;
  });
}
