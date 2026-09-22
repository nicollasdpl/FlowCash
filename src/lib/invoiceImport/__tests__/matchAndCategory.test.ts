import { describe, expect, it } from "vitest";
import {
  buildCacheEntries,
  buildMerchantMap,
  lookupMerchant,
  normalizeMerchant,
} from "../merchantHistory";
import {
  applyManualLinks,
  matchInvoiceLines,
  nameOverlapSignal,
  scoreNearMatch,
  validateAiMatchPairs,
} from "../matchInvoiceLines";
import { suggestCategory } from "../suggestCategory";

const CATEGORIES = [
  { id: "cat_transporte", name: "Transporte", type: "expense" as const },
  { id: "cat_corre", name: "Corre", type: "expense" as const },
  { id: "cat_outros", name: "Outros", type: "expense" as const },
];

describe("merchantHistory", () => {
  it("normalizes merchant keys", () => {
    expect(normalizeMerchant("PICPAY*NICOLLAS DE P")).toBe("picpay nicollas de p");
    expect(normalizeMerchant("POSTO PORTAL 3/10")).toBe("posto portal");
  });

  it("builds map from purchases and cache", () => {
    const map = buildMerchantMap(
      [
        { description: "Corre", categoryId: "cat_corre" },
        { description: "Corre", categoryId: "cat_corre" },
      ],
      { picpay: "cat_corre" },
    );
    expect(lookupMerchant(map, "PICPAY*NICOLLAS")?.categoryId).toBe("cat_corre");
    expect(lookupMerchant(map, "Corre")?.categoryId).toBe("cat_corre");
  });

  it("buildCacheEntries from import drafts", () => {
    const entries = buildCacheEntries([
      {
        sourceDescription: "POSTO PORTAL DE JUNDIAI",
        description: "Gasolina",
        categoryId: "cat_transporte",
      },
    ]);
    expect(entries["posto portal de jundiai"]).toBe("cat_transporte");
  });
});

describe("unique amount + name overlap", () => {
  it("matches unique amount even with unrelated names (PICPAY ↔ Corre)", () => {
    const imported = [
      {
        id: "b1",
        date: "2026-07-06",
        description: "PICPAY*NICOLLAS DE P",
        amount: 60.67,
      },
    ];
    const appLines = [
      {
        installmentId: "i1",
        purchaseId: "p1",
        date: "2026-07-06",
        description: "Corre",
        amount: 60.67,
        installmentNumber: 1,
        totalInstallments: 1,
        categoryId: "cat_corre",
        categoryName: "Corre",
      },
    ];
    const result = matchInvoiceLines(imported, appLines);
    expect(result.matched).toHaveLength(1);
    expect(result.onlyBank).toHaveLength(0);
  });

  it("does not guess when two bank lines share the same amount", () => {
    const imported = [
      { id: "b1", date: "2026-07-06", description: "PICPAY A", amount: 60.67 },
      { id: "b2", date: "2026-07-07", description: "PICPAY B", amount: 60.67 },
    ];
    const appLines = [
      {
        installmentId: "i1",
        purchaseId: "p1",
        date: "2026-07-06",
        description: "Corre",
        amount: 60.67,
        installmentNumber: 1,
        totalInstallments: 1,
        categoryId: "cat_corre",
        categoryName: "Corre",
      },
    ];
    // Um dos dois pode casar pelo score de data; o outro fica só no banco.
    // O importante: não inventar segundo par.
    const result = matchInvoiceLines(imported, appLines);
    expect(result.matched.length + result.nearMatches.length).toBeLessThanOrEqual(1);
    expect(result.onlyBank.length + result.matched.length).toBe(2);
  });

  it("nameOverlapSignal detects shared stem", () => {
    expect(nameOverlapSignal("EDCAS COMERCIO DE ALIM", "Edcas")).toBe(true);
    expect(nameOverlapSignal("PICPAY*X", "Corre")).toBe(false);
  });
});

describe("near match", () => {
  it("detects 147.07 vs 146.99 as near match", () => {
    const imported = [
      {
        id: "b1",
        date: "2026-05-01",
        description: "MADEIRA 3/10",
        amount: 146.99,
        installmentHint: { current: 3, total: 10 },
      },
    ];
    const appLines = [
      {
        installmentId: "i1",
        purchaseId: "p1",
        date: "2026-05-01",
        description: "Guarda-roupa",
        amount: 147.07,
        installmentNumber: 3,
        totalInstallments: 10,
        categoryId: "cat_outros",
        categoryName: "Outros",
      },
    ];

    const score = scoreNearMatch(imported[0], appLines[0]);
    expect(score).not.toBeNull();

    const result = matchInvoiceLines(imported, appLines);
    expect(result.nearMatches).toHaveLength(1);
    expect(result.onlyBank).toHaveLength(0);
    expect(result.onlyApp).toHaveLength(0);
    expect(result.nearMatches[0].amountDiff).toBeCloseTo(-0.08, 2);
  });

  it("matches PICPAY with Corre via merchant history boost", () => {
    const map = buildMerchantMap(
      [{ description: "Corre", categoryId: "cat_corre" }],
      { picpay: "cat_corre" },
    );
    const imported = [
      {
        id: "b1",
        date: "2026-06-25",
        description: "PICPAY*NICOLLAS DE P",
        amount: 60.67,
      },
    ];
    const appLines = [
      {
        installmentId: "i1",
        purchaseId: "p1",
        date: "2026-06-25",
        description: "Corre",
        amount: 60.67,
        installmentNumber: 1,
        totalInstallments: 1,
        categoryId: "cat_corre",
        categoryName: "Corre",
      },
    ];
    const result = matchInvoiceLines(imported, appLines, { merchantMap: map });
    expect(result.matched).toHaveLength(1);
  });
});

