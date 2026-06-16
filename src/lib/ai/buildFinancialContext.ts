import { getSpentByCategory } from "@/engine/budgetEngine";
import {
  addMonths,
  currentMonth,
  getCardLimitSummary,
  getCurrentBalance,
  getProjectedBalance,
} from "@/engine/financialEngine";
import { computeInvoice } from "@/engine/invoiceEngine";
import type { Account, Budget, CardInstallment, CardPurchase, Category, CreditCard, Goal, Transaction } from "@/types/financial";
import type { BuildFinancialContextInput, FinancialContext } from "./types";

function endOfMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const last = new Date(y, m, 0);
  return `${yyyymm}-${String(last.getDate()).padStart(2, "0")}`;
}

/** Monta contexto financeiro usando engines puras (mesma base do dashboard/orçamentos). */
export function buildFinancialContext(input: BuildFinancialContextInput): FinancialContext {
  const month = currentMonth();
  const prevMonth = addMonths(month, -1);

  const accounts = input.accounts.filter(a => a.active) as Account[];
  const transactions = input.transactions as Transaction[];
  const categories = input.categories as Category[];
  const budgets = input.budgets as Budget[];
  const cards = (input.cards ?? []).filter(c => c.active) as CreditCard[];
  const installments = (input.installments ?? []) as CardInstallment[];
  const purchases = (input.purchases ?? []) as CardPurchase[];
  const goals = (input.goals ?? []).filter(g => !g.completed) as Goal[];

  const monthEnd = endOfMonth(month);

  const income = transactions
    .filter(t => t.type === "income" && t.status === "paid" && t.paymentDate.startsWith(month))
    .reduce((s, t) => s + t.amount, 0);

  const spentMap = getSpentByCategory(month, transactions, installments, purchases);
  const expenses = Object.values(spentMap).reduce((s, v) => s + v, 0);

  const prevSpentMap = getSpentByCategory(prevMonth, transactions, installments, purchases);
  const prevExpenses = Object.values(prevSpentMap).reduce((s, v) => s + v, 0);

  const expenseChangePct =
    prevExpenses > 0 ? Math.round(((expenses - prevExpenses) / prevExpenses) * 100) : null;

  const balance = accounts.reduce(
    (sum, acc) => sum + getCurrentBalance(acc, transactions),
    0,
  );

  const byCategory = Object.entries(spentMap)
    .map(([categoryId, spent]) => {
      const cat = categories.find(c => c.id === categoryId);
      const budget = budgets.find(b => b.categoryId === categoryId && b.month === month);
      const limit = budget?.limitAmount;
      const budgetUsedPct = limit && limit > 0 ? Math.round((spent / limit) * 100) : undefined;
      const budgetRemaining = limit !== undefined ? Math.max(0, limit - spent) : undefined;
      return {
        categoryId,
        name: cat?.name ?? "—",
        spent,
        budget: limit,
        budgetUsedPct,
        budgetRemaining,
        overBudget: limit !== undefined && spent > limit,
      };
    })
    .sort((a, b) => b.spent - a.spent);

  const budgetAlerts = byCategory
    .filter(c => c.overBudget && c.budget !== undefined)
    .map(c => ({
      name: c.name,
      spent: c.spent,
      limit: c.budget!,
      overBy: c.spent - c.budget!,
    }));

  const recentTransactions = [...transactions]
    .sort((a, b) => (b.paymentDate || "").localeCompare(a.paymentDate || ""))
    .slice(0, 15)
    .map(t => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      type: t.type,
      category: categories.find(c => c.id === t.categoryId)?.name ?? "—",
      categoryId: t.categoryId,
      date: t.paymentDate,
      accountId: t.accountId,
    }));

  const recentPurchases = [...purchases]
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))
    .slice(0, 10)
    .map(p => {
      const card = cards.find(c => c.id === p.cardId);
      return {
        id: p.id,
        description: p.description,
        amount: p.amount,
        category: categories.find(c => c.id === p.categoryId)?.name ?? "—",
        categoryId: p.categoryId,
        cardId: p.cardId,
        cardName: card?.name ?? "—",
        purchaseDate: p.purchaseDate,
      };
    });

  const accountSummaries = accounts.map(acc => ({
    id: acc.id,
    name: acc.name,
    currentBalance: getCurrentBalance(acc, transactions),
    projectedBalance: getProjectedBalance(acc, transactions, monthEnd, cards, installments),
  }));

  const cardSummaries = cards.map(card => {
    const summary = getCardLimitSummary(card, installments, purchases);
    const invoice = computeInvoice(card, installments, month);
    return {
      id: card.id,
      name: card.name,
      brand: card.brand,
      currentInvoiceAmount: summary.currentInvoiceAmount,
      invoiceDueDate: invoice.dueDate,
      usedLimit: summary.usedLimit,
      availableLimit: summary.availableLimit,
      totalLimit: summary.totalLimit,
    };
  });

  const goalSummaries = goals
    .slice(0, 5)
    .map(g => ({
      id: g.id,
      name: g.name,
      currentAmount: g.currentAmount,
      targetAmount: g.targetAmount,
      progressPct: g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0,
      deadline: g.deadline,
    }));

  return {
    month,
    prevMonth,
    summary: { income, expenses, balance, prevExpenses, expenseChangePct },
    byCategory,
    recentTransactions,
    recentPurchases,
    accounts: accountSummaries,
    cards: cardSummaries,
    goals: goalSummaries,
    budgetAlerts,
  };
}
