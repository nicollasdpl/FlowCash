// ─────────────────────────────────────────────────────────────────────────────
// REPORT INSIGHTS ENGINE — respostas acionáveis para /relatorios
// Funções PURAS: "hoje" e o mês entram como parâmetro (YYYY-MM-DD local).
//
// Bases (iguais ao resto do app):
//   Receita  = caixa: income pago no mês, sem categorias excludeFromReports.
//   Despesa  = competência: getSpentByCategory (conta + parcelas, sem fatura).
//   Espaço   = getProjectedBalance das contas não-investimento até o fim do mês.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Account, Budget, CardInstallment, CardPurchase, Category, CreditCard, Transaction,
} from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";
import { addMonths, endOfMonth, fmt, getProjectedBalance } from "./financialEngine";
import { getInvoiceDates, hasInvoicePaymentForDue } from "./invoiceEngine";
import { getSpentByCategory } from "./budgetEngine";

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function monthName(yyyymm: string): string {
  const m = Number(yyyymm.split("-")[1]);
  return MONTH_NAMES[m - 1] ?? yyyymm;
}

/** Data civil local YYYY-MM-DD (sem UTC). */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysInMonth(yyyymm: string): number {
  return Number(endOfMonth(yyyymm).split("-")[2]);
}

function sum(values: Iterable<number>): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

// ─── RESULTADO MENSAL ────────────────────────────────────────────────────────

export interface MonthResult {
  month: string;
  income: number;
  expense: number;
  net: number;
  /** net / income; null quando não houve receita. */
  savingsRate: number | null;
}

export function getReportIncome(
  month: string,
  transactions: Transaction[],
  categories: Pick<Category, "id" | "excludeFromReports">[],
): number {
  const excluded = new Set(categories.filter(c => c.excludeFromReports).map(c => c.id));
  return sum(
    transactions
      .filter(t =>
        t.type === "income" &&
        t.status === "paid" &&
        t.paymentDate.startsWith(month) &&
        !excluded.has(t.categoryId),
      )
      .map(t => t.amount),
  );
}

export function getMonthlyResults(
  months: string[],
  transactions: Transaction[],
  installments: CardInstallment[],
  purchases: CardPurchase[],
  categories: Pick<Category, "id" | "excludeFromReports">[],
): MonthResult[] {
  return months.map(month => {
    const income = getReportIncome(month, transactions, categories);
    const expense = sum(Object.values(getSpentByCategory(month, transactions, installments, purchases)));
    const net = income - expense;
    return { month, income, expense, net, savingsRate: income > 0 ? net / income : null };
  });
}

/** Média dos meses que tiveram algum movimento (ignora meses vazios antes do uso do app). */
export function averageResult(results: MonthResult[]): MonthResult | null {
  const withData = results.filter(r => r.income > 0 || r.expense > 0);
  if (withData.length === 0) return null;
  const n = withData.length;
  const income = sum(withData.map(r => r.income)) / n;
  const expense = sum(withData.map(r => r.expense)) / n;
  const net = income - expense;
  return { month: "avg", income, expense, net, savingsRate: income > 0 ? net / income : null };
}

// ─── ESPAÇO PARA GASTAR ATÉ O FIM DO MÊS ─────────────────────────────────────

export interface SpendingRoom {
  /** Saldo projetado no fim do mês (contas não-investimento). */
  free: number;
  /** Quanto dá para gastar por dia sem ficar negativo (0 se free <= 0). */
  perDay: number;
  /** Dias restantes contando hoje. */
  daysLeft: number;
  endDate: string;
  /** Faturas não pagas que vencem no mês seguinte (referência). */
  nextInvoice: number;
  nextMonth: string;
}

