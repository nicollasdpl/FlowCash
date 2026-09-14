import type { ImportedLine } from "./types";
import { parsePtBrAmount, splitCsvLine, stripBom } from "./csvShared";

const IGNORE_TITLE = /pagamento\s+recebido/i;

function parseIsoDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractFromTitle(title: string): {
  description: string;
  installmentHint?: ImportedLine["installmentHint"];
} {
  const trimmed = title.trim();
  const parcela = trimmed.match(/^(.+?)\s*-\s*Parcela\s+(\d+)\s*\/\s*(\d+)\s*$/i);
  if (parcela) {
    return {
      description: parcela[1].trim(),
      installmentHint: {
        current: Number(parcela[2]),
        total: Number(parcela[3]),
      },
    };
  }
  return { description: trimmed };
}

/**
 * CSV exportado pelo app Nubank: `date,title,amount`
 * - date: YYYY-MM-DD
 * - amount: "30,00" ou "- 2.676,26" (pagamentos ignorados)
 */
export function parseNubankCsv(text: string): ImportedLine[] {
  const rows = stripBom(text)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (rows.length === 0) return [];

  let start = 0;
  const header = splitCsvLine(rows[0], ",").map(c => c.toLowerCase());
  if (header[0] === "date" && header.includes("title") && header.includes("amount")) {
    start = 1;
  }

  const result: ImportedLine[] = [];
  let idx = 0;

  for (let i = start; i < rows.length; i++) {
    const cols = splitCsvLine(rows[i], ",");
    if (cols.length < 3) continue;

    const date = parseIsoDate(cols[0]);
    const title = cols[1]?.trim() ?? "";
    const amount = parsePtBrAmount(cols[2]);

    if (!date || !title || amount === null || amount <= 0) continue;
    if (IGNORE_TITLE.test(title)) continue;

    const { description, installmentHint } = extractFromTitle(title);
    if (!description) continue;

    result.push({
      id: `nu_${idx++}_${date}_${Math.round(amount * 100)}`,
      date,
      description,
      amount,
      installmentHint,
      raw: rows[i],
    });
  }

  return result;
}

export function isNubankCsv(text: string): boolean {
  const first = stripBom(text).split(/\r?\n/).find(l => l.trim().length > 0)?.trim().toLowerCase();
  if (!first) return false;
  return /^date\s*,\s*title\s*,\s*amount/.test(first);
}
