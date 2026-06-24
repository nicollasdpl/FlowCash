import { describe, expect, it } from "vitest";
import { getConsumptionByCategory } from "../consumptionByCategory";
import type { Transaction, CardPurchase, CardInstallment } from "@/types/financial";
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

const inst = (
  partial: Partial<CardInstallment> & Pick<CardInstallment, "id" | "purchaseId" | "amount">,
): CardInstallment => ({
  cardId: "c1",
  installmentNumber: 1,
  totalInstallments: 1,
  competenceMonth: "2026-07",
  paid: false,
  ...partial,
});

describe("getConsumptionByCategory", () => {
  it("compra à vista após fechamento conta no mês da purchaseDate (jun), não jul", () => {
    const purchases = [purchase({ id: "p1", amount: 30, purchaseDate: "2026-06-19" })];
    const installments = [inst({ id: "i1", purchaseId: "p1", amount: 30, competenceMonth: "2026-07" })];
    expect(getConsumptionByCategory("2026-06", [], installments, purchases)).toEqual({ "cat-card": 30 });
    expect(getConsumptionByCategory("2026-07", [], installments, purchases)).toEqual({});
  });

  it("parcelado entra integral no mês da compra, sem espalhar nos meses seguintes", () => {
    const purchases = [purchase({
      id: "p1",
      amount: 1200,
      purchaseDate: "2026-06-15",
      totalInstallments: 12,
    })];
    expect(getConsumptionByCategory("2026-06", [], [], purchases)).toEqual({ "cat-card": 1200 });
    expect(getConsumptionByCategory("2026-07", [], [], purchases)).toEqual({});
  });

  it("compra de maio parcelada não aparece em junho no consumo real", () => {
    const purchases = [purchase({
      id: "p1",
      amount: 981.72,
      purchaseDate: "2026-05-20",
      totalInstallments: 12,
    })];
    const installments: CardInstallment[] = Array.from({ length: 12 }, (_, i) => inst({
      id: `i${i + 1}`,
      purchaseId: "p1",
      amount: 81.81,
      installmentNumber: i + 1,
      totalInstallments: 12,
      competenceMonth: "2026-07",
    }));
    expect(getConsumptionByCategory("2026-06", [], installments, purchases)).toEqual({});
    expect(getConsumptionByCategory("2026-05", [], installments, purchases)).toEqual({ "cat-card": 981.72 });
  });

  it("assinatura conta todo mês a partir do purchaseMonth", () => {
    const purchases = [purchase({
      id: "sub1",
      amount: 55,
      purchaseDate: "2026-01-10",
      isSubscription: true,
    })];
    expect(getConsumptionByCategory("2025-12", [], [], purchases)).toEqual({});
    expect(getConsumptionByCategory("2026-01", [], [], purchases)).toEqual({ "cat-card": 55 });
    expect(getConsumptionByCategory("2026-06", [], [], purchases)).toEqual({ "cat-card": 55 });
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
    expect(getConsumptionByCategory("2026-06", transactions, [], [])).toEqual({ cat1: 50 });
  });
});
