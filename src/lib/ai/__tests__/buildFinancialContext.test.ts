import { describe, expect, it } from "vitest";
import { buildFinancialContext } from "../buildFinancialContext";

describe("buildFinancialContext", () => {
  it("calcula despesas via competência e receitas via pagamento no mês", () => {
    const ctx = buildFinancialContext({
      accounts: [
        { id: "acc1", name: "Nubank", initialBalance: 1000, active: true, initialDate: "2026-01-01" },
      ],
      transactions: [
        {
          id: "tx1",
          accountId: "acc1",
          type: "expense",
          amount: 50,
          description: "Mercado",
          categoryId: "cat_food",
          competenceDate: "2026-06-10",
          paymentDate: "2026-06-10",
          status: "paid",
        },
        {
          id: "tx2",
          accountId: "acc1",
          type: "income",
          amount: 3000,
          description: "Salário",
          categoryId: "cat_salary",
          competenceDate: "2026-06-05",
          paymentDate: "2026-06-05",
          status: "paid",
        },
      ],
      categories: [
        { id: "cat_food", name: "Alimentação" },
        { id: "cat_salary", name: "Salário" },
      ],
      budgets: [{ categoryId: "cat_food", month: "2026-06", limitAmount: 600 }],
    });

    expect(ctx.summary.expenses).toBe(50);
    expect(ctx.summary.income).toBe(3000);
    expect(ctx.byCategory[0]?.name).toBe("Alimentação");
    expect(ctx.byCategory[0]?.budgetRemaining).toBe(550);
    expect(ctx.summary.balance).toBe(3950);
  });

  it("inclui alertas de orçamento estourado", () => {
    const ctx = buildFinancialContext({
      accounts: [{ id: "acc1", name: "Conta", initialBalance: 0, active: true }],
      transactions: [
        {
          id: "tx1",
          accountId: "acc1",
          type: "expense",
          amount: 700,
          description: "Mercado",
          categoryId: "cat_food",
          competenceDate: "2026-06-01",
          paymentDate: "2026-06-01",
          status: "paid",
        },
      ],
      categories: [{ id: "cat_food", name: "Alimentação" }],
      budgets: [{ categoryId: "cat_food", month: ctxMonth(), limitAmount: 600 }],
    });

    expect(ctx.budgetAlerts.length).toBe(1);
    expect(ctx.budgetAlerts[0]?.overBy).toBe(100);
  });
});

function ctxMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
