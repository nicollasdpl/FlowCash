// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL ENGINE — Motor de cálculo financeiro temporal
// Todas funções são PURAS — sem side effects, sem estado.
// Saldo é SEMPRE calculado, NUNCA armazenado.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Account, Transaction, CreditCard, CardInstallment, CardPurchase, Goal,
  AccountBalance, NetWorthSnapshot, CashFlowEntry, MonthlyProjection, CardLimitSummary,
} from "@/types/financial";

// ─── UTILITÁRIOS ─────────────────────────────────────────────────────────────

export function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function toYYYYMM(d: string): string {
  return d.substring(0, 7); // "YYYY-MM-DD" → "YYYY-MM"
}

export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function addMonths(yyyymm: string, n: number): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const total = y * 12 + m - 1 + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12 + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtShort(v: number): string {
  if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return `R$ ${fmt(v)}`;
}

// ─── SALDO REAL (ATUAL) ──────────────────────────────────────────────────────
// Regra: SUM(paid incomes) - SUM(paid expenses) + initialBalance
// NÃO inclui pendentes, NÃO inclui cartão de crédito.
// Pagamento de fatura é uma despesa tipo "expense" com origin="invoice".
export function getCurrentBalance(account: Account, transactions: Transaction[]): number {
  // Saldo atual = somente o que JÁ aconteceu (paid + paymentDate <= hoje).
  // Lançamentos paid com paymentDate futuro (agendados pagos) impactam só
  // a projeção, não o saldo atual.
  const tdy  = today();
  const paid = transactions.filter(
    t => t.accountId === account.id &&
      t.status === "paid" &&
      t.paymentDate <= tdy,
  );

  let balance = account.initialBalance;

  for (const t of paid) {
    if (t.type === "income") balance += t.amount;
    else if (t.type === "expense") balance -= t.amount;
    else if (t.type === "transfer") {
      if (t.transferToAccountId) balance -= t.amount;         // saiu desta conta
    }
  }

  // Entradas de transferência vinda de outras contas
  const transfersIn = transactions.filter(
    t => t.type === "transfer" &&
      t.transferToAccountId === account.id &&
      t.status === "paid" &&
      t.paymentDate <= tdy,
  );
  for (const t of transfersIn) balance += t.amount;

  return balance;
}

