import { normalizeText } from "./csvShared";

/**
 * Normaliza a descrição de um estabelecimento para servir de chave estável:
 * remove parcela "3/10", asteriscos, números soltos e limita a 4 tokens.
 * Ex.: "PICPAY*NICOLLAS DE P" → "picpay nicollas de p"
 *      "POSTO PORTAL DE JUNDIAI 2/3" → "posto portal de jundiai"
 */
export function normalizeMerchant(description: string): string {
  const cleaned = description
    .replace(/\d+\s*\/\s*\d+/g, " ")
    .replace(/\*/g, " ");
  const tokens = normalizeText(cleaned)
    .split(" ")
    .filter(t => t.length > 0 && !/^\d+$/.test(t));
  return tokens.slice(0, 4).join(" ");
}

export interface MerchantInfo {
  categoryId: string;
  count: number;
}

export type MerchantMap = Map<string, MerchantInfo>;

/**
 * Constrói o dicionário merchant → categoria mais frequente a partir de todas
 * as compras do usuário + cache persistido de imports anteriores.
 * O cache tem prioridade (representa escolha explícita do usuário no import).
 */
export function buildMerchantMap(
  purchases: Array<{ description: string; categoryId: string }>,
  cache?: Record<string, string>,
): MerchantMap {
  const counts = new Map<string, Map<string, number>>();

  for (const p of purchases) {
    if (!p.categoryId) continue;
    const key = normalizeMerchant(p.description);
    if (key.length < 3) continue;
    let byCat = counts.get(key);
    if (!byCat) {
      byCat = new Map();
      counts.set(key, byCat);
    }
    byCat.set(p.categoryId, (byCat.get(p.categoryId) ?? 0) + 1);
  }

  const map: MerchantMap = new Map();
  for (const [key, byCat] of counts) {
    let bestCat = "";
    let bestCount = 0;
    for (const [catId, n] of byCat) {
      if (n > bestCount) {
        bestCount = n;
        bestCat = catId;
      }
    }
    if (bestCat) map.set(key, { categoryId: bestCat, count: bestCount });
  }

  if (cache) {
    for (const [key, categoryId] of Object.entries(cache)) {
      if (key.length >= 3 && categoryId) {
        map.set(key, { categoryId, count: 1000 });
      }
    }
  }

  return map;
}

/** Busca no dicionário: chave exata ou por inclusão de prefixo de tokens. */
export function lookupMerchant(
  map: MerchantMap,
  description: string,
): MerchantInfo | undefined {
  const key = normalizeMerchant(description);
  if (key.length < 3) return undefined;

  const exact = map.get(key);
  if (exact) return exact;

  // Prefixos: "picpay nicollas de p" cai em "picpay nicollas" e vice-versa.
  for (const [k, info] of map) {
    if (k.length < 5) continue;
    if (key.startsWith(k) || k.startsWith(key)) return info;
  }
  return undefined;
}

/**
 * Monta as entradas de cache a serem persistidas após um import confirmado:
 * descrição original do banco → categoria escolhida pelo usuário.
 */
export function buildCacheEntries(
  added: Array<{ sourceDescription?: string; description: string; categoryId: string }>,
): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const d of added) {
    if (!d.categoryId) continue;
    const key = normalizeMerchant(d.sourceDescription ?? d.description);
    if (key.length >= 3) entries[key] = d.categoryId;
  }
  return entries;
}
