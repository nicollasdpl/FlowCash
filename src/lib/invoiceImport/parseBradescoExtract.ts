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
  /^nicollas\s+paula/i,
  /^data:\s*\d/i,
  /^hist[oó]rico/i,
  /^origem/i,
  /^paula$/i,
];

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

const AMOUNT_RE = String.raw`([-−]?\d{1,3}(?:\.\d{3})*,\d{2}|[-−]?\d+,\d{2})`;
const DATE_RE = String.raw`(\d{1,2}/\d{1,2}(?:/\d{2,4})?)`;

type Classified =
  | { kind: "charge"; date: string; amount: number; midDesc: string; raw: string }
  | { kind: "date_desc"; date: string; text: string }
  | { kind: "amount_line"; amount: number; text: string; raw: string }
  | { kind: "text"; text: string }
  | { kind: "skip" };

function classifyLine(line: string, referenceYear: number): Classified {
  if (shouldIgnore(line)) return { kind: "skip" };

  // DD/MM [DESC] VALOR
  const full = line.match(new RegExp(`^${DATE_RE}\\s+(.*?)${AMOUNT_RE}\\s*$`));
  if (full) {
    const date = parseBradescoDate(full[1], referenceYear);
    const midDesc = (full[2] ?? "").trim();
    const amount = parsePtBrAmount(full[3].replace("−", "-"));
    if (!date || amount === null) return { kind: "skip" };
    if (amount <= 0) return { kind: "skip" };
    if (midDesc && shouldIgnore(midDesc)) return { kind: "skip" };
    return { kind: "charge", date, amount, midDesc, raw: line };
  }

  // DD/MM DESC  (sem valor — comum no texto colado quebrado)
  const dateOnly = line.match(new RegExp(`^${DATE_RE}\\s+(.+)$`));
  if (dateOnly) {
    const date = parseBradescoDate(dateOnly[1], referenceYear);
    const text = dateOnly[2].trim();
    if (!date || !text || shouldIgnore(text)) return { kind: "skip" };
    return { kind: "date_desc", date, text };
  }

  // DESC VALOR sem data (continuação colada: "COMER 64,80")
  const amtOnly = line.match(new RegExp(`^(.+?)\\s+${AMOUNT_RE}\\s*$`));
  if (amtOnly) {
    const amount = parsePtBrAmount(amtOnly[2].replace("−", "-"));
    const text = amtOnly[1].trim();
    if (amount !== null && amount > 0) {
      return { kind: "amount_line", amount, text, raw: line };
    }
  }

  return { kind: "text", text: line };
}

function isShortContinuation(text: string): boolean {
  const t = text.trim();
  if (!t || shouldIgnore(t)) return false;
  const words = t.split(/\s+/);
  // Fragmentos curtíssimos do PDF (CI, SILVA, COMER, JUNDI, ESSENCIA)
  return words.length === 1 && t.length <= 14;
}

/**
 * Parser do extrato Bradesco (PDF extraído ou texto colado).
 */
export function parseBradescoExtract(
  text: string,
  referenceYear = new Date().getFullYear(),
): ImportedLine[] {
  const rawLines = stripBom(text)
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const classified = rawLines.map(l => classifyLine(l, referenceYear));
  const used = new Set<number>();
  const result: ImportedLine[] = [];
  let idx = 0;

  function pushLine(
    date: string,
    amount: number,
    description: string,
    raw: string,
  ) {
    const desc = description.replace(/\s+/g, " ").trim();
    if (!desc || shouldIgnore(desc)) return;
    const { cleanDesc, installmentHint } = extractInstallmentHint(desc);
    result.push({
      id: `br_${idx++}_${date}_${Math.round(amount * 100)}`,
      date,
      description: cleanDesc,
      amount,
      installmentHint,
      raw,
    });
  }

  for (let i = 0; i < classified.length; i++) {
    if (used.has(i)) continue;
    const row = classified[i];

    // Caso A: linha completa DATE+DESC+VALOR (ou DATE+VALOR do PDF)
    if (row.kind === "charge") {
      used.add(i);
      let description = row.midDesc;

      if (!row.midDesc) {
        // PDF: descrição acima e/ou abaixo da linha data+valor
        const before: string[] = [];
        for (let j = i - 1; j >= 0; j--) {
          if (used.has(j)) break;
          const prev = classified[j];
          if (prev.kind !== "text") break;
          before.unshift(prev.text);
          used.add(j);
        }
        const after: string[] = [];
        const maxAfter = before.length > 0 ? 1 : 2;
        for (let j = i + 1; j < classified.length; j++) {
          if (used.has(j)) break;
          const next = classified[j];
          if (next.kind !== "text") break;
          if (!isShortContinuation(next.text)) break;
          after.push(next.text);
          used.add(j);
          if (after.length >= maxAfter) break;
        }
        description = [...before, ...after].join(" ");
      } else {
        // Sufixo curto na linha seguinte (ex.: "CI")
        const next = classified[i + 1];
        if (
          next?.kind === "text" &&
          !used.has(i + 1) &&
          isShortContinuation(next.text)
        ) {
          description = `${row.midDesc} ${next.text}`;
          used.add(i + 1);
        }
      }

      pushLine(row.date, row.amount, description, row.raw);
      continue;
    }

    // Caso B: "08/07 EDCAS..." + "COMER 64,80"
    if (row.kind === "date_desc") {
      let amount: number | null = null;
      let extra = "";
      let raw = row.text;
      for (let j = i + 1; j < Math.min(i + 4, classified.length); j++) {
        if (used.has(j)) continue;
        const next = classified[j];
        if (next.kind === "amount_line") {
          amount = next.amount;
          extra = next.text;
          raw = next.raw;
          used.add(j);
          // Pegar mais um text curto depois, se houver
          const k = j + 1;
          if (
            classified[k]?.kind === "text" &&
            !used.has(k) &&
            isShortContinuation(classified[k].text)
          ) {
            extra = `${extra} ${classified[k].text}`.trim();
            used.add(k);
          }
          break;
        }
        if (next.kind === "charge" || next.kind === "date_desc") break;
        if (next.kind === "text") {
          extra = `${extra} ${next.text}`.trim();
          used.add(j);
        }
      }
      if (amount === null) continue;
      used.add(i);
      pushLine(row.date, amount, `${row.text} ${extra}`.trim(), raw);
    }
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
