import type { ImportedLine } from "./types";
import { parsePtBrAmount, stripBom } from "./csvShared";

const IGNORE_PATTERNS = [
  /saldo\s+anterior/i,
  /pagto\s+antecipado/i,
  /pagamento/i,
  /total\s+(para|da\s+fatura)/i,
  /extrato\s+em\s+aberto/i,
  /situa[cç][aã]o\s+do\s+extrato/i,
  /moeda\s+de/i,
  /cota[cç][aã]o/i,
  /visa\s+signature/i,
  /aplicativo\s+bradesco/i,
  /^\.?\s*total/i,
  /^xxxx/i,
  /^--\s*\d+\s+of/i,
  /valores\s+sujeitos/i,
];

/** DD/MM or DD/MM/YYYY embedded at line start. Year default = referenceYear. */
function parseBradescoDate(token: string, referenceYear: number): string | null {
  const m = token.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : referenceYear;
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shouldIgnore(desc: string): boolean {
  return IGNORE_PATTERNS.some(p => p.test(desc));
}

function extractInstallmentHint(
  desc: string,
): { cleanDesc: string; installmentHint?: ImportedLine["installmentHint"] } {
  const m = desc.match(/(.+?)\s+(\d+)\s*\/\s*(\d+)\s*$/);
  if (m) {
    return {
      cleanDesc: m[1].trim(),
      installmentHint: { current: Number(m[2]), total: Number(m[3]) },
    };
  }
  return { cleanDesc: desc.trim() };
}

/**
 * Parser heurístico do extrato Bradesco (texto colado ou extraído do PDF).
 * Linhas típicas: `08/07 EDCAS COMERCIO E COMER 64,80` ou data numa linha e
 * descrição/valor nas seguintes.
 */
export function parseBradescoExtract(
  text: string,
  referenceYear = new Date().getFullYear(),
): ImportedLine[] {
  const rawLines = stripBom(text)
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Junta continuação de descrição quebrada (linha sem data nem valor no fim
  // cola na anterior se a anterior tinha data mas sem valor ainda).
  const merged: string[] = [];
  for (const line of rawLines) {
    const hasDate = /^\d{1,2}\/\d{1,2}/.test(line);
    const hasAmount = /[-−]?\s*\d{1,3}(?:\.\d{3})*,\d{2}\s*$/.test(line) ||
      /[-−]?\s*\d+,\d{2}\s*$/.test(line);

    if (!hasDate && merged.length > 0 && !hasAmount) {
      // possível continuação do histórico
      const prev = merged[merged.length - 1];
      const prevHasAmount = /,\d{2}\s*$/.test(prev);
      if (/^\d{1,2}\/\d{1,2}/.test(prev) && !prevHasAmount) {
        merged[merged.length - 1] = `${prev} ${line}`;
        continue;
      }
    }

    if (!hasDate && merged.length > 0 && hasAmount) {
      const prev = merged[merged.length - 1];
      if (/^\d{1,2}\/\d{1,2}/.test(prev) && !/,\d{2}\s*$/.test(prev)) {
        merged[merged.length - 1] = `${prev} ${line}`;
        continue;
      }
    }

    merged.push(line);
  }

  const result: ImportedLine[] = [];
  let idx = 0;

  for (const line of merged) {
    // Padrão: DD/MM[YYYY] DESC VALOR
    const m = line.match(
      /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+?)\s+([-−]?\d{1,3}(?:\.\d{3})*,\d{2}|[-−]?\d+,\d{2})\s*$/,
    );
    if (!m) continue;

    const date = parseBradescoDate(m[1], referenceYear);
    if (!date) continue;

    let desc = m[2].trim();
    if (shouldIgnore(desc) || shouldIgnore(line)) continue;

    const amountRaw = m[3].replace("−", "-");
    const amount = parsePtBrAmount(amountRaw);
    if (amount === null || amount <= 0) continue; // ignora créditos/pagamentos negativos

    const { cleanDesc, installmentHint } = extractInstallmentHint(desc);

    result.push({
      id: `br_${idx++}_${date}_${Math.round(amount * 100)}`,
      date,
      description: cleanDesc,
      amount,
      installmentHint,
      raw: line,
    });
  }

  return result;
}

export function isBradescoExtract(text: string): boolean {
  const sample = stripBom(text).slice(0, 1200).toLowerCase();
  return (
    sample.includes("bradesco") ||
    sample.includes("visa signature") ||
    sample.includes("saldo anterior") ||
    sample.includes("extrato em aberto") ||
    /picpay\*/i.test(sample) ||
    /\d{2}\/\d{2}\s+\S+.*,\d{2}/.test(sample)
  );
}