// ─── SALDO PROJETADO ─────────────────────────────────────────────────────────
// Saldo real + pendentes até `upToDate` - faturas closed/overdue vencendo no período.
// cards + installments são opcionais: omitir mantém comportamento anterior.
export function getProjectedBalance(
  account: Account,
  transactions: Transaction[],
  upToDate: string,
  cards: CreditCard[] = [],
  installments: CardInstallment[] = [],
): number {
  let balance = getCurrentBalance(account, transactions);

  // Paid com paymentDate futuro (entre hoje+1 e upToDate) saiu de getCurrentBalance
  // mas ainda precisa entrar no projetado — caso de agendamento já liquidado.
  const tdy = today();
  const futurePaid = transactions.filter(
    t =>
      t.accountId === account.id &&
      t.status === "paid" &&
      t.paymentDate > tdy &&
      t.paymentDate <= upToDate,
  );
  for (const t of futurePaid) {
    if (t.type === "income") balance += t.amount;
    else if (t.type === "expense") balance -= t.amount;
    else if (t.type === "transfer") {
      if (t.transferToAccountId) balance -= t.amount;
    }
  }

  const futurePaidTransfersIn = transactions.filter(
    t =>
      t.type === "transfer" &&
      t.transferToAccountId === account.id &&
      t.status === "paid" &&
      t.paymentDate > tdy &&
      t.paymentDate <= upToDate,
  );
  for (const t of futurePaidTransfersIn) balance += t.amount;

  const pending = transactions.filter(
    t =>
      t.accountId === account.id &&
      t.status === "pending" &&
      t.paymentDate <= upToDate,
  );

  for (const t of pending) {
    if (t.type === "income") balance += t.amount;
    else if (t.type === "expense") balance -= t.amount;
    else if (t.type === "transfer") balance -= t.amount;
  }

  const pendingTransfersIn = transactions.filter(
    t =>
      t.type === "transfer" &&
      t.transferToAccountId === account.id &&
      t.status === "pending" &&
      t.paymentDate <= upToDate,
  );
  for (const t of pendingTransfersIn) balance += t.amount;

  // Subtract unpaid invoices (closed or overdue) whose dueDate falls within the period.
  // Mirrors getInvoiceDates: both closingDate and dueDate are in the competenceMonth itself.
  for (const card of cards) {
    if (card.paymentAccountId !== account.id) continue;
    const cardInst = installments.filter(i => i.cardId === card.id);
    const months = new Set(cardInst.map(i => i.competenceMonth));
    for (const month of months) {
      const monthInst = cardInst.filter(i => i.competenceMonth === month);
      if (monthInst.every(i => i.paid)) continue;
      const unpaidTotal = monthInst.filter(i => !i.paid).reduce((s, i) => s + i.amount, 0);
      if (unpaidTotal <= 0) continue;
      // Inline mirror of getInvoiceDates (no import — circular dep with invoiceEngine)
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      let dueDate: string;
      if (card.dueDay > card.closingDay) {
        dueDate = `${month}-${String(Math.min(card.dueDay, lastDay)).padStart(2, "0")}`;
      } else {
        const nextMonth = addMonths(month, 1);
        const [ny, nm] = nextMonth.split("-").map(Number);
        dueDate = `${nextMonth}-${String(Math.min(card.dueDay, new Date(ny, nm, 0).getDate())).padStart(2, "0")}`;
      }
      if (dueDate > upToDate) continue;
      balance -= unpaidTotal;
    }
  }

  return balance;
}

// ─── SALDO DISPONÍVEL ────────────────────────────────────────────────────────
// Saldo projetado - dinheiro reservado para metas.
export function getAvailableBalance(
  account: Account,
  transactions: Transaction[],
  goals: Goal[],
  upToDate: string,
  cards: CreditCard[] = [],
  installments: CardInstallment[] = [],
): number {
  const projected = getProjectedBalance(account, transactions, upToDate, cards, installments);
  const reserved = goals
    .filter(g => g.accountId === account.id && !g.completed)
    .reduce((s, g) => s + g.currentAmount, 0);
  return projected - reserved;
}

// ─── SALDO COMPLETO DE UMA CONTA ─────────────────────────────────────────────
export function getAccountBalance(
  account: Account,
  transactions: Transaction[],
  goals: Goal[],
): AccountBalance {
  const eom = endOfCurrentMonth();
  return {
    accountId: account.id,
    currentBalance: getCurrentBalance(account, transactions),
    projectedBalance: getProjectedBalance(account, transactions, eom),
    availableBalance: getAvailableBalance(account, transactions, goals, eom),
  };
}

function endOfCurrentMonth(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().split("T")[0];
}

// ─── PATRIMÔNIO LÍQUIDO ──────────────────────────────────────────────────────
// ativos (saldo de todas as contas) - passivos (faturas abertas dos cartões)
export function getNetWorth(
  accounts: Account[],
  transactions: Transaction[],
  installments: CardInstallment[],
): NetWorthSnapshot {
  const totalAssets = accounts
    .filter(a => a.active)
    .reduce((s, a) => s + getCurrentBalance(a, transactions), 0);

  const totalLiabilities = installments
    .filter(i => !i.paid)
    .reduce((s, i) => s + i.amount, 0);

  const eom = endOfCurrentMonth();
  const projectedAssets = accounts
    .filter(a => a.active)
    .reduce((s, a) => s + getProjectedBalance(a, transactions, eom), 0);

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    projectedNetWorth: projectedAssets - totalLiabilities,
  };
}

