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
  categoryId: "cat-corre",
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
  it("parcelado usa valor da parcela por mes de fatura, nao o total da compra", () => {
    const purchases = [purchase({
      id: "p1",
      amount: 200,
      purchaseDate: "2026-06-01",
      totalInstallments: 20,
    })];
    const installments = [
      inst({ id: "i1", purchaseId: "p1", amount: 10, installmentNumber: 1, totalInstallments: 20, competenceMonth: "2026-06" }),
      inst({ id: "i2", purchaseId: "p1", amount: 10, installmentNumber: 2, totalInstallments: 20, competenceMonth: "2026-07" }),
    ];
    expect(getConsumptionByCategory("2026-06", [], installments, purchases)).toEqual({ "cat-corre": 10 });
    expect(getConsumptionByCategory("2026-07", [], installments, purchases)).toEqual({ "cat-corre": 10 });
  });

  it("compra em junho com fatura jul (nubank) entra em julho, nao junho", () => {
    const purchases = [purchase({ id: "p1", amount: 48.76, purchaseDate: "2026-06-22" })];
    const installments = [inst({ id: "i1", purchaseId: "p1", amount: 48.76, competenceMonth: "2026-07" })];
    expect(getConsumptionByCategory("2026-06", [], installments, purchases)).toEqual({});
    expect(getConsumptionByCategory("2026-07", [], installments, purchases)).toEqual({ "cat-corre": 48.76 });
  });

  it("junho + jul somam compras de faturas distintas (ex. corre)", () => {
    const purchases = [
      purchase({ id: "p1", amount: 60.14, purchaseDate: "2026-06-15", cardId: "bradesco" }),
      purchase({ id: "p2", amount: 48.76, purchaseDate: "2026-06-22", cardId: "nubank" }),
    ];
    const installments = [
      inst({ id: "i1", purchaseId: "p1", amount: 60.14, competenceMonth: "2026-06", cardId: "bradesco" }),
      inst({ id: "i2", purchaseId: "p2", amount: 48.76, competenceMonth: "2026-07", cardId: "nubank" }),
    ];
    const jun = getConsumptionByCategory("2026-06", [], installments, purchases)["cat-corre"] ?? 0;
    const jul = getConsumptionByCategory("2026-07", [], installments, purchases)["cat-corre"] ?? 0;
    expect(jun).toBe(60.14);
    expect(jul).toBe(48.76);
    expect(jun + jul).toBe(60.14 + 48.76);
  });

  it("ignora lancamento manual duplicado do cartao", () => {
    const purchases = [purchase({ id: "p1", amount: 30, purchaseDate: "2026-06-03" })];
    const installments = [inst({ id: "i1", purchaseId: "p1", amount: 30, competenceMonth: "2026-06" })];
    const transactions = [
      tx({ id: "t1", amount: 30, competenceDate: "2026-06-03", categoryId: "cat-corre", description: "corre dup" }),
    ];
    expect(getConsumptionByCategory("2026-06", transactions, installments, purchases)).toEqual({ "cat-corre": 30 });
  });

  it("mantem lancamento manual sem par no cartao", () => {
    const transactions = [
      tx({ id: "t1", amount: 58, competenceDate: "2026-06-01", categoryId: "cat-corre" }),
    ];
    expect(getConsumptionByCategory("2026-06", transactions, [], [])).toEqual({ "cat-corre": 58 });
  });

  it("exclui pagamento de fatura", () => {
    const transactions = [
      tx({
        id: "t1",
        amount: 500,
        competenceDate: "2026-06-20",
        categoryId: SEED_INVOICE_PAYMENT_CATEGORY_ID,
      }),
    ];
    expect(getConsumptionByCategory("2026-06", transactions, [], [])).toEqual({});
  });
});