export function getSpendingRoom(
  accounts: Account[],
  transactions: Transaction[],
  cards: CreditCard[],
  installments: CardInstallment[],
  todayStr: string,
): SpendingRoom {
  const month = todayStr.slice(0, 7);
  const endDate = endOfMonth(month);
  const spendable = accounts.filter(a => a.active && a.type !== "investment");
  const free = sum(spendable.map(a => getProjectedBalance(a, transactions, endDate, cards, installments)));
  const daysLeft = Math.max(1, daysInMonth(month) - Number(todayStr.slice(8, 10)) + 1);
  const nextMonth = addMonths(month, 1);

  let nextInvoice = 0;
  for (const card of cards) {
    const unpaidByMonth = new Map<string, number>();
    for (const inst of installments) {
      if (inst.cardId !== card.id || inst.paid) continue;
      unpaidByMonth.set(inst.competenceMonth, (unpaidByMonth.get(inst.competenceMonth) ?? 0) + inst.amount);
    }
    for (const [competence, amount] of unpaidByMonth) {
      const { dueDate } = getInvoiceDates(competence, card.closingDay, card.dueDay);
      if (!dueDate.startsWith(nextMonth)) continue;
      if (hasInvoicePaymentForDue(transactions, card, dueDate)) continue;
      nextInvoice += amount;
    }
  }

  return {
    free,
    perDay: free > 0 ? free / daysLeft : 0,
    daysLeft,
    endDate,
    nextInvoice,
    nextMonth,
  };
}

// ─── ONDE CORTAR: CATEGORIAS ACIMA DA MÉDIA ──────────────────────────────────

export interface CategoryOutlier {
  categoryId: string;
  current: number;
  /** Média dos meses anteriores com dados (0 = gasto novo). */
  average: number;
  excess: number;
  /** excess / average; null quando é gasto novo. */
  pct: number | null;
  monthsCompared: number;
}

export function getCategoryOutliers(
  month: string,
  transactions: Transaction[],
  installments: CardInstallment[],
  purchases: CardPurchase[],
  lookback = 3,
  opts: { minPct?: number; minAbs?: number } = {},
): CategoryOutlier[] {
  const minPct = opts.minPct ?? 0.15;
  const minAbs = opts.minAbs ?? 50;

  const current = getSpentByCategory(month, transactions, installments, purchases);
  const history = Array.from({ length: lookback }, (_, i) =>
    getSpentByCategory(addMonths(month, -(i + 1)), transactions, installments, purchases),
  ).filter(m => sum(Object.values(m)) > 0);
  if (history.length === 0) return [];

  const out: CategoryOutlier[] = [];
  for (const [categoryId, spent] of Object.entries(current)) {
    const average = sum(history.map(h => h[categoryId] ?? 0)) / history.length;
    const excess = spent - average;
    if (excess < minAbs) continue;
    if (average > 0 && excess / average < minPct) continue;
    out.push({
      categoryId,
      current: spent,
      average,
      excess,
      pct: average > 0 ? excess / average : null,
      monthsCompared: history.length,
    });
  }
  return out.sort((a, b) => b.excess - a.excess);
}

// ─── RITMO DOS ORÇAMENTOS ────────────────────────────────────────────────────

export type BudgetStatus = "ok" | "risk" | "over";

export interface BudgetPace {
  budgetId: string;
  categoryId: string;
  limit: number;
  spent: number;
  /** Gasto estimado no fim do mês mantendo o ritmo atual. */
  projected: number;
  remaining: number;
  /** Quanto ainda cabe por dia até o fim do mês. */
  perDayLeft: number;
  /** Dia estimado em que o limite é atingido (só em risco no mês atual). */
  overDay: number | null;
  status: BudgetStatus;
  isCurrentMonth: boolean;
}

export function getBudgetPace(
  budgets: Budget[],
  spentByCat: Record<string, number>,
  month: string,
  todayStr: string,
): BudgetPace[] {
  const isCurrentMonth = todayStr.startsWith(month);
  const total = daysInMonth(month);
  const day = isCurrentMonth ? Number(todayStr.slice(8, 10)) : total;
  const daysLeft = isCurrentMonth ? total - day + 1 : 0;

  return budgets
    .filter(b => b.month === month)
    .map(b => {
      const spent = spentByCat[b.categoryId] ?? 0;
      const limit = b.limitAmount;
      const pace = day > 0 ? spent / day : 0;
      const projected = isCurrentMonth ? pace * total : spent;
      const remaining = Math.max(limit - spent, 0);
      const status: BudgetStatus =
        spent > limit ? "over" : projected > limit ? "risk" : "ok";
      const overDay =
        status === "risk" && pace > 0 ? Math.min(total, Math.max(day, Math.ceil(limit / pace))) : null;
      return {
        budgetId: b.id,
        categoryId: b.categoryId,
        limit,
        spent,
        projected,
        remaining,
        perDayLeft: daysLeft > 0 ? remaining / daysLeft : 0,
        overDay,
        status,
        isCurrentMonth,
      };
    })
    .sort((a, b) => {
      const rank: Record<BudgetStatus, number> = { over: 0, risk: 1, ok: 2 };
      return rank[a.status] - rank[b.status] || (b.projected / (b.limit || 1)) - (a.projected / (a.limit || 1));
    });
}

