import { describe, expect, it } from "vitest";
import {
  getConsumptionByCategory,
  getConsumptionMonth,
} from "../consumptionByCategory";
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

describe("getConsumptionMonth", () => {
  it("à vista usa mês da purchaseDate mesmo com competenceMonth na fatura seguinte", () => {
    const p = purchase({ id: "p1", amount: 30, purchaseDate: "2026-06-19" });
    const i = inst({ id: "i1", purchaseId: "p1", amount: 30, competenceMonth: "2026-07" });
    expect(getConsumptionMonth(p, i)).toBe("2026-06");
  });

  it("parcelado usa mês civil a partir da compra", () => {
    const p = purchase({
      id: "p1",
      amount: 1200,
      purchaseDate: "2026-06-15",
      totalInstallments: 12,
    });
    expect(getConsumptionMonth(p, inst({
      id: "i1", purchaseId: "p1", amount: 100,
      installmentNumber: 1, totalInstallments: 12, competenceMonth: "2026-06",
    }))).toBe("2026-06");
    expect(getConsumptionMonth(p, inst({
      id: "i2", purchaseId: "p1", amount: 100,
      installmentNumber: 2, totalInstallments: 12, competenceMonth: "2026-07",
    }))).toBe("2026-07");
  });
});

describe("getConsumptionByCategory", () => {
  it("compra à vista após fechamento conta no mês da purchaseDate (jun), não jul", () => {
    const purchases = [purchase({ id: "p1", amount: 30, purchaseDate: "2026-06-19" })];
    const installments = [inst({ id: "i1", purchaseId: "p1", amount: 30, competenceMonth: "2026-07" })];
    expect(getConsumptionByCategory("2026-06", [], installments, purchases)).toEqual({ "cat-card": 30 });
    expect(getConsumptionByCategory("2026-07", [], installments, purchases)).toEqual({});
  });

  it("jun + jul somam o total da compra parcelada", () => {
    const purchases = [purchase({
      id: "p1",
      amount: 1200,
      purchaseDate: "2026-06-15",
      totalInstallments: 12,
    })];
    const installments: CardInstallment[] = Array.from({ length: 12 }, (_, i) => inst({
      id: `i${i + 1}`,
      purchaseId: "p1",
      amount: 100,
      installmentNumber: i + 1,
      totalInstallments: 12,
      competenceMonth: `2026-${String(7 + i).padStart(2, "0")}`.replace("2026-13", "2027-01"),
    }));
    // competence months don't matter for consumo — only purchaseDate calendar spread
    installments[0].competenceMonth = "2026-07";
    installments[1].competenceMonth = "2026-08";

    const jun = getConsumptionByCategory("2026-06", [], installments, purchases)["cat-card"] ?? 0;
    const jul = getConsumptionByCategory("2026-07", [], installments, purchases)["cat-card"] ?? 0;
    expect(jun + jul).toBe(200);
  });

  it("parcelado distribui por mês civil a partir da compra", () => {
    const purchases = [purchase({
      id: "p1",
      amount: 1200,
      purchaseDate: "2026-06-15",
      totalInstallments: 12,
    })];
    const installments: CardInstallment[] = Array.from({ length: 12 }, (_, i) => inst({
      id: `i${i + 1}`,
      purchaseId: "p1",
      amount: 100,
      installmentNumber: i + 1,
      totalInstallments: 12,
      competenceMonth: "2026-07",
    }));
    expect(getConsumptionByCategory("2026-06", [], installments, purchases)["cat-card"]).toBe(100);
    expect(getConsumptionByCategory("2026-07", [], installments, purchases)["cat-card"]).toBe(100);
    expect(getConsumptionByCategory("2027-06", [], installments, purchases)).toEqual({});
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

  it("não duplica assinatura via parcelas de fatura", () => {
    const purchases = [purchase({
      id: "sub1",
      amount: 55,
      purchaseDate: "2026-01-10",
      isSubscription: true,
    })];
    const installments = [inst({
      id: "sub1_sub_2026-06",
      purchaseId: "sub1",
      amount: 55,
      competenceMonth: "2026-06",
    })];
    expect(getConsumptionByCategory("2026-06", [], installments, purchases)).toEqual({ "cat-card": 55 });
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
