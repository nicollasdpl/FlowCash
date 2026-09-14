import { describe, expect, it } from "vitest";
import { currentMonth, endOfMonth, projectionHorizon } from "@/engine/financialEngine";

describe("projectionHorizon", () => {
  it("keeps the current month when browsing a past month", () => {
    const cm = currentMonth();
    expect(projectionHorizon("2020-01")).toBe(endOfMonth(cm));
  });

  it("uses the selected month when it is current or future", () => {
    const cm = currentMonth();
    expect(projectionHorizon(cm)).toBe(endOfMonth(cm));
    expect(projectionHorizon("2099-12")).toBe("2099-12-31");
  });
});