// ─── COMPROMISSOS FUTUROS NO CARTÃO ──────────────────────────────────────────

export interface CommitmentMonth {
  month: string;
  installments: number;
  subscriptions: number;
  total: number;
}

export interface ReleaseEvent {
  /** Primeiro mês sem a parcela. */
  month: string;
  amount: number;
  items: { description: string; amount: number }[];
}

function isActiveSubscription(
  purchase: CardPurchase,
  insts: CardInstallment[],
  fromMonth: string,
): boolean {
  return !!purchase.isSubscription && insts.some(i => i.competenceMonth >= fromMonth);
}

export function getFutureCommitments(
  installments: CardInstallment[],
  purchases: CardPurchase[],
  fromMonth: string,
  months = 6,
): { months: CommitmentMonth[]; releases: ReleaseEvent[] } {
  const horizon = Array.from({ length: months }, (_, i) => addMonths(fromMonth, i));
  const lastHorizon = horizon[horizon.length - 1];
  const purchaseById = new Map(purchases.map(p => [p.id, p]));
  const byPurchase = new Map<string, CardInstallment[]>();
  for (const inst of installments) {
    const list = byPurchase.get(inst.purchaseId) ?? [];
    list.push(inst);
    byPurchase.set(inst.purchaseId, list);
  }

  const rows: CommitmentMonth[] = horizon.map(month => ({ month, installments: 0, subscriptions: 0, total: 0 }));
  const rowByMonth = new Map(rows.map(r => [r.month, r]));

  for (const inst of installments) {
    const row = rowByMonth.get(inst.competenceMonth);
    if (!row || inst.paid) continue;
    const purchase = purchaseById.get(inst.purchaseId);
    if (purchase?.isSubscription) row.subscriptions += inst.amount;
    else row.installments += inst.amount;
  }

  // Assinaturas ativas continuam além das cobranças já geradas.
  for (const purchase of purchases) {
    const insts = byPurchase.get(purchase.id) ?? [];
    if (!isActiveSubscription(purchase, insts, fromMonth)) continue;
    const sorted = [...insts].sort((a, b) => a.competenceMonth.localeCompare(b.competenceMonth));
    const last = sorted[sorted.length - 1];
    for (const row of rows) {
      if (row.month > last.competenceMonth) row.subscriptions += last.amount;
    }
  }

  for (const row of rows) row.total = row.installments + row.subscriptions;

  const releaseByMonth = new Map<string, ReleaseEvent>();
  for (const [purchaseId, insts] of byPurchase) {
    const purchase = purchaseById.get(purchaseId);
    if (!purchase || purchase.isSubscription || (purchase.totalInstallments ?? 1) <= 1) continue;
    if (!insts.some(i => !i.paid && i.competenceMonth >= fromMonth)) continue;
    const last = insts.reduce((a, b) => (b.competenceMonth > a.competenceMonth ? b : a));
    const releaseMonth = addMonths(last.competenceMonth, 1);
    if (releaseMonth <= fromMonth || releaseMonth > addMonths(lastHorizon, 1)) continue;
    const ev = releaseByMonth.get(releaseMonth) ?? { month: releaseMonth, amount: 0, items: [] };
    ev.amount += last.amount;
    ev.items.push({ description: purchase.description, amount: last.amount });
    releaseByMonth.set(releaseMonth, ev);
  }
  const releases = [...releaseByMonth.values()]
    .map(ev => ({ ...ev, items: ev.items.sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return { months: rows, releases };
}

// ─── RECORRÊNCIAS ────────────────────────────────────────────────────────────

export type RecurringCadence = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurringItem {
  key: string;
  description: string;
  categoryId: string;
  source: "card" | "account";
  cadence: RecurringCadence;
  /** Valor de cada cobrança. */
  amount: number;
  /** Custo equivalente por mês. */
  monthly: number;
}

const MONTHLY_FACTOR: Record<RecurringCadence, number> = {
  daily: 30,
  weekly: 52 / 12,
  monthly: 1,
  yearly: 1 / 12,
};

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function inferCadence(dates: string[]): RecurringCadence {
  if (dates.length < 2) return "monthly";
  const gap = daysBetween(dates[0], dates[1]);
  if (gap <= 2) return "daily";
  if (gap <= 10) return "weekly";
  if (gap <= 45) return "monthly";
  return "yearly";
}

export function getRecurringCosts(
  transactions: Transaction[],
  installments: CardInstallment[],
  purchases: CardPurchase[],
  fromMonth: string,
): { items: RecurringItem[]; monthlyTotal: number; yearlyTotal: number } {
  const items: RecurringItem[] = [];
  const fromDate = `${fromMonth}-01`;

  const byPurchase = new Map<string, CardInstallment[]>();
  for (const inst of installments) {
    const list = byPurchase.get(inst.purchaseId) ?? [];
    list.push(inst);
    byPurchase.set(inst.purchaseId, list);
  }
  for (const purchase of purchases) {
    const insts = byPurchase.get(purchase.id) ?? [];
    if (!isActiveSubscription(purchase, insts, fromMonth)) continue;
    const next = insts
      .filter(i => i.competenceMonth >= fromMonth)
      .sort((a, b) => a.competenceMonth.localeCompare(b.competenceMonth))[0];
    const amount = next?.amount ?? purchase.amount;
    items.push({
      key: `card-${purchase.id}`,
      description: purchase.description,
      categoryId: purchase.categoryId,
      source: "card",
      cadence: "monthly",
      amount,
      monthly: amount,
    });
  }

  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.isRecurring || t.type !== "expense") continue;
    if (t.categoryId === SEED_INVOICE_PAYMENT_CATEGORY_ID) continue;
    const key = t.recurringRuleId ?? t.id;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
    const upcoming = sorted.filter(t => t.paymentDate >= fromDate);
    if (upcoming.length === 0) continue;
    const ref = upcoming[0];
    const cadence = inferCadence(sorted.map(t => t.paymentDate));
    items.push({
      key: `tx-${key}`,
      description: ref.description,
      categoryId: ref.categoryId,
      source: "account",
      cadence,
      amount: ref.amount,
      monthly: ref.amount * MONTHLY_FACTOR[cadence],
    });
  }

  items.sort((a, b) => b.monthly - a.monthly);
  const monthlyTotal = sum(items.map(i => i.monthly));
  return { items, monthlyTotal, yearlyTotal: monthlyTotal * 12 };
}

// ─── LISTA "O QUE FAZER" ─────────────────────────────────────────────────────

export type ActionTone = "danger" | "warning" | "info" | "good";
export type ActionTarget = "hero" | "summary" | "outliers" | "budgets" | "future" | "recurring";

export interface ReportAction {
  id: string;
  tone: ActionTone;
  title: string;
  detail: string;
  target: ActionTarget;
  /** Peso em R$ para ordenar dentro do mesmo tom. */
  impact: number;
}

export interface BuildActionsInput {
  room: SpendingRoom | null;
  result: MonthResult;
  average: MonthResult | null;
  outliers: CategoryOutlier[];
  budgets: BudgetPace[];
  releases: ReleaseEvent[];
  recurring: { items: RecurringItem[]; monthlyTotal: number; yearlyTotal: number };
  categoryName: (id: string) => string;
  /** Mês selecionado já terminou. */
  monthClosed: boolean;
}

const TONE_RANK: Record<ActionTone, number> = { danger: 0, warning: 1, info: 2, good: 3 };

export function buildReportActions(input: BuildActionsInput, limit = 4): ReportAction[] {
  const { room, result, average, outliers, budgets, releases, recurring, categoryName, monthClosed } = input;
  const actions: ReportAction[] = [];

  if (room && room.free < 0) {
    actions.push({
      id: "room-negative",
      tone: "danger",
      title: `Faltam R$ ${fmt(-room.free)} para fechar o mês`,
      detail: "Com o que já está agendado, as contas terminam o mês no negativo. Adie gastos ou reforce o saldo antes dos próximos vencimentos.",
      target: "hero",
      impact: -room.free,
    });
  }

  for (const b of budgets) {
    const name = categoryName(b.categoryId);
    if (b.status === "over") {
      actions.push({
        id: `budget-${b.budgetId}`,
        tone: "danger",
        title: `Orçamento de ${name} estourou em R$ ${fmt(b.spent - b.limit)}`,
        detail: b.isCurrentMonth
          ? `Gastou R$ ${fmt(b.spent)} de R$ ${fmt(b.limit)}. Segure novos gastos nessa categoria até o fim do mês.`
          : `Gastou R$ ${fmt(b.spent)} de R$ ${fmt(b.limit)}. Ajuste o limite ou corte nessa categoria no próximo mês.`,
        target: "budgets",
        impact: b.spent - b.limit,
      });
    } else if (b.status === "risk" && b.overDay) {
      actions.push({
        id: `budget-${b.budgetId}`,
        tone: "warning",
        title: `${name} deve estourar por volta do dia ${b.overDay}`,
        detail: `No ritmo atual fecha em R$ ${fmt(b.projected)} (limite R$ ${fmt(b.limit)}). Para caber, no máximo R$ ${fmt(b.perDayLeft)} por dia.`,
        target: "budgets",
        impact: b.projected - b.limit,
      });
    }
  }

  for (const o of outliers.slice(0, 3)) {
    const name = categoryName(o.categoryId);
    actions.push({
      id: `outlier-${o.categoryId}`,
      tone: "warning",
      title: o.average > 0
        ? `${name}: R$ ${fmt(o.excess)} acima da sua média`
        : `${name}: R$ ${fmt(o.current)} em gasto novo`,
      detail: o.average > 0
        ? `R$ ${fmt(o.current)} neste mês contra média de R$ ${fmt(o.average)} nos últimos ${o.monthsCompared} ${o.monthsCompared === 1 ? "mês" : "meses"}.`
        : `Não apareceu nos últimos ${o.monthsCompared} ${o.monthsCompared === 1 ? "mês" : "meses"}. Confira se é pontual.`,
      target: "outliers",
      impact: o.excess,
    });
  }

  if (result.income > 0 && result.net < 0) {
    actions.push({
      id: "savings-negative",
      tone: monthClosed ? "danger" : "warning",
      title: `Despesas passam a receita em R$ ${fmt(-result.net)}`,
      detail: average && average.net > 0
        ? `Na média dos meses anteriores sobravam R$ ${fmt(average.net)}. O corte acima dessa diferença é o que reequilibra.`
        : "O gasto por competência (conta + cartão) está maior que o que entrou no mês.",
      target: "summary",
      impact: -result.net,
    });
  } else if (monthClosed && result.savingsRate !== null && result.savingsRate < 0.1) {
    const gap = result.income * 0.1 - result.net;
    actions.push({
      id: "savings-low",
      tone: "warning",
      title: `Sobrou só ${Math.round(result.savingsRate * 100)}% da receita`,
      detail: `Cortar R$ ${fmt(gap)} por mês leva a 10% de sobra.`,
      target: "summary",
      impact: gap,
    });
  }

  const nextRelease = releases[0];
  if (nextRelease) {
    const names = nextRelease.items.slice(0, 2).map(i => i.description).join(", ");
    const more = nextRelease.items.length > 2 ? ` e mais ${nextRelease.items.length - 2}` : "";
    actions.push({
      id: `release-${nextRelease.month}`,
      tone: "info",
      title: `Em ${monthName(nextRelease.month)} liberam R$ ${fmt(nextRelease.amount)}/mês`,
      detail: `Terminam: ${names}${more}. Evite novas parcelas até lá para sentir a folga.`,
      target: "future",
      impact: nextRelease.amount,
    });
  }

  if (recurring.monthlyTotal > 0) {
    actions.push({
      id: "recurring",
      tone: "info",
      title: `Recorrências custam R$ ${fmt(recurring.yearlyTotal)} por ano`,
      detail: `R$ ${fmt(recurring.monthlyTotal)}/mês em ${recurring.items.length} ${recurring.items.length === 1 ? "item" : "itens"}. Cancelar o que não usa rende o ano inteiro.`,
      target: "recurring",
      impact: recurring.monthlyTotal,
    });
  }

  if (actions.every(a => a.tone !== "danger" && a.tone !== "warning") && result.savingsRate !== null && result.savingsRate >= 0.1) {
    actions.push({
      id: "savings-good",
      tone: "good",
      title: `Sobraram ${Math.round(result.savingsRate * 100)}% da receita`,
      detail: `R$ ${fmt(result.net)} livres. Bom momento para reforçar uma meta ou caixinha.`,
      target: "summary",
      impact: result.net,
    });
  }

  return actions
    .sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || b.impact - a.impact)
    .slice(0, limit);
}
