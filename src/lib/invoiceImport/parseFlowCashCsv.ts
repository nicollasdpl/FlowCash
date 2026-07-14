import type { ImportedLine } from "./types";
import {
  parseDateBr,
  parsePtBrAmount,
  splitCsvLine,
  stripBom,
} from "./csvShared";

const HEADER_MARKERS = ["data", "descrição", "descricao", "valor parcela"];

function looksLikeHeader(cols: string[]): boolean {
  const joined = cols.map(c => c.toLowerCase()).join("|");
  return HEADER_MARKERS.some(m => joined.includes(m));
}

function parseParcelaHint(
  parcela: string,
): { installmentHint?: ImportedLine["installmentHint"]; isSubscriptionHint?: boolean } {
  const p = parcela.trim();
  if (!p || p === "—" || p === "-") return {};
  if (/assinatura/i.test(p)) return { isSubscriptionHint: true };
  const m = p.match(/(\d+)\s*\/\s*(\d+)/);
  if (m) {
    return {
      installmentHint: { current: Number(m[1]), total: Number(m[2]) },
    };
  }
  return {};
}

/**
 * Parse do CSV exportado pelo FlowCash (`;`, meta `#`, header Data;Descrição;...).
 * Também tolerante a CSV com as mesmas colunas sem meta.
 */
export function parseFlowCashCsv(text: string): ImportedLine[] {
  const lines = stripBom(text)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith("#"));

  if (lines.length === 0) return [];

  let start = 0;
  const firstCols = splitCsvLine(lines[0]);
  if (looksLikeHeader(firstCols)) start = 1;

  const result: ImportedLine[] = [];
  let idx = 0;

  for (let i = start; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 5) continue;

    const date = parseDateBr(cols[0]);
    const description = cols[1]?.trim() ?? "";
    const amount = parsePtBrAmount(cols[4]);
    if (!date || !description || amount === null || amount <= 0) continue;

    const { installmentHint, isSubscriptionHint } = parseParcelaHint(cols[3] ?? "");

    result.push({
      id: `fc_${idx++}_${date}_${Math.round(amount * 100)}`,
      date,
      description,
      amount,
      installmentHint,
      isSubscriptionHint,
      raw: lines[i],
    });
  }

  return result;
}

export function isFlowCashCsv(text: string): boolean {
  const sample = stripBom(text).slice(0, 800).toLowerCase();
  return (
    sample.includes("valor parcela") ||
    (sample.includes("descrição") && sample.includes("categoria") && sample.includes(";")) ||
    (sample.includes("descricao") && sample.includes("categoria") && sample.includes(";")) ||
    sample.includes("# fatura")
  );
}