// ─── FLUXO DE CAIXA ──────────────────────────────────────────────────────────
// Timeline de eventos financeiros com saldo acumulado.
// Responde: "quando ficarei negativo?"
export function getCashFlow(
  account: Account,
  transactions: Transaction[],
  fromDate: string,
  toDate: string,
): CashFlowEntry[] {
  const relevant = transactions.filter(
    t =>
      t.accountId === account.id &&
      t.paymentDate >= fromDate &&
      t.paymentDate <= toDate,
  ).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));

  let running = getCurrentBalance(account, transactions);
  // Ajusta para não contar transações após fromDate que já estão pagas
  // (elas já estão no getCurrentBalance)
  const alreadyPaid = transactions.filter(
    t =>
      t.accountId === account.id &&
      t.status === "paid" &&
      t.paymentDate >= fromDate,
  );
  for (const t of alreadyPaid) {
    if (t.type === "income") running -= t.amount;
    else if (t.type === "expense") running += t.amount;
  }

  const entries: CashFlowEntry[] = [];
  entries.push({
    date: fromDate,
    description: "Saldo inicial",
    amount: running,
    type: "income",
    status: "paid",
    runningBalance: running,
    accountId: account.id,
  });

  for (const t of relevant) {
    if (t.type === "income") running += t.amount;
    else if (t.type === "expense") running -= t.amount;
    else if (t.type === "transfer") running -= t.amount;

    entries.push({
      date: t.paymentDate,
      description: t.description,
      amount: t.amount,
      type: t.type === "transfer" ? "expense" : t.type,
      status: t.status,
      runningBalance: running,
      accountId: t.accountId,
    });
  }

  return entries;
}

// ─── DATA DO PRIMEIRO SALDO NEGATIVO ─────────────────────────────────────────
export function findFirstNegativeDate(
  account: Account,
  transactions: Transaction[],
  daysAhead = 90,
): string | null {
  const start = today();
  const t0 = new Date();
  let running = getCurrentBalance(account, transactions);

  const pending = transactions
    .filter(t => t.accountId === account.id && t.status === "pending")
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));

  for (const t of pending) {
    const diff = (parseDate(t.paymentDate).getTime() - t0.getTime()) / 86400000;
    if (diff > daysAhead) break;
    if (t.paymentDate < start) continue;

    if (t.type === "income") running += t.amount;
    else if (t.type === "expense") running -= t.amount;

    if (running < 0) return t.paymentDate;
  }
  return null;
}

