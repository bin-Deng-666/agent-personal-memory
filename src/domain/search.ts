import { normalize } from "./memory.ts";
import type { Memory } from "./memory.ts";

const generic = new Set([
  "用户",
  "如何",
  "什么",
  "一个",
  "这个",
  "建议",
  "问题",
  "现在",
  "可以",
  "应该",
  "关于",
  "进行",
  "the",
  "and",
  "for",
  "with",
  "how",
  "what",
  "should",
  "user",
]);
function terms(query: string): string[] {
  const words = query.normalize("NFKC").toLowerCase();
  const latin = (words.match(/[a-z0-9]+/g) || []).filter((word) => word.length >= 2);
  const han = (words.match(/[\p{Script=Han}]+/gu) || []).flatMap((word) =>
    word.length === 1
      ? [word]
      : Array.from(word)
          .slice(0, -1)
          .map((c, i) => c + word[i + 1]),
  );
  return [...new Set([...latin, ...han])].filter((word) => !generic.has(word));
}
export function searchMemories(memories: Memory[], query: string, limit = 12): Memory[] {
  const q = normalize(query);
  if (!q)
    return [...memories].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
  const keys = terms(query);
  if (!keys.length) return [];
  return memories
    .map((m) => {
      const title = normalize(m.title),
        content = normalize(m.content),
        scope = normalize(m.scope),
        tags = normalize(m.tags.join(" "));
      const score =
        (title.includes(q) ? 40 : 0) +
        (content.includes(q) ? 15 : 0) +
        keys.reduce(
          (n, key) =>
            n +
            (title.includes(key) ? 8 : 0) +
            (tags.includes(key) ? 6 : 0) +
            (scope.includes(key) ? 5 : 0) +
            (content.includes(key) ? 3 : 0),
          0,
        );
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.m.updatedAt.localeCompare(a.m.updatedAt))
    .slice(0, limit)
    .map((x) => x.m);
}

/**
 * The habits an ordinary conversation carries.
 *
 * EVERY `稳定偏好` THAT IS NOT STILL BEING EXPLORED, NEWEST FIRST, WITHIN THE
 * BUDGET. There used to be a keyword whitelist here (回答|沟通|coding|workflow…),
 * and it was the wrong instrument: a preference is already defined as "a reusable
 * way of working", so the type is the relevance signal. The whitelist dropped real
 * collaboration habits whose wording happened to miss every keyword — measured on
 * a real library, it carried 8 of 20 preferences and left out, among others,
 * "review 只报有实际影响的问题".
 *
 * Recency is the tiebreak because the budget is finite: when twenty preferences
 * do not fit, the ones that still describe how the user works today are the ones
 * worth the characters.
 */
export function habitContext(memories: Memory[], budget = 3200): string {
  const habits = memories
    .filter((m) => m.type === "稳定偏好" && m.certainty !== "探索中")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const out: string[] = [];
  let size = 0;
  for (const m of habits) {
    const text = JSON.stringify({
      id: m.id,
      version: m.version,
      title: m.title,
      content: m.content,
      scope: m.scope,
      certainty: m.certainty,
    });
    if (size + text.length + (out.length ? 1 : 0) <= budget) {
      out.push(text);
      size += text.length + (out.length > 1 ? 1 : 0);
    }
  }
  return out.join("\n");
}
