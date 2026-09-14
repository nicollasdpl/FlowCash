import { describe, expect, it } from "vitest";
import { parseFlowCashCsv } from "../parseFlowCashCsv";
import { parseBradescoExtract } from "../parseBradescoExtract";
import { matchInvoiceLines, buildAppInvoiceLines, descriptionSimilarity } from "../matchInvoiceLines";
import { parsePtBrAmount, parseDateBr } from "../csvShared";
import { parseImportText } from "../parseImportFile";

const FLOWCASH_FIXTURE = `\uFEFF# Fatura Agosto 2026
# Cartão: Bradesco Signature (Visa •••• 6969)
# Total: R$ 100,00 | Itens: 3

Data;Descrição;Categoria;Parcela;Valor parcela (R$);Valor total compra (R$);Status;Pago em;Tipo
08/07/2026;Mequi;Alimentação;1/1;64,80;64,80;Pendente;;À vista
08/07/2026;Pastel;Alimentação;1/1;23,00;23,00;Pendente;;À vista
01/05/2026;Perfume;Moradia;3/5;95,00;475,00;Pendente;;Parcelado
`;

const BRADESCO_FIXTURE = `
Aplicativo Bradesco Cartões
Situação do Extrato: EM ABERTO
NICOLLAS PAULA - VISA SIGNATURE
05/07 SALDO ANTERIOR 2.298,22
08/07 EDCAS COMERCIO E
COMER 64,80
08/07 JUPIARA COMERCIO DE 23,00
03/07 PAGTO ANTECIPADO PIX -2.298,22
08/05 OPAQUE 3/5 95,00
24/04 MADEIRA 3/10 146,99
. Total da Fatura em Real . . . R$ 1.708,83
`;

describe("csvShared", () => {
  it("parses pt-BR amounts", () => {
    expect(parsePtBrAmount("1.878,95")).toBe(1878.95);
    expect(parsePtBrAmount("64,80")).toBe(64.8);
    expect(parsePtBrAmount("-2.298,22")).toBe(-2298.22);
  });

  it("parses BR dates", () => {
    expect(parseDateBr("08/07/2026")).toBe("2026-07-08");
    expect(parseDateBr("1/5/2026")).toBe("2026-05-01");
  });
});

describe("parseFlowCashCsv", () => {
  it("parses exported invoice CSV", () => {
    const lines = parseFlowCashCsv(FLOWCASH_FIXTURE);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      date: "2026-07-08",
      description: "Mequi",
      amount: 64.8,
    });
    expect(lines[2].installmentHint).toEqual({ current: 3, total: 5 });
  });
});

describe("parseBradescoExtract", () => {
  it("parses charge lines and ignores saldo/pagto/totais", () => {
    const lines = parseBradescoExtract(BRADESCO_FIXTURE, 2026);
    const amounts = lines.map(l => l.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([23, 64.8, 95, 146.99]);
    expect(lines.find(l => l.amount === 95)?.installmentHint).toEqual({
      current: 3,
      total: 5,
    });
    expect(lines.every(l => !/saldo|pagto|total/i.test(l.description))).toBe(true);
  });

  it("reassembles Bradesco PDF split description layout", () => {
    const pdfLike = `
EDCAS COMERCIO E
08/07  64,80
COMER
08/07  JUPIARA COMERCIO DE  23,00
COMERCIAL MORADA
06/07  25,80
JUNDI
JIM.COM LETICIA DA
05/07  13,83
SILVA
05/07  SALDO ANTERIOR  2.298,22
03/07  PAGTO ANTECIPADO PIX  -2.298,22
26/06  CINEPOLIS OPERADORA DE 42,00
CI
08/05  OPAQUE 3/5  95,00
`;
    const lines = parseBradescoExtract(pdfLike, 2026);
    expect(lines.find(l => l.amount === 64.8)?.description).toMatch(/EDCAS/i);
    expect(lines.find(l => l.amount === 64.8)?.description).toMatch(/COMER/i);
    expect(lines.find(l => l.amount === 25.8)?.description).toMatch(/MORADA/i);
    expect(lines.find(l => l.amount === 13.83)?.description).toMatch(/JIM/i);
    expect(lines.find(l => l.amount === 42)?.description).toMatch(/CINEPOLIS/i);
    expect(lines.find(l => l.amount === 42)?.description).toMatch(/CI/i);
    expect(lines.some(l => /saldo|pagto/i.test(l.description))).toBe(false);
    expect(lines).toHaveLength(6);
  });
});

describe("matchInvoiceLines", () => {
  it("matches by amount + date tolerance + description", () => {
    const imported = parseFlowCashCsv(FLOWCASH_FIXTURE);
    const appLines = buildAppInvoiceLines(
      [
        { id: "i1", purchaseId: "p1", amount: 64.8, installmentNumber: 1, totalInstallments: 1 },
        { id: "i2", purchaseId: "p2", amount: 23, installmentNumber: 1, totalInstallments: 1 },
        { id: "i3", purchaseId: "p3", amount: 95, installmentNumber: 3, totalInstallments: 5 },
      ],
      [
        { id: "p1", description: "Mequi", categoryId: "c1", purchaseDate: "2026-07-08" },
        { id: "p2", description: "Pastel", categoryId: "c1", purchaseDate: "2026-07-09" }, // +1 day
        { id: "p3", description: "Perfume", categoryId: "c2", purchaseDate: "2026-05-01" },
      ],
      [
        { id: "c1", name: "Alimentação" },
        { id: "c2", name: "Moradia" },
      ],
    );

    const result = matchInvoiceLines(imported, appLines);
    expect(result.matched).toHaveLength(3);
    expect(result.onlyBank).toHaveLength(0);
    expect(result.onlyApp).toHaveLength(0);
    expect(result.totals.bank).toBe(182.8);
  });

  it("flags only_bank and only_app when unmatched", () => {
    const imported = [
      { id: "b1", date: "2026-07-06", description: "PICPAY", amount: 60.67 },
      { id: "b2", date: "2026-07-08", description: "Mequi", amount: 64.8 },
    ];
    const appLines = buildAppInvoiceLines(
      [
        { id: "i1", purchaseId: "p1", amount: 64.8, installmentNumber: 1, totalInstallments: 1 },
        { id: "i2", purchaseId: "p2", amount: 206.77, installmentNumber: 3, totalInstallments: 6 },
      ],
      [
        { id: "p1", description: "Mequi", categoryId: "c1", purchaseDate: "2026-07-08" },
        { id: "p2", description: "Empréstimo", categoryId: "c1", purchaseDate: "2026-05-01" },
      ],
      [{ id: "c1", name: "Outros" }],
    );

    const result = matchInvoiceLines(imported, appLines);
    expect(result.matched).toHaveLength(1);
    expect(result.onlyBank.map(l => l.amount)).toEqual([60.67]);
    expect(result.onlyApp.map(l => l.amount)).toEqual([206.77]);
  });

  it("descriptionSimilarity is case/accent insensitive", () => {
    expect(descriptionSimilarity("Mátsuri To Go", "matsuri to go")).toBeGreaterThan(0.9);
  });
});

describe("parseImportText", () => {
  it("detects flowcash csv", () => {
    const r = parseImportText(FLOWCASH_FIXTURE);
    expect(r.format).toBe("flowcash_csv");
    expect(r.lines.length).toBe(3);
  });

  it("detects bradesco extract", () => {
    const r = parseImportText(BRADESCO_FIXTURE, { referenceYear: 2026 });
    expect(r.format).toBe("bradesco");
    expect(r.lines.length).toBe(4);
  });
});