// ─── PROJEÇÃO MENSAL ─────────────────────────────────────────────────────────
// Retorna projeção mês a mês para os próximos N meses.
export function getMonthlyProjections(
  accounts: Account[],
  transactions: Transaction[],
  months = 6,
  installments: CardInstallment[] = [],
): MonthlyProjection[] {
  const results: MonthlyProjection[] = [];
  const cm = currentMonth();

  let runningBalance = accounts
    .filter(a => a.active)
    .reduce((s, a) => s + getCurrentBalance(a, transactions), 0);

  for (let i = 0; i < months; i++) {
    const month = addMonths(cm, i);
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-31`;

    const monthTxs = transactions.filter(
      t => t.paymentDate >= monthStart && t.paymentDate <= monthEnd,
    );

    const income = monthTxs
      .filter(t => t.type === "income")
      .reduce((s, t) => s + t.amount, 0);

    const txExpense = monthTxs
      .filter(t => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);

    const cardExpense = getCardCommittedByMonth(installments, month);
    const expense = txExpense + cardExpense;

    runningBalance += income - expense;

    results.push({
      month,
      projectedIncome: income,
      projectedExpense: expense,
      projectedBalance: runningBalance,
      riskLevel:
        runningBalance < 0 ? "danger"
        : runningBalance < expense * 0.3 ? "warning"
        : "safe",
    });
  }

  return results;
}

// ─── LIMITE DO CARTÃO ────────────────────────────────────────────────────────
// Limite CONSUMIDO = todas as parcelas futuras não pagas de compras normais
// + apenas o mês atual de assinaturas (meses futuros de assinatura não bloqueiam limite).
export function getCardLimitSummary(
  card: CreditCard,
  installments: CardInstallment[],
  purchases: CardPurchase[] = [],
): CardLimitSummary {
  const cardInstallments = installments.filter(i => i.cardId === card.id);
  const cm = currentMonth();
  const subscriptionPurchaseIds = new Set(
    purchases.filter(p => p.isSubscription).map(p => p.id)
  );

  // Subscriptions: only current month counts against limit; future months are pre-generated for display only
  const usedLimit = cardInstallments
    .filter(i => !i.paid)
    .filter(i => !subscriptionPurchaseIds.has(i.purchaseId) || i.competenceMonth <= cm)
    .reduce((s, i) => s + i.amount, 0);

  // Fatura do mês atual
  const currentInvoiceAmount = cardInstallments
    .filter(i => i.competenceMonth === cm)
    .reduce((s, i) => s + i.amount, 0);

  return {
    cardId: card.id,
    totalLimit: card.totalLimit,
    usedLimit,
    availableLimit: card.totalLimit - usedLimit,
    currentInvoiceAmount,
  };
}

// ─── RESUMO DAS CONTAS A PAGAR DESTA SEMANA ──────────────────────────────────
export function getDueThisWeek(transactions: Transaction[]): Transaction[] {
  const t = new Date();
  const from = t.toISOString().split("T")[0];
  const to = new Date(t.getTime() + 7 * 86400000).toISOString().split("T")[0];
  return transactions.filter(
    tx => tx.type === "expense" && tx.status === "pending" && tx.paymentDate >= from && tx.paymentDate <= to,
  );
}

// ─── TRANSAÇÕES VENCIDAS ─────────────────────────────────────────────────────
export function getOverdueTransactions(transactions: Transaction[]): Transaction[] {
  const td = today();
  return transactions.filter(
    t => t.status !== "paid" && t.paymentDate < td,
  );
}

// ─── COMPROMETIDO COM CARTÃO NO MÊS ─────────────────────────────────────────
// Parcelas não pagas cuja competência cai no mês informado.
// NÃO afeta saldo real — é despesa futura comprometida, separada do realizado.
export function getCardCommittedByMonth(
  installments: CardInstallment[],
  month: string,
): number {
  return installments
    .filter(i => i.competenceMonth === month && !i.paid)
    .reduce((s, i) => s + i.amount, 0);
}

// ─── GASTOS POR CATEGORIA NO MÊS ─────────────────────────────────────────────
export function getExpensesByCategory(
  transactions: Transaction[],
  month: string,
): Record<string, number> {
  const result: Record<string, number> = {};
  transactions
    .filter(
      t =>
        t.type === "expense" &&
        t.competenceDate.startsWith(month) &&
        t.status !== "pending",
    )
    .forEach(t => {
      result[t.categoryId] = (result[t.categoryId] ?? 0) + t.amount;
    });
  return result;
}

// ─── PROGRESSO DO ORÇAMENTO ──────────────────────────────────────────────────
export function getBudgetProgress(
  transactions: Transaction[],
  budget: { categoryId: string; limitAmount: number; month: string },
): { spent: number; percent: number; remaining: number; overBudget: boolean } {
  const spent = transactions
    .filter(
      t =>
        t.categoryId === budget.categoryId &&
        t.type === "expense" &&
        t.competenceDate.startsWith(budget.month) &&
        t.status === "paid",
    )
    .reduce((s, t) => s + t.amount, 0);

  const percent = budget.limitAmount > 0 ? (spent / budget.limitAmount) * 100 : 0;

  return {
    spent,
    percent: Math.min(percent, 100),
    remaining: Math.max(budget.limitAmount - spent, 0),
    overBudget: spent > budget.limitAmount,
  };
}
