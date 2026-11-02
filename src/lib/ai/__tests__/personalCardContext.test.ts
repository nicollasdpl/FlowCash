import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFinancialContext } from "../buildFinancialContext";
import { formatFinancialContextBlock } from "../formatFinancialContextBlock";
import { tryLocalAnswer } from "../localAnswers";

afterEach(() => vi.useRealTimers());

describe("contexto pessoal do cartão", () => {
  it("distingue minha parte do total bancário e omite compras de terceiros do histórico pessoal", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T12:00:00"));

    const ctx = buildFinancialContext({
      accounts: [], transactions: [], categories: [], budgets: [],
      cards: [{ id: "card", name: "Cartão", brand: "Visa", totalLimit: 1000,
        closingDay: 10, dueDay: 20, paymentAccountId: "account", active: true }],
      purchases: [
        { id: "mine", cardId: "card", amount: 100, description: "Mercado", categoryId: "cat", purchaseDate: "2026-11-01" },
        { id: "mother", cardId: "card", amount: 200, description: "Gasolina", categoryId: "", purchaseDate: "2026-11-01", responsiblePerson: "Mãe" },
      ],
      installments: [
        { id: "i1", purchaseId: "mine", cardId: "card", amount: 100, competenceMonth: "2026-11", paid: false },
        { id: "i2", purchaseId: "mother", cardId: "card", amount: 200, competenceMonth: "2026-11", paid: false },
      ],
    });

    expect(ctx.cards[0]).toMatchObject({ personalInvoiceAmount: 100, currentInvoiceAmount: 300 });
    expect(ctx.recentPurchases.map(p => p.description)).toEqual(["Mercado"]);
    expect(tryLocalAnswer("qual a fatura do cartão", ctx)).toContain("100,00");
    expect(formatFinancialContextBlock(ctx)).toContain("minha parte a pagar");
  });
});
