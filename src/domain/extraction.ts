import { Type } from "typebox";
import { Check } from "typebox/value";
import type { Memory, Proposal } from "./memory.ts";
import { TYPES } from "./memory.ts";

const choice = <T extends string>(values: readonly T[]) =>
  Type.Union(values.map((value) => Type.Literal(value)));
const text = (maxLength: number) => Type.String({ minLength: 1, maxLength });
const evidence = Type.Object(
  { entryId: text(200), quote: text(30000) },
  { additionalProperties: false },
);
const candidate = Type.Object(
  {
    action: choice(["add", "update"]),
    targetId: Type.Optional(text(200)),
    targetVersion: Type.Optional(Type.Integer({ minimum: 1 })),
    title: text(160),
    content: text(6000),
    type: choice(TYPES),
    scope: Type.String({ maxLength: 2000 }),
    certainty: choice(["明确", "当前倾向", "探索中"]),
    tags: Type.Array(text(100), { maxItems: 12 }),
    reason: text(2000),
    entryId: text(200),
    quote: text(30000),
    evidence: Type.Optional(Type.Array(evidence, { maxItems: 6 })),
  },
  { additionalProperties: false },
);
export const extractionResultSchema = Type.Object(
  { candidates: Type.Array(candidate, { maxItems: 5 }) },
  { additionalProperties: false },
);
export function extractionToolSchema(allowedIds: string[], evidenceIds: string[]) {
  const idSchema = (ids: string[]) => (ids.length ? choice(ids) : text(200));
  return Type.Object(
    {
      candidates: Type.Array(
        Type.Object(
          {
            ...candidate.properties,
            entryId: idSchema(allowedIds),
            evidence: Type.Optional(
              Type.Array(
                Type.Object(
                  { entryId: idSchema(evidenceIds), quote: text(30000) },
                  { additionalProperties: false },
                ),
                { maxItems: 6 },
              ),
            ),
          },
          { additionalProperties: false },
        ),
        { maxItems: 5 },
      ),
    },
    { additionalProperties: false },
  );
}
/** The fields every review verdict carries, independent of what is being reviewed. */
export const reviewItemProperties = (count: number) => ({
  index: Type.Integer({ minimum: 0, maximum: Math.max(0, count - 1) }),
  verdict: choice(["keep", "drop"]),
  basis: choice(["personal_context", "project_detail", "uncertain"]),
  personalQuote: Type.String({ maxLength: 30000 }),
  independentUse: Type.String({ maxLength: 2000 }),
  reason: text(2000),
});
export const baseReviewResultSchema = (count: number) =>
  Type.Object(
    {
      reviews: Type.Array(
        Type.Object(reviewItemProperties(count), { additionalProperties: false }),
        { minItems: count, maxItems: count },
      ),
    },
    { additionalProperties: false },
  );

/**
 * Extraction review, which additionally has to clear the library it is joining.
 *
 * Exact-match deduplication already runs in code, and it is not enough: the same
 * preference reworded is a different string. A real library held one preference
 * saved twice three minutes apart — characters alone could not tell those apart
 * from unrelated records (measured: 0.33 similarity against 0.21 for a pair that
 * shares nothing), so the distinction needs the reader, not a threshold. The
 * reviewer is the only step that sees the candidate AND the library at once, so
 * naming an existing record is part of its verdict rather than a separate pass.
 */
export const reviewResultSchema = (count: number) =>
  Type.Object(
    {
      reviews: Type.Array(
        Type.Object(
          {
            ...reviewItemProperties(count),
            duplicateOf: Type.Union([
              Type.Null(),
              Type.Object({ id: text(200), reason: text(2000) }, { additionalProperties: false }),
            ]),
          },
          { additionalProperties: false },
        ),
        { minItems: count, maxItems: count },
      ),
    },
    { additionalProperties: false },
  );

export interface CandidateOutput {
  action: "add" | "update";
  targetId?: string;
  targetVersion?: number;
  title: string;
  content: string;
  type: Memory["type"];
  scope: string;
  certainty: Memory["certainty"];
  tags: string[];
  reason: string;
  entryId: string;
  quote: string;
  evidence?: { entryId: string; quote: string }[];
}
export interface BaseReviewOutput {
  index: number;
  verdict: "keep" | "drop";
  basis: "personal_context" | "project_detail" | "uncertain";
  personalQuote: string;
  independentUse: string;
  reason: string;
}
export interface ReviewOutput extends BaseReviewOutput {
  /** An existing record this candidate restates; null when it says something new. */
  duplicateOf: { id: string; reason: string } | null;
}
export interface ExtractionRequest {
  stage: "extract" | "review";
  [key: string]: unknown;
}
export type StructuredCompletion = (payload: ExtractionRequest) => Promise<unknown>;

export function validateExtractionResult(value: unknown): { candidates: CandidateOutput[] } {
  if (!Check(extractionResultSchema, value))
    throw new Error("Invalid structured extraction result; checkpoint preserved");
  return value as { candidates: CandidateOutput[] };
}
export function validateReviewResult(value: unknown, count: number): { reviews: ReviewOutput[] } {
  if (!Check(reviewResultSchema(count), value))
    throw new Error("Invalid or incomplete quality review; checkpoint preserved");
  const reviews = value as { reviews: ReviewOutput[] };
  if (new Set(reviews.reviews.map((review) => review.index)).size !== count)
    throw new Error("Repeated indexes in quality review; checkpoint preserved");
  return reviews;
}
/** Organization reviews reuse the verdict fields without the library-duplicate field. */
export function validateBaseReview(value: unknown, count: number): { reviews: BaseReviewOutput[] } {
  if (!Check(baseReviewResultSchema(count), value))
    throw new Error("Invalid or incomplete organization review; no memories changed");
  const reviews = value as { reviews: BaseReviewOutput[] };
  if (new Set(reviews.reviews.map((review) => review.index)).size !== count)
    throw new Error("Repeated indexes in quality review; checkpoint preserved");
  return reviews;
}
export function personalReviewSupported(review: BaseReviewOutput, proposal: Proposal): boolean {
  const quote = review.personalQuote.trim();
  return (
    review.verdict === "keep" &&
    review.basis === "personal_context" &&
    Boolean(quote && review.independentUse.trim()) &&
    proposal.sources.some((source) => source.quote.includes(quote))
  );
}