describe("validateAiMatchPairs", () => {
  it("accepts equal amount within date window", () => {
    const bank = [
      { id: "b1", date: "2026-07-06", description: "PICPAY", amount: 60.67 },
    ];
    const app = [
      {
        installmentId: "i1",
        purchaseId: "p1",
        date: "2026-07-05",
        description: "Corre",
        amount: 60.67,
        installmentNumber: 1,
        totalInstallments: 1,
        categoryId: "c1",
        categoryName: "Corre",
      },
    ];
    const links = validateAiMatchPairs(bank, app, [], [
      { importedId: "b1", installmentId: "i1" },
    ]);
    expect(links).toEqual({ b1: "i1" });
  });

  it("rejects amount mismatch beyond tolerance", () => {
    const bank = [
      { id: "b1", date: "2026-07-06", description: "X", amount: 100 },
    ];
    const app = [
      {
        installmentId: "i1",
        purchaseId: "p1",
        date: "2026-07-06",
        description: "Y",
        amount: 50,
        installmentNumber: 1,
        totalInstallments: 1,
        categoryId: "c1",
        categoryName: "Outros",
      },
    ];
    const links = validateAiMatchPairs(bank, app, [], [
      { importedId: "b1", installmentId: "i1" },
    ]);
    expect(links).toEqual({});
  });

  it("rejects near-match without name/installment signal", () => {
    const bank = [
      { id: "b1", date: "2026-07-06", description: "FOO", amount: 100 },
    ];
    const app = [
      {
        installmentId: "i1",
        purchaseId: "p1",
        date: "2026-07-06",
        description: "BAR",
        amount: 100.5,
        installmentNumber: 1,
        totalInstallments: 1,
        categoryId: "c1",
        categoryName: "Outros",
      },
    ];
    const links = validateAiMatchPairs(bank, app, [], [
      { importedId: "b1", installmentId: "i1" },
    ]);
    expect(links).toEqual({});
  });

  it("enforces 1-1 (drops duplicate suggestions)", () => {
    const bank = [
      { id: "b1", date: "2026-07-06", description: "A", amount: 10 },
      { id: "b2", date: "2026-07-06", description: "B", amount: 10 },
    ];
    const app = [
      {
        installmentId: "i1",
        purchaseId: "p1",
        date: "2026-07-06",
        description: "C",
        amount: 10,
        installmentNumber: 1,
        totalInstallments: 1,
        categoryId: "c1",
        categoryName: "Outros",
      },
    ];
    const links = validateAiMatchPairs(bank, app, [], [
      { importedId: "b1", installmentId: "i1" },
      { importedId: "b2", installmentId: "i1" },
    ]);
    expect(links).toEqual({ b1: "i1" });
  });
});

describe("suggestCategory", () => {
  it("uses history when merchant is known", () => {
    const map = buildMerchantMap([], { posto: "cat_transporte" });
    const s = suggestCategory("POSTO PORTAL DE JUNDIAI", CATEGORIES, map);
    expect(s.categoryId).toBe("cat_transporte");
    expect(s.confidence).toBe("high");
    expect(s.source).toBe("history");
  });

  it("uses keywords with high confidence for strong match", () => {
    const s = suggestCategory("POSTO GASOLINA COMBUSTIVEL", CATEGORIES);
    expect(s.categoryId).toBe("cat_transporte");
    expect(s.confidence).toBe("high");
  });

  it("returns low confidence for unknown merchant", () => {
    const s = suggestCategory("LOJA XYZ DESCONHECIDA", CATEGORIES);
    expect(s.confidence).toBe("low");
  });
});

describe("applyManualLinks", () => {
  it("moves manual pairs to matched", () => {
    const onlyBank = {
      id: "b1",
      date: "2026-07-06",
      description: "PICPAY",
      amount: 60.67,
    };
    const onlyApp = {
      installmentId: "i1",
      purchaseId: "p1",
      date: "2026-07-06",
      description: "Corre",
      amount: 60.67,
      installmentNumber: 1,
      totalInstallments: 1,
      categoryId: "cat_corre",
      categoryName: "Corre",
    };
    const forced = {
      matched: [],
      nearMatches: [],
      onlyBank: [onlyBank],
      onlyApp: [onlyApp],
      ambiguous: [],
      totals: { bank: 60.67, app: 60.67, difference: 0 },
    };
    const linked = applyManualLinks(forced, { b1: "i1" });
    expect(linked.matched).toHaveLength(1);
    expect(linked.matched[0].manual).toBe(true);
    expect(linked.onlyBank).toHaveLength(0);
    expect(linked.onlyApp).toHaveLength(0);
  });
});
