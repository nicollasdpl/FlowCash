import type {
  AmbiguousCandidate,
  AppInvoiceLine,
  ImportedLine,
  MatchPair,
  MatchResult,
} from "./types";
import { normalizeText, roundCents } from "./csvShared";

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

/**
 * Score de match. Retorna null se valor não bater (obrigatório).
 * Maior = melhor. Threshold automático: >= 40.
 */
export function scoreMatch(imported: ImportedLine, app: AppInvoiceLine): number | null {
  if (roundCents(imported.amount) !== roundCents(app.amount)) return null;

  let score = 50; // valor exato

  const dd = daysDiff(imported.date, app.date);
  if (dd > DATE_TOLERANCE_DAYS) return null;
  score += Math.max(0, 25 - dd * 8); // 25 se mesmo dia

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

  return score;
}

const AUTO_MATCH_MIN = 40;

/**
 * Emparelha linhas do extrato com parcelas do app (1↔1 guloso por score).
 */
export function matchInvoiceLines(
  imported: ImportedLine[],
  appLines: AppInvoiceLine[],
): MatchResult {
  type Cand = { i: number; j: number; score: number };
  const candidates: Cand[] = [];

  for (let i = 0; i < imported.length; i++) {
    for (let j = 0; j < appLines.length; j++) {
      const score = scoreMatch(imported[i], appLines[j]);
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

  // Ambíguos: linha do banco com 2+ candidatos bons ainda não usados — reportamos
  // antes do guloso residual; na prática o guloso já pegou o melhor. Aqui,
  // considerarmos only_bank com múltiplos candidatos potenciais (ainda livres).
  const ambiguous: AmbiguousCandidate[] = [];
  const onlyBank: ImportedLine[] = [];

  for (let i = 0; i < imported.length; i++) {
    if (usedI.has(i)) continue;
    const cands: AppInvoiceLine[] = [];
    for (let j = 0; j < appLines.length; j++) {
      if (usedJ.has(j)) continue;
      const score = scoreMatch(imported[i], appLines[j]);
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
