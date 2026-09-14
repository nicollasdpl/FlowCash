import { describe, expect, it } from "vitest";
import {
  buildDailySpendingMap,
  installmentCalendarDay,
} from "@/engine/spendingCalendarEngine";
import type { Transaction, CardInstallment, CardPurchase } from "@/types/financial";

const tx = (partial: Partial<Transaction> & Pick<Transaction, "id" | "amount" | "description">): Transaction => ({
  accountId: "a1",
  type: "expense",
  categoryId: "cat1",
  competenceDate: "2026-06-15",
  paymentDate: "2026-06-20",
  status: "paid",
  isRecurring: false,
  origin: "manual",
  createdAt: "2026-06-01",
  ...partial,
});

describe("installmentCalendarDay", () => {
  it("usa o dia da compra no mês da competência", () => {
    expect(installmentCalendarDay("2026-06", "2026-05-19")).toBe("2026-06-19");
  });

  it("clamp quando o mês tem menos dias", () => {
    expect(installmentCalendarDay("2026-02", "2026-01-31")).toBe("2026-02-28");
  });
});

describe("buildDailySpendingMap", () => {
  it("agrupa despesa por competenceDate e parcela no dia da compra", () => {
    const transactions = [
      tx({ id: "t1", amount: 50, description: "Mercado", competenceDate: "2026-06-10" }),
    ];
    const purchases: CardPurchase[] = [{
      id: "p1", cardId: "c1", amount: 200, description: "TV",
      categoryId: "cat1", purchaseDate: "2026-06-05", totalInstallments: 2,
      createdAt: "2026-06-05",
    }];
    const installments: CardInstallment[] = [{
      id: "i1", purchaseId: "p1", cardId: "c1",
      installmentNumber: 1, totalInstallments: 2, amount: 100,
      competenceMonth: "2026-06", paid: false,
    }];

    const map = buildDailySpendingMap("2026-06", transactions, installments, purchases, "competence");

    expect(map["2026-06-10"].total).toBe(50);
    expect(map["2026-06-05"].total).toBe(100);
  });

  it("modo pagamento só inclui transações pagas na paymentDate", () => {
    const transactions = [
      tx({ id: "t1", amount: 30, description: "Pago", paymentDate: "2026-06-12", status: "paid" }),
      tx({ id: "t2", amount: 99, description: "Pendente", paymentDate: "2026-06-18", status: "pending" }),
    ];

    const map = buildDailySpendingMap("2026-06", transactions, [], [], "payment");

    expect(map["2026-06-12"]?.total).toBe(30);
    expect(map["2026-06-18"]).toBeUndefined();
  });
});
