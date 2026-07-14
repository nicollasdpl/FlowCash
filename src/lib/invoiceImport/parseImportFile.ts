import type { ImportedLine } from "./types";
import { isFlowCashCsv, parseFlowCashCsv } from "./parseFlowCashCsv";
import { isBradescoExtract, parseBradescoExtract } from "./parseBradescoExtract";

export type DetectedFormat = "flowcash_csv" | "bradesco" | "unknown";

export function detectImportFormat(text: string): DetectedFormat {
  if (isFlowCashCsv(text)) return "flowcash_csv";
  if (isBradescoExtract(text)) return "bradesco";
  // Heurística: tem header com ;
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
  if (format === "bradesco") {
    return {
      format,
      lines: parseBradescoExtract(text, opts?.referenceYear),
    };
  }

  // Tenta ambos e fica com o que rendeu mais linhas
  const a = parseFlowCashCsv(text);
  const b = parseBradescoExtract(text, opts?.referenceYear);
  if (a.length >= b.length && a.length > 0) {
    return { format: "flowcash_csv", lines: a };
  }
  if (b.length > 0) return { format: "bradesco", lines: b };
  return { format: "unknown", lines: [] };
}
