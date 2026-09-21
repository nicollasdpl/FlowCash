import { describe, expect, it } from "vitest";
import { isDestructiveOverwrite, isEmptyAppState, stateRichness } from "@/lib/syncGuards";

function fakeState(n: {
  accounts?: number;
  transactions?: number;
  purchases?: number;
  installments?: number;
  cards?: number;
  goals?: number;
  budgets?: number;
}) {
  const arr = (len = 0) => Array.from({ length: len }, (_, i) => ({ id: String(i) }));
  return {
    accounts: arr(n.accounts ?? 0),
    transactions: arr(n.transactions ?? 0),
    purchases: arr(n.purchases ?? 0),
    installments: arr(n.installments ?? 0),
    cards: arr(n.cards ?? 0),
    goals: arr(n.goals ?? 0),
    budgets: arr(n.budgets ?? 0),
  };
}

describe("syncGuards", () => {
  it("detecta estado vazio", () => {
    expect(isEmptyAppState(fakeState({}))).toBe(true);
    expect(isEmptyAppState(fakeState({ accounts: 1 }))).toBe(false);
  });

  it("bloqueia seed vazio sobre remoto rico", () => {
    const remote = fakeState({ accounts: 2, transactions: 50, purchases: 100, cards: 2 });
    const local = fakeState({});
    expect(stateRichness(remote)).toBeGreaterThan(8);
    expect(isDestructiveOverwrite(local, remote)).toBe(true);
  });

  it("bloqueia local com menos da metade do remoto rico", () => {
    const remote = fakeState({ transactions: 100, purchases: 100, installments: 100 });
    const local = fakeState({ transactions: 10, purchases: 10 });
    expect(isDestructiveOverwrite(local, remote)).toBe(true);
  });

  it("permite escrita normal (local ≈ remoto)", () => {
    const remote = fakeState({ transactions: 100, purchases: 100 });
    const local = fakeState({ transactions: 101, purchases: 100 });
    expect(isDestructiveOverwrite(local, remote)).toBe(false);
  });
});
