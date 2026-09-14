import { describe, expect, it } from "vitest";
import { __testItemsToLines } from "../extractPdfText";
import { parseBradescoExtract } from "../parseBradescoExtract";

describe("extractPdfText line grouping", () => {
  it("keeps same-Y items on one line left-to-right", () => {
    const text = __testItemsToLines([
      { str: "08/07", transform: [1, 0, 0, 1, 10, 200] },
      { str: "EDCAS COMERCIO", transform: [1, 0, 0, 1, 50, 200] },
      { str: "64,80", transform: [1, 0, 0, 1, 300, 200] },
      { str: "07/07", transform: [1, 0, 0, 1, 10, 180] },
      { str: "FARMA ROMA", transform: [1, 0, 0, 1, 50, 180] },
      { str: "18,00", transform: [1, 0, 0, 1, 300, 180] },
    ]);
    expect(text).toContain("08/07 EDCAS COMERCIO 64,80");
    expect(text).toContain("07/07 FARMA ROMA 18,00");
    const lines = parseBradescoExtract(text, 2026);
    expect(lines.map(l => l.amount).sort((a, b) => a - b)).toEqual([18, 64.8]);
  });
});
