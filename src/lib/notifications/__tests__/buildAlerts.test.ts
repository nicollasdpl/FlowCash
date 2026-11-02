import { describe, expect, it, vi } from "vitest";
import { buildFinanceAlerts, formatAlertDigest } from "../buildAlerts";
import { DEFAULT_NOTIFICATION_PREFS } from "../types";
import type { AppState } from "@/context/AppContext";

function baseState(overrides: Partial<AppState> = {}): AppState {
  return {
    userName: "",
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, enabled: true },
    dashboardAccountFilter: false,
    accounts: [],
    transactions: [],
    cards: [],
    purchases: [],
    installments: [],
    goals: [],
    categories: [{ id: "cat1", name: "Moradia", type: "expense", color: "#f00", icon: "Home" }],
    budgets: [],
    merchantCategoryCache: {},
    ...overrides,
  };
}

describe("buildFinanceAlerts", () => {
  it("detecta despesa vencida", () => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    const overdueDate = d.toISOString().split("T")[0]!;
    const alerts = buildFinanceAlerts(
      baseState({
        transactions: [{
          id: "t1",
          accountId: "a1",
          type: "expense",
          amount: 100,
          description: "Luz",
          categoryId: "cat1",
          competenceDate: overdueDate,
          paymentDate: overdueDate,
          status: "pending",
          isRecurring: false,
          origin: "manual",
          createdAt: "",
        }],
      }),
      { ...DEFAULT_NOTIFICATION_PREFS, enabled: true },
    );

    expect(alerts.some(a => a.kind === "overdue")).toBe(true);
  });

  it("detecta receita a receber hoje", () => {
    const today = new Date().toISOString().split("T")[0]!;
    const alerts = buildFinanceAlerts(
      baseState({
        transactions: [{
          id: "t2",
          accountId: "a1",
          type: "income",
          amount: 500,
          description: "Salário",
          categoryId: "cat1",
          competenceDate: today,
          paymentDate: today,
          status: "pending",
          isRecurring: false,
          origin: "manual",
          createdAt: "",
        }],
      }),
      { ...DEFAULT_NOTIFICATION_PREFS, enabled: true },
    );

    expect(alerts.some(a => a.kind === "incomeToday")).toBe(true);
  });

  it("agrupa digest", () => {
    const digest = formatAlertDigest([
      { id: "1", kind: "dueToday", line: "Vence hoje: Luz", priority: 2 },
      { id: "2", kind: "dueTomorrow", line: "Vence amanhã: Água", priority: 5 },
    ]);
    expect(digest.title).toBeTruthy();
    expect(digest.body).toContain("Luz");
  });

  it("avisa somente a parte pessoal da fatura", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T12:00:00"));
    try {
      const card = {
        id: "card", name: "Cartão", lastDigits: "1234", brand: "Visa",
        totalLimit: 1000, closingDay: 2, dueDay: 3,
        paymentAccountId: "account", color: "#000", active: true,
      };
      const purchases = [
        { id: "mine", cardId: "card", amount: 100, description: "Mercado", categoryId: "cat1", purchaseDate: "2026-11-01", totalInstallments: 1, createdAt: "" },
        { id: "mother", cardId: "card", amount: 200, description: "Gasolina", categoryId: "", purchaseDate: "2026-11-01", totalInstallments: 1, responsiblePerson: "Mãe", createdAt: "" },
      ];
      const installments = purchases.map(p => ({
        id: p.id, purchaseId: p.id, cardId: card.id, installmentNumber: 1,
        totalInstallments: 1, amount: p.amount, competenceMonth: "2026-11", paid: false,
      }));
      const prefs = { ...DEFAULT_NOTIFICATION_PREFS, enabled: true };

      const mixed = buildFinanceAlerts(baseState({ cards: [card], purchases, installments }), prefs);
      expect(mixed.find(a => a.kind === "cardInvoiceDue")?.line).toContain("R$ 100,00");
      expect(mixed.find(a => a.kind === "cardInvoiceDue")?.line).not.toContain("300,00");

      const onlyMother = buildFinanceAlerts(baseState({
        cards: [card], purchases: [purchases[1]], installments: [installments[1]],
      }), prefs);
      expect(onlyMother.some(a => a.kind === "cardInvoiceDue")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
