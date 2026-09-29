import { describe, expect, it } from "vitest";
import {
  buildReportActions,
  getBudgetPace,
  getCategoryOutliers,
  getFutureCommitments,
  getMonthlyResults,
  getRecurringCosts,
  localDateStr,
  type MonthResult,
} from "@/engine/reportInsightsEngine";
import type { Budget, CardInstallment, CardPurchase, Category, Transaction } from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID, SEED_LOAN_INCOME_CATEGORY_ID } from "@/types/financial";

const tx = (partial: Partial<Transaction> & Pick<Transaction, "id" | "amount">): Transaction => ({
  accountId: "a1",
  type: "expense",
  description: partial.id,
  categoryId: "food",
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
  description: partial.id,
  categoryId: "shop",
  purchaseDate: "2026-06-05",
  totalInstallments: 1,
  createdAt: "2026-06-05",
  ...partial,
});

const inst = (partial: Partial<CardInstallment> & Pick<CardInstallment, "id" | "purchaseId" | "amount" | "competenceMonth">): CardInstallment => ({
  cardId: "c1",
  installmentNumber: 1,
  totalInstallments: 1,
  paid: false,
  ...partial,
});

const categories: Category[] = [
  { id: "salary", name: "Salário", type: "income", color: "#0f0", icon: "" },
  { id: SEED_LOAN_INCOME_CATEGORY_ID, name: "Empréstimo", type: "income", color: "#0f0", icon: "", excludeFromReports: true },
  { id: "food", name: "Delivery", type: "expense", color: "#f00", icon: "" },
];

describe("getMonthlyResults", () => {
  it("receita ignora empréstimo e despesa ignora pagamento de fatura mas conta parcelas", () => {
    const transactions = [
      tx({ id: "sal", type: "income", categoryId: "salary", amount: 5000 }),
      tx({ id: "loan", type: "income", categoryId: SEED_LOAN_INCOME_CATEGORY_ID, amount: 2000 }),
      tx({ id: "food", amount: 300 }),
      tx({ id: "fatura", amount: 900, categoryId: SEED_INVOICE_PAYMENT_CATEGORY_ID }),
    ];
    const purchases = [purchase({ id: "p1", amount: 400 })];
    const installments = [inst({ id: "i1", purchaseId: "p1", amount: 400, competenceMonth: "2026-06" })];

    const [r] = getMonthlyResults(["2026-06"], transactions, installments, purchases, categories);
    expect(r.income).toBe(5000);
    expect(r.expense).toBe(700);
    expect(r.net).toBe(4300);
    expect(r.savingsRate).toBeCloseTo(0.86);
  });

  it("taxa de poupança é null sem receita", () => {
    const [r] = getMonthlyResults(["2026-06"], [tx({ id: "x", amount: 10 })], [], [], categories);
    expect(r.savingsRate).toBeNull();
  });
});

describe("getCategoryOutliers", () => {
  it("aponta excesso sobre a média dos meses anteriores com dados", () => {
    const transactions = [
      tx({ id: "m3", amount: 200, competenceDate: "2026-03-10" }),
      tx({ id: "m4", amount: 200, competenceDate: "2026-04-10" }),
      tx({ id: "m5", amount: 200, competenceDate: "2026-05-10" }),
      tx({ id: "m6", amount: 500, competenceDate: "2026-06-10" }),
      tx({ id: "rent6", amount: 1000, categoryId: "rent", competenceDate: "2026-06-05" }),
      tx({ id: "rent5", amount: 990, categoryId: "rent", competenceDate: "2026-05-05" }),
      tx({ id: "rent4", amount: 990, categoryId: "rent", competenceDate: "2026-04-05" }),
      tx({ id: "rent3", amount: 990, categoryId: "rent", competenceDate: "2026-03-05" }),
    ];
    const out = getCategoryOutliers("2026-06", transactions, [], []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ categoryId: "food", current: 500, average: 200, excess: 300, monthsCompared: 3 });
    expect(out[0].pct).toBeCloseTo(1.5);
  });

  it("sem histórico não aponta nada (usuário novo)", () => {
    const out = getCategoryOutliers("2026-06", [tx({ id: "a", amount: 999 })], [], []);
    expect(out).toEqual([]);
  });

  it("categoria nova vira gasto novo com média zero", () => {
    const transactions = [
      tx({ id: "old", amount: 100, competenceDate: "2026-05-10" }),
      tx({ id: "new", amount: 250, categoryId: "travel", competenceDate: "2026-06-10" }),
    ];
    const out = getCategoryOutliers("2026-06", transactions, [], []);
    expect(out[0]).toMatchObject({ categoryId: "travel", average: 0, excess: 250, pct: null });
  });
});

