import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { parseBradescoExtract } from "../parseBradescoExtract";

describe("real bradesco pdf fixture", () => {
  it("parses charges totaling ~1708.83", () => {
    const text = readFileSync(
      resolve(__dirname, "fixtures/bradesco-extrato-sample.txt"),
      "utf8",
    );
    const lines = parseBradescoExtract(text, 2026);
    const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    expect(lines.length).toBeGreaterThanOrEqual(40);
    expect(total).toBeCloseTo(1708.83, 1);
  });
});
