import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { parseImportText } from "../parseImportFile";
import { isNubankCsv, parseNubankCsv } from "../parseNubankCsv";

const FIXTURE = `date,title,amount
2026-06-23,Auto Posto Videira,"30,00"
2026-06-22,Mp *Drogariaporta,"11,28"
2026-06-18,Mercadolivre*Mercadol - Parcela 1/10,"304,91"
2026-06-16,Pagamento recebido,"- 2.676,26"
2026-06-17,"IOF de ""Cursor Ai Powered Ide""","3,86"
2026-06-20,Google One,"9,99"
`;

describe("parseNubankCsv", () => {
  it("detects nubank header", () => {
    expect(isNubankCsv(FIXTURE)).toBe(true);
  });

  it("parses charges and ignores payments", () => {
    const lines = parseNubankCsv(FIXTURE);
    expect(lines).toHaveLength(5);
    expect(lines.some(l => /pagamento/i.test(l.description))).toBe(false);
    expect(lines.find(l => l.description.includes("Auto Posto"))?.amount).toBe(30);
  });

  it("extracts installment from title", () => {
    const lines = parseNubankCsv(FIXTURE);
    const ml = lines.find(l => l.description.includes("Mercadolivre"));
    expect(ml?.installmentHint).toEqual({ current: 1, total: 10 });
    expect(ml?.amount).toBe(304.91);
  });

  it("handles quoted titles with embedded quotes", () => {
    const lines = parseNubankCsv(FIXTURE);
    const iof = lines.find(l => l.description.includes("IOF"));
    expect(iof?.amount).toBe(3.86);
  });

  it("parseImportText detects nubank format", () => {
    const r = parseImportText(FIXTURE);
    expect(r.format).toBe("nubank_csv");
    expect(r.lines.length).toBe(5);
  });

  it("parses full nubank export shape (29 charges, 3 payments ignored)", () => {
    const full = readFileSync(
      resolve(__dirname, "fixtures/nubank-export-sample.csv"),
      "utf8",
    );
    const lines = parseNubankCsv(full);
    expect(lines.length).toBe(29);
    expect(lines.filter(l => l.installmentHint).length).toBeGreaterThanOrEqual(5);
  });
});
