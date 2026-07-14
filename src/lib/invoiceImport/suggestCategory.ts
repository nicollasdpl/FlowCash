import {
  getKeywordsForCategory,
  normalizeCategoryKey,
} from "@/lib/ai/categoryKeywords";
import { normalizeText } from "./csvShared";

/**
 * Escolhe categoryId de despesa pelo overlap de keywords com a descrição.
 * Fallback: primeira expense não-sistema, ou "".
 */
export function suggestCategoryId(
  description: string,
  categories: Array<{ id: string; name: string; type: string; isSystem?: boolean }>,
): string {
  const expense = categories.filter(c => c.type === "expense" && !c.isSystem);
  if (expense.length === 0) return "";

  const desc = normalizeText(description);
  let bestId = expense[0].id;
  let bestScore = 0;

  for (const cat of expense) {
    const kw = getKeywordsForCategory(cat.name);
    if (!kw) {
      // match pelo nome da categoria na descrição
      const nameNorm = normalizeCategoryKey(cat.name);
      if (nameNorm && desc.includes(nameNorm) && bestScore < 1) {
        bestScore = 1;
        bestId = cat.id;
      }
      continue;
    }
    const tokens = kw.split(",").map(t => normalizeText(t.trim())).filter(Boolean);
    let score = 0;
    for (const t of tokens) {
      if (t.length >= 2 && desc.includes(t)) score += t.length >= 5 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = cat.id;
    }
  }

  return bestId;
}
