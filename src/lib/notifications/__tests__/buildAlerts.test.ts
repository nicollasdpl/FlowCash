import { describe, expect, it } from "vitest";
import { buildFinanceAlerts, formatAlertDigest } from "../buildAlerts";
import { DEFAULT_NOTIFICATION_PREFS } from "../types";
import type { AppState } from "@/context/AppContext";

function baseState(overrides: Partial<AppState> = {}): AppState {
  return {
    userName: "",
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, enabled: true },
    accounts: [],
    transactions: [],
    cards: [],
    purchases: [],
    installments: [],
    goals: [],
    categories: [{ id: "cat1", name: "Moradia", type: "expense", color: "#f00", icon: "Home" }],
    budgets: [],
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
});
