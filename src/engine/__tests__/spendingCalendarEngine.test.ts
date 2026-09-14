import { describe, expect, it } from "vitest";
import {
  buildDailySpendingMap,
  groupByDescription,
  installmentCalendarDay,
} from "@/engine/spendingCalendarEngine";
import type { Transaction, CardInstallment, CardPurchase, Category } from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";

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

    expect(map["2026-06-10"].expenseTotal).toBe(50);
    expect(map["2026-06-10"].total).toBe(50);
    expect(map["2026-06-05"].expenseTotal).toBe(100);
  });

  it("modo pagamento só inclui transações pagas na paymentDate", () => {
    const transactions = [
      tx({ id: "t1", amount: 30, description: "Pago", paymentDate: "2026-06-12", status: "paid" }),
      tx({ id: "t2", amount: 99, description: "Pendente", paymentDate: "2026-06-18", status: "pending" }),
    ];

    const map = buildDailySpendingMap("2026-06", transactions, [], [], "payment");

    expect(map["2026-06-12"]?.expenseTotal).toBe(30);
    expect(map["2026-06-18"]).toBeUndefined();
  });

  it("soma receita e despesa no mesmo dia com net = income - expense", () => {
    const transactions = [
      tx({
        id: "t1", amount: 100, description: "Almoço",
        type: "expense", competenceDate: "2026-06-10", categoryId: "food",
      }),
      tx({
        id: "t2", amount: 500, description: "Salário",
        type: "income", competenceDate: "2026-06-10", categoryId: "salary",
      }),
    ];

    const map = buildDailySpendingMap("2026-06", transactions, [], [], "competence");
    const day = map["2026-06-10"];

    expect(day.expenseTotal).toBe(100);
    expect(day.incomeTotal).toBe(500);
    expect(day.net).toBe(400);
    expect(day.items).toHaveLength(2);
  });

  it("exclui receita com excludeFromReports", () => {
    const categories: Pick<Category, "id" | "excludeFromReports">[] = [
      { id: "loan", excludeFromReports: true },
      { id: "salary" },
    ];
    const transactions = [
      tx({
        id: "t1", amount: 1000, description: "Empréstimo",
        type: "income", competenceDate: "2026-06-05", categoryId: "loan",
      }),
      tx({
        id: "t2", amount: 3000, description: "Salário",
        type: "income", competenceDate: "2026-06-05", categoryId: "salary",
      }),
    ];

    const map = buildDailySpendingMap(
      "2026-06", transactions, [], [], "competence", { categories },
    );

    expect(map["2026-06-05"].incomeTotal).toBe(3000);
    expect(map["2026-06-05"].items.map(i => i.description)).toEqual(["Salário"]);
  });

  it("exclui pagamento de fatura das despesas", () => {
    const transactions = [
      tx({
        id: "t1", amount: 800, description: "Pagamento Fatura",
        categoryId: SEED_INVOICE_PAYMENT_CATEGORY_ID,
        competenceDate: "2026-06-08",
      }),
      tx({
        id: "t2", amount: 40, description: "Café",
        categoryId: "food",
        competenceDate: "2026-06-08",
      }),
    ];

    const map = buildDailySpendingMap("2026-06", transactions, [], [], "competence");
    expect(map["2026-06-08"].expenseTotal).toBe(40);
  });

  it("filtra por categoryId só despesas da categoria", () => {
    const transactions = [
      tx({
        id: "t1", amount: 50, description: "Ifood",
        categoryId: "food", competenceDate: "2026-06-10",
      }),
      tx({
        id: "t2", amount: 20, description: "Uber",
        categoryId: "transport", competenceDate: "2026-06-10",
      }),
      tx({
        id: "t3", amount: 1000, description: "Salário",
        type: "income", categoryId: "salary", competenceDate: "2026-06-10",
      }),
    ];

    const map = buildDailySpendingMap(
      "2026-06", transactions, [], [], "competence", { categoryId: "food" },
    );

    expect(map["2026-06-10"].expenseTotal).toBe(50);
    expect(map["2026-06-10"].incomeTotal).toBe(0);
    expect(map["2026-06-10"].items).toHaveLength(1);
  });
});

describe("groupByDescription", () => {
  it("agrupa IFOOD e ifood na mesma chave e soma valores", () => {
    const groups = groupByDescription([
      { description: "IFOOD", amount: 40 },
      { description: "ifood", amount: 25 },
      { description: "Mercado", amount: 100 },
    ]);

    expect(groups[0]).toMatchObject({ key: "mercado", amount: 100, count: 1 });
    expect(groups[1]).toMatchObject({ key: "ifood", amount: 65, count: 2 });
  });

  it("escolhe o rótulo mais frequente", () => {
    const groups = groupByDescription([
      { description: "ifood", amount: 10 },
      { description: "Ifood", amount: 10 },
      { description: "Ifood", amount: 10 },
    ]);

    expect(groups[0].label).toBe("Ifood");
    expect(groups[0].amount).toBe(30);
  });
});
