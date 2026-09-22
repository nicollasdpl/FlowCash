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
/** Janela maior só quando o valor é único no lote residual. */
const DATE_TOLERANCE_UNIQUE_DAYS = 7;

function parseIso(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

function daysDiff(a: string, b: string): number {
  return Math.abs(parseIso(a) - parseIso(b)) / (24 * 60 * 60 * 1000);
}

/** Remove prefixos de intermediador (PICPAY*, IFD*, etc.) para comparar o núcleo. */
function stripProcessorNoise(s: string): string {
  return normalizeText(s)
    .replace(
      /^(picpay|ifood|ifd|zigpay|mercadopago|mercado pago|pagbank|pagseguro|paypal|stone|ton|sumup|google|apple|uber|99)\s*/g,
      "",
    )
    .replace(/\b\d+\s*\/\s*\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(
    stripProcessorNoise(s)
      .split(" ")
      .filter(t => t.length > 1),
  );
}

/** Similaridade Jaccard em tokens [0,1], após limpar intermediadores. */
export function descriptionSimilarity(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Um dos lados contém o outro (ex.: "EDCAS COMERCIO" ⊃ "edcas"),
 * ou compartilham um token significativo (≥4 chars).
 */
export function nameOverlapSignal(a: string, b: string): boolean {
  const na = stripProcessorNoise(a);
  const nb = stripProcessorNoise(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(" ").filter(t => t.length >= 4));
  for (const t of nb.split(" ")) {
    if (t.length >= 4 && ta.has(t)) return true;
  }
  return false;
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
  dateTolerance = DATE_TOLERANCE_DAYS,
): number | null {
  const dd = daysDiff(imported.date, app.date);
  if (dd > dateTolerance) return null;

  let score = Math.max(0, 25 - dd * 8); // 25 se mesmo dia

  const sim = descriptionSimilarity(imported.description, app.description);
  score += sim * 20;

  if (nameOverlapSignal(imported.description, app.description)) {
    score += 12;
  }

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
    nameOverlapSignal(imported.description, app.description) ||
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
 * depois procura quase-matches (valor aproximado) nas sobras,
 * e por fim pares de valor único (mesmo centavo, janela de data maior).
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

  // Valor único residual: mesmo centavo + só 1 candidato na janela de 7 dias.
  // Cobre "PICPAY*…" ↔ "Corre" quando o valor não se repete.
  const uniqueCands: Cand[] = [];
  for (let i = 0; i < imported.length; i++) {
    if (usedI.has(i)) continue;
    const bankAmt = roundCents(imported[i].amount);
    const js: number[] = [];
    for (let j = 0; j < appLines.length; j++) {
      if (usedJ.has(j)) continue;
      if (roundCents(appLines[j].amount) !== bankAmt) continue;
      if (daysDiff(imported[i].date, appLines[j].date) > DATE_TOLERANCE_UNIQUE_DAYS) {
        continue;
      }
      js.push(j);
    }
    if (js.length !== 1) continue;
    const j = js[0];
    // Também exige que o app não tenha outro banco residual com o mesmo valor
    // na janela (senão é ambíguo — não chuta).
    let otherBanks = 0;
    for (let k = 0; k < imported.length; k++) {
      if (k === i || usedI.has(k)) continue;
      if (roundCents(imported[k].amount) !== bankAmt) continue;
      if (daysDiff(imported[k].date, appLines[j].date) <= DATE_TOLERANCE_UNIQUE_DAYS) {
        otherBanks++;
      }
    }
    if (otherBanks > 0) continue;

    const common = scoreCommon(
      imported[i],
      appLines[j],
      opts,
      DATE_TOLERANCE_UNIQUE_DAYS,
    );
    uniqueCands.push({ i, j, score: 45 + (common ?? 0) });
  }
  uniqueCands.sort((a, b) => b.score - a.score);
  for (const c of uniqueCands) {
    if (usedI.has(c.i) || usedJ.has(c.j)) continue;
    usedI.add(c.i);
    usedJ.add(c.j);
    matched.push({
      imported: imported[c.i],
      app: appLines[c.j],
      score: c.score,
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
  opts?: { ai?: boolean },
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
      manualPairs.push({
        imported: imp,
        app,
        score: 0,
        manual: !opts?.ai,
        ai: opts?.ai || undefined,
      });
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

export interface AiMatchSuggestion {
  importedId: string;
  installmentId: string;
}

/**
 * Valida pares sugeridos pela IA: ids existem, 1↔1, valor igual ou quase,
 * data dentro de 7 dias. Descarta o resto (não chuta).
 */
export function validateAiMatchPairs(
  onlyBank: ImportedLine[],
  onlyApp: AppInvoiceLine[],
  nearMatches: NearMatchPair[],
  suggestions: AiMatchSuggestion[],
): Record<string, string> {
  const bankById = new Map<string, ImportedLine>();
  for (const l of onlyBank) bankById.set(l.id, l);
  for (const n of nearMatches) bankById.set(n.imported.id, n.imported);

  const appById = new Map<string, AppInvoiceLine>();
  for (const l of onlyApp) appById.set(l.installmentId, l);
  for (const n of nearMatches) appById.set(n.app.installmentId, n.app);

  const usedBank = new Set<string>();
  const usedApp = new Set<string>();
  const links: Record<string, string> = {};

  for (const s of suggestions) {
    if (!s?.importedId || !s?.installmentId) continue;
    if (usedBank.has(s.importedId) || usedApp.has(s.installmentId)) continue;
    const bank = bankById.get(s.importedId);
    const app = appById.get(s.installmentId);
    if (!bank || !app) continue;

    const diff = Math.abs(roundCents(bank.amount) - roundCents(app.amount));
    const amountOk =
      diff === 0 || diff <= nearAmountTolerance(bank.amount);
    if (!amountOk) continue;

    if (!bank.date || !app.date) continue;
    if (daysDiff(bank.date, app.date) > DATE_TOLERANCE_UNIQUE_DAYS) continue;

    // Quase-match exige sinal de nome/parcela (mesma regra do scoreNearMatch).
    if (diff > 0) {
      const sim = descriptionSimilarity(bank.description, app.description);
      const instOk =
        !!bank.installmentHint &&
        bank.installmentHint.total === app.totalInstallments;
      if (
        sim < 0.2 &&
        !nameOverlapSignal(bank.description, app.description) &&
        !instOk
      ) {
        continue;
      }
    }

    usedBank.add(s.importedId);
    usedApp.add(s.installmentId);
    links[s.importedId] = s.installmentId;
  }

  return links;
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
