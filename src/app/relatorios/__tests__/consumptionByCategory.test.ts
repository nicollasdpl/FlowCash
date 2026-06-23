import { describe, expect, it } from "vitest";
import { getConsumptionByCategory } from "../consumptionByCategory";
import type { Transaction, CardPurchase } from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";

const tx = (partial: Partial<Transaction> & Pick<Transaction, "id" | "amount">): Transaction => ({
  accountId: "a1",
  type: "expense",
  categoryId: "cat1",
  description: "Test",
  competenceDate: "2026-06-15",
  paymentDate: "2026-06-15",
  status: "paid",
  isRecurring: false,
  origin: "manual",
  createdAt: "2026-06-01",
  ...partial,
});

const purchase = (partial: Partial<CardPurchase> & Pick<CardPurchase, "id" | "amount">): CardPurchase => ({
  cardId: "c1",
  description: "Test",
  categoryId: "cat-card",
  purchaseDate: "2026-06-19",
  totalInstallments: 1,
  createdAt: "2026-06-19",
  ...partial,
});

describe("getConsumptionByCategory", () => {
  it("compra à vista após fechamento conta no mês da purchaseDate (jun), não jul", () => {
    const purchases = [purchase({ id: "p1", amount: 30, purchaseDate: "2026-06-19" })];
    expect(getConsumptionByCategory("2026-06", [], purchases)).toEqual({ "cat-card": 30 });
    expect(getConsumptionByCategory("2026-07", [], purchases)).toEqual({});
  });

  it("parcelado distribui por mês civil a partir da compra", () => {
    const purchases = [purchase({
      id: "p1",
      amount: 1200,
      purchaseDate: "2026-06-15",
      totalInstallments: 12,
    })];
    expect(getConsumptionByCategory("2026-06", [], purchases)["cat-card"]).toBe(100);
    expect(getConsumptionByCategory("2026-07", [], purchases)["cat-card"]).toBe(100);
    expect(getConsumptionByCategory("2027-05", [], purchases)["cat-card"]).toBe(100);
    expect(getConsumptionByCategory("2027-06", [], purchases)).toEqual({});
  });

  it("assinatura conta todo mês a partir do purchaseMonth", () => {
    const purchases = [purchase({
      id: "sub1",
      amount: 55,
      purchaseDate: "2026-01-10",
      isSubscription: true,
    })];
    expect(getConsumptionByCategory("2025-12", [], purchases)).toEqual({});
    expect(getConsumptionByCategory("2026-01", [], purchases)).toEqual({ "cat-card": 55 });
    expect(getConsumptionByCategory("2026-06", [], purchases)).toEqual({ "cat-card": 55 });
  });

  it("inclui transactions por competenceDate e exclui pagamento de fatura", () => {
    const transactions = [
      tx({ id: "t1", amount: 50, competenceDate: "2026-06-10", categoryId: "cat1" }),
      tx({
        id: "t2",
        amount: 500,
        competenceDate: "2026-06-20",
        categoryId: SEED_INVOICE_PAYMENT_CATEGORY_ID,
      }),
    ];
    expect(getConsumptionByCategory("2026-06", transactions, [])).toEqual({ cat1: 50 });
  });
});
