import {
  getKeywordsForCategory,
  normalizeCategoryKey,
} from "@/lib/ai/categoryKeywords";
import { normalizeText } from "./csvShared";
import { lookupMerchant, type MerchantMap } from "./merchantHistory";

export interface CategorySuggestion {
  categoryId: string;
  confidence: "high" | "low";
  source: "history" | "keywords" | "fallback";
}

/**
 * Sugere categoria em camadas:
 * 1. Histórico do usuário (merchant já lançado antes) → high
 * 2. Keywords fixas → high se score forte, senão low
 * 3. Fallback: primeira expense não-sistema → low (candidata a IA)
 */
export function suggestCategory(
  description: string,
  categories: Array<{ id: string; name: string; type: string; isSystem?: boolean }>,
  merchantMap?: MerchantMap,
): CategorySuggestion {
  const expense = categories.filter(c => c.type === "expense" && !c.isSystem);
  if (expense.length === 0) return { categoryId: "", confidence: "low", source: "fallback" };

  // Camada 1 — histórico
  if (merchantMap) {
    const info = lookupMerchant(merchantMap, description);
    if (info && expense.some(c => c.id === info.categoryId)) {
      return { categoryId: info.categoryId, confidence: "high", source: "history" };
    }
  }

  // Camada 2 — keywords
  const desc = normalizeText(description);
  let bestId = "";
  let bestScore = 0;

  for (const cat of expense) {
    const kw = getKeywordsForCategory(cat.name);
    if (!kw) {
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

  if (bestId && bestScore >= 2) {
    return { categoryId: bestId, confidence: "high", source: "keywords" };
  }
  if (bestId) {
    return { categoryId: bestId, confidence: "low", source: "keywords" };
  }

  // Camada 3 — fallback (IA decide depois)
  return { categoryId: expense[0].id, confidence: "low", source: "fallback" };
}

/** Compat: retorna só o id (usa as mesmas camadas). */
export function suggestCategoryId(
  description: string,
  categories: Array<{ id: string; name: string; type: string; isSystem?: boolean }>,
  merchantMap?: MerchantMap,
): string {
  return suggestCategory(description, categories, merchantMap).categoryId;
}
