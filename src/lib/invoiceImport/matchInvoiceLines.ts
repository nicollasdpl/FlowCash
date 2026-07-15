import type {
  AmbiguousCandidate,
  AppInvoiceLine,
  ImportedLine,
  MatchPair,
  MatchResult,
  NearMatchPair,
} from "./types";
import { normalizeText, roundCents } from "./csvShared";
import { lookupMerchant, type MerchantMap } from "./merchantHistory";

const DATE_TOLERANCE_DAYS = 3;

function parseIso(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

function daysDiff(a: string, b: string): number {
  return Math.abs(parseIso(a) - parseIso(b)) / (24 * 60 * 60 * 1000);
}

function tokenSet(s: string): Set<string> {
  return new Set(normalizeText(s).split(" ").filter(t => t.length > 1));
}

/** Similaridade Jaccard em tokens [0,1]. */
export function descriptionSimilarity(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface MatchOptions {
  /** Histórico merchant → categoria (boost quando a categoria do app bate). */
  merchantMap?: MerchantMap;
}

/** Tolerância do quase-match: 1% do valor do banco, mínimo R$ 0,25. */
export function nearAmountTolerance(bankAmount: number): number {
  return Math.max(0.25, roundCents(bankAmount * 0.01));
}

function scoreCommon(
  imported: ImportedLine,
  app: AppInvoiceLine,
  opts?: MatchOptions,
): number | null {
  const dd = daysDiff(imported.date, app.date);
  if (dd > DATE_TOLERANCE_DAYS) return null;

  let score = Math.max(0, 25 - dd * 8); // 25 se mesmo dia

  const sim = descriptionSimilarity(imported.description, app.description);
  score += sim * 20;

  if (imported.installmentHint) {
    if (
      imported.installmentHint.current === app.installmentNumber &&
      imported.installmentHint.total === app.totalInstallments
    ) {
      score += 15;
    } else if (imported.installmentHint.total === app.totalInstallments) {
      score += 5;
    }
  }

  if (imported.isSubscriptionHint && app.isSubscription) score += 10;

  // Histórico: banco "PICPAY*..." já foi lançado antes com esta categoria →
  // reforça o par mesmo com descrições completamente diferentes ("Corre").
  if (opts?.merchantMap && app.categoryId) {
    const info = lookupMerchant(opts.merchantMap, imported.description);
    if (info?.categoryId === app.categoryId) score += 12;
  }

  return score;
}

/**
 * Score de match exato. Retorna null se valor não bater (obrigatório).
 * Threshold automático: >= 40.
 */
export function scoreMatch(
  imported: ImportedLine,
  app: AppInvoiceLine,
  opts?: MatchOptions,
): number | null {
  if (roundCents(imported.amount) !== roundCents(app.amount)) return null;
  const common = scoreCommon(imported, app, opts);
  if (common === null) return null;
  return 50 + common;
}

/**
 * Score de quase-match: valores próximos (≤ 1% ou R$ 0,25) mas não iguais.
 * Exige data compatível e algum sinal de descrição/parcela/histórico.
 */
export function scoreNearMatch(
  imported: ImportedLine,
  app: AppInvoiceLine,
  opts?: MatchOptions,
): number | null {
  const diff = Math.abs(roundCents(imported.amount) - roundCents(app.amount));
  if (diff === 0) return null; // é match exato, não quase
  if (diff > nearAmountTolerance(imported.amount)) return null;

  const common = scoreCommon(imported, app, opts);
  if (common === null) return null;

  // Sem nenhum sinal além do valor próximo, não sugere (evita falso positivo).
  const sim = descriptionSimilarity(imported.description, app.description);
  const hasSignal =
    sim >= 0.25 ||
    (imported.installmentHint &&
      imported.installmentHint.total === app.totalInstallments) ||
    common >= 30;
  if (!hasSignal) return null;

  return 35 + common;
}

const AUTO_MATCH_MIN = 40;
const NEAR_MATCH_MIN = 40;

/**
 * Emparelha linhas do extrato com parcelas do app (1↔1 guloso por score),
 * depois procura quase-matches (valor aproximado) nas sobras.
 */
export function matchInvoiceLines(
  imported: ImportedLine[],
  appLines: AppInvoiceLine[],
  opts?: MatchOptions,
): MatchResult {
  type Cand = { i: number; j: number; score: number };
  const candidates: Cand[] = [];

  for (let i = 0; i < imported.length; i++) {
    for (let j = 0; j < appLines.length; j++) {
      const score = scoreMatch(imported[i], appLines[j], opts);
      if (score !== null && score >= AUTO_MATCH_MIN) {
        candidates.push({ i, j, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const usedI = new Set<number>();
  const usedJ = new Set<number>();
  const matched: MatchPair[] = [];

  for (const c of candidates) {
    if (usedI.has(c.i) || usedJ.has(c.j)) continue;
    usedI.add(c.i);
    usedJ.add(c.j);
    matched.push({
      imported: imported[c.i],
      app: appLines[c.j],
      score: c.score,
    });
  }

  // Quase-matches nas sobras (valor aproximado; ex.: 147,07 vs 146,99)
  const nearCands: Cand[] = [];
  for (let i = 0; i < imported.length; i++) {
    if (usedI.has(i)) continue;
    for (let j = 0; j < appLines.length; j++) {
      if (usedJ.has(j)) continue;
      const score = scoreNearMatch(imported[i], appLines[j], opts);
      if (score !== null && score >= NEAR_MATCH_MIN) {
        nearCands.push({ i, j, score });
      }
    }
  }
  nearCands.sort((a, b) => b.score - a.score);

  const nearMatches: NearMatchPair[] = [];
  for (const c of nearCands) {
    if (usedI.has(c.i) || usedJ.has(c.j)) continue;
    usedI.add(c.i);
    usedJ.add(c.j);
    nearMatches.push({
      imported: imported[c.i],
      app: appLines[c.j],
      score: c.score,
      amountDiff: roundCents(imported[c.i].amount - appLines[c.j].amount),
    });
  }

  const ambiguous: AmbiguousCandidate[] = [];
  const onlyBank: ImportedLine[] = [];

  for (let i = 0; i < imported.length; i++) {
    if (usedI.has(i)) continue;
    const cands: AppInvoiceLine[] = [];
    for (let j = 0; j < appLines.length; j++) {
      if (usedJ.has(j)) continue;
      const score = scoreMatch(imported[i], appLines[j], opts);
      if (score !== null && score >= AUTO_MATCH_MIN) cands.push(appLines[j]);
    }
    if (cands.length >= 2) {
      ambiguous.push({ imported: imported[i], candidates: cands });
    } else {
      onlyBank.push(imported[i]);
    }
  }

  const onlyApp: AppInvoiceLine[] = [];
  for (let j = 0; j < appLines.length; j++) {
    if (!usedJ.has(j)) onlyApp.push(appLines[j]);
  }

  const bank = roundCents(imported.reduce((s, l) => s + l.amount, 0));
  const app = roundCents(appLines.reduce((s, l) => s + l.amount, 0));

  return {
    matched,
    nearMatches,
    onlyBank,
    onlyApp,
    ambiguous,
    totals: {
      bank,
      app,
      difference: roundCents(bank - app),
    },
  };
}

/**
 * Aplica vínculos manuais (importedLine.id → installmentId) sobre um resultado:
 * move os pares para matched, removendo-os de onlyBank/ambiguous/onlyApp/near.
 */
export function applyManualLinks(
  result: MatchResult,
  links: Record<string, string>,
): MatchResult {
  const entries = Object.entries(links).filter(([, v]) => v);
  if (entries.length === 0) return result;

  const linkedImported = new Set(entries.map(([impId]) => impId));
  const linkedApp = new Set(entries.map(([, instId]) => instId));

  const pool = new Map<string, ImportedLine>();
  for (const l of result.onlyBank) pool.set(l.id, l);
  for (const a of result.ambiguous) pool.set(a.imported.id, a.imported);
  for (const n of result.nearMatches) pool.set(n.imported.id, n.imported);

  const appPool = new Map<string, AppInvoiceLine>();
  for (const l of result.onlyApp) appPool.set(l.installmentId, l);
  for (const n of result.nearMatches) appPool.set(n.app.installmentId, n.app);

  const manualPairs: MatchPair[] = [];
  for (const [impId, instId] of entries) {
    const imp = pool.get(impId);
    const app = appPool.get(instId);
    if (imp && app) {
      manualPairs.push({ imported: imp, app, score: 0, manual: true });
    }
  }
  if (manualPairs.length === 0) return result;

  const pairedImp = new Set(manualPairs.map(p => p.imported.id));
  const pairedApp = new Set(manualPairs.map(p => p.app.installmentId));

  return {
    ...result,
    matched: [...result.matched, ...manualPairs],
    nearMatches: result.nearMatches.filter(
      n => !pairedImp.has(n.imported.id) && !pairedApp.has(n.app.installmentId),
    ),
    onlyBank: result.onlyBank.filter(
      l => !pairedImp.has(l.id) && !linkedImported.has(l.id),
    ),
    ambiguous: result.ambiguous.filter(a => !pairedImp.has(a.imported.id)),
    onlyApp: result.onlyApp.filter(
      l => !pairedApp.has(l.installmentId) && !linkedApp.has(l.installmentId),
    ),
  };
}

export function buildAppInvoiceLines(
  installments: Array<{
    id: string;
    purchaseId: string;
    amount: number;
    installmentNumber: number;
    totalInstallments: number;
  }>,
  purchases: Array<{
    id: string;
    description: string;
    categoryId: string;
    purchaseDate: string;
    isSubscription?: boolean;
  }>,
  categories: Array<{ id: string; name: string }>,
): AppInvoiceLine[] {
  return installments.map(inst => {
    const purchase = purchases.find(p => p.id === inst.purchaseId);
    const cat = categories.find(c => c.id === purchase?.categoryId);
    return {
      installmentId: inst.id,
      purchaseId: inst.purchaseId,
      date: purchase?.purchaseDate ?? "",
      description: purchase?.description ?? "—",
      amount: inst.amount,
      installmentNumber: inst.installmentNumber,
      totalInstallments: inst.totalInstallments,
      isSubscription: purchase?.isSubscription,
      categoryId: purchase?.categoryId ?? "",
      categoryName: cat?.name ?? "—",
    };
  });
}