describe("getBudgetPace", () => {
  const budgets: Budget[] = [
    { id: "b1", categoryId: "food", limitAmount: 600, month: "2026-06" },
    { id: "b2", categoryId: "rent", limitAmount: 1000, month: "2026-06" },
  ];

  it("projeta pelo ritmo e estima o dia do estouro", () => {
    const pace = getBudgetPace(budgets, { food: 400, rent: 100 }, "2026-06", "2026-06-10");
    const food = pace.find(p => p.budgetId === "b1")!;
    expect(food.status).toBe("risk");
    expect(food.projected).toBeCloseTo(1200);
    expect(food.overDay).toBe(15);
    expect(food.perDayLeft).toBeCloseTo(200 / 21);
    expect(pace[0].budgetId).toBe("b1");
  });

  it("marca estourado e mês fechado não projeta", () => {
    const [food] = getBudgetPace(budgets, { food: 700 }, "2026-06", "2026-07-02");
    expect(food.status).toBe("over");
    expect(food.projected).toBe(700);
    expect(food.isCurrentMonth).toBe(false);
  });
});

describe("getFutureCommitments", () => {
  it("ignora parcelas pagas, separa assinaturas e calcula quando liberam", () => {
    const purchases = [
      purchase({ id: "tv", amount: 300, totalInstallments: 3, description: "TV" }),
      purchase({ id: "sub", amount: 40, isSubscription: true, description: "Streaming" }),
    ];
    const installments = [
      inst({ id: "tv1", purchaseId: "tv", amount: 100, competenceMonth: "2026-05", paid: true, installmentNumber: 1, totalInstallments: 3 }),
      inst({ id: "tv2", purchaseId: "tv", amount: 100, competenceMonth: "2026-06", paid: true, installmentNumber: 2, totalInstallments: 3 }),
      inst({ id: "tv3", purchaseId: "tv", amount: 100, competenceMonth: "2026-07", installmentNumber: 3, totalInstallments: 3 }),
      inst({ id: "s6", purchaseId: "sub", amount: 40, competenceMonth: "2026-06" }),
      inst({ id: "s7", purchaseId: "sub", amount: 40, competenceMonth: "2026-07" }),
    ];

    const { months, releases } = getFutureCommitments(installments, purchases, "2026-06", 4);
    expect(months.map(m => m.total)).toEqual([40, 140, 40, 40]);
    expect(months[1]).toMatchObject({ installments: 100, subscriptions: 40 });
    expect(releases).toEqual([{ month: "2026-08", amount: 100, items: [{ description: "TV", amount: 100 }] }]);
  });
});

describe("getRecurringCosts", () => {
  it("soma assinaturas do cartão e recorrências da conta convertidas para mês", () => {
    const purchases = [purchase({ id: "sub", amount: 40, isSubscription: true, description: "Streaming" })];
    const installments = [inst({ id: "s6", purchaseId: "sub", amount: 45, competenceMonth: "2026-06" })];
    const transactions = [
      tx({ id: "gym", amount: 100, isRecurring: true, paymentDate: "2026-06-05" }),
      tx({ id: "gym2", amount: 100, isRecurring: true, recurringRuleId: "gym", paymentDate: "2026-07-05", status: "pending" }),
      tx({ id: "w1", amount: 12, isRecurring: true, paymentDate: "2026-06-01" }),
      tx({ id: "w2", amount: 12, isRecurring: true, recurringRuleId: "w1", paymentDate: "2026-06-08", status: "pending" }),
      tx({ id: "old", amount: 999, isRecurring: true, paymentDate: "2026-01-01" }),
      tx({ id: "fat", amount: 500, isRecurring: true, categoryId: SEED_INVOICE_PAYMENT_CATEGORY_ID, paymentDate: "2026-06-10" }),
    ];

    const r = getRecurringCosts(transactions, installments, purchases, "2026-06");
    expect(r.items.map(i => i.key).sort()).toEqual(["card-sub", "tx-gym", "tx-w1"]);
    expect(r.items.find(i => i.key === "card-sub")!.monthly).toBe(45);
    expect(r.items.find(i => i.key === "tx-w1")!.cadence).toBe("weekly");
    expect(r.monthlyTotal).toBeCloseTo(45 + 100 + 12 * 52 / 12);
    expect(r.yearlyTotal).toBeCloseTo(r.monthlyTotal * 12);
  });
});

describe("buildReportActions", () => {
  const result: MonthResult = { month: "2026-06", income: 5000, expense: 5400, net: -400, savingsRate: -0.08 };

  it("prioriza perigo e limita a quantidade", () => {
    const actions = buildReportActions({
      room: { free: -250, perDay: 0, daysLeft: 10, endDate: "2026-06-30", nextInvoice: 0, nextMonth: "2026-07" },
      result,
      average: null,
      outliers: [{ categoryId: "food", current: 500, average: 200, excess: 300, pct: 1.5, monthsCompared: 3 }],
      budgets: [],
      releases: [{ month: "2026-08", amount: 100, items: [{ description: "TV", amount: 100 }] }],
      recurring: { items: [], monthlyTotal: 0, yearlyTotal: 0 },
      categoryName: id => (id === "food" ? "Delivery" : id),
      monthClosed: false,
    }, 3);

    expect(actions).toHaveLength(3);
    expect(actions[0].id).toBe("room-negative");
    expect(actions[0].title).toContain("250,00");
    expect(actions.map(a => a.tone)).toEqual(["danger", "warning", "warning"]);
    expect(actions.some(a => a.title.includes("Delivery"))).toBe(true);
  });
});

describe("localDateStr", () => {
  it("usa o dia civil local", () => {
    expect(localDateStr(new Date(2026, 8, 29, 23, 30))).toBe("2026-09-29");
  });
});
