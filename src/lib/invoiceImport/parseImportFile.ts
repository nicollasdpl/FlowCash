import type { ImportedLine } from "./types";
import { isFlowCashCsv, parseFlowCashCsv } from "./parseFlowCashCsv";
import { isBradescoExtract, parseBradescoExtract } from "./parseBradescoExtract";
import { isNubankCsv, parseNubankCsv } from "./parseNubankCsv";

export type DetectedFormat = "flowcash_csv" | "nubank_csv" | "bradesco" | "unknown";

export function detectImportFormat(text: string): DetectedFormat {
  if (isFlowCashCsv(text)) return "flowcash_csv";
  if (isNubankCsv(text)) return "nubank_csv";
  if (isBradescoExtract(text)) return "bradesco";
  if (text.includes(";") && /\d{1,2}\/\d{1,2}\/\d{4}/.test(text)) {
    return "flowcash_csv";
  }
  if (/\d{1,2}\/\d{1,2}\s+\S+.*,\d{2}/.test(text)) return "bradesco";
  return "unknown";
}

export function parseImportText(
  text: string,
  opts?: { referenceYear?: number; force?: DetectedFormat },
): { format: DetectedFormat; lines: ImportedLine[] } {
  const format = opts?.force && opts.force !== "unknown"
    ? opts.force
    : detectImportFormat(text);

  if (format === "flowcash_csv") {
    return { format, lines: parseFlowCashCsv(text) };
  }
  if (format === "nubank_csv") {
    return { format, lines: parseNubankCsv(text) };
  }
  if (format === "bradesco") {
    return {
      format,
      lines: parseBradescoExtract(text, opts?.referenceYear),
    };
  }

  const a = parseFlowCashCsv(text);
  const nu = parseNubankCsv(text);
  const b = parseBradescoExtract(text, opts?.referenceYear);

  const best = [
    { format: "flowcash_csv" as const, lines: a },
    { format: "nubank_csv" as const, lines: nu },
    { format: "bradesco" as const, lines: b },
  ].sort((x, y) => y.lines.length - x.lines.length)[0];

  if (best.lines.length > 0) return best;
  return { format: "unknown", lines: [] };
}
