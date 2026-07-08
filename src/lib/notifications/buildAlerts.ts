import type { AppState } from "@/context/AppContext";
import { getSpentByCategory } from "@/engine/budgetEngine";
import { currentMonth, today } from "@/engine/financialEngine";
import { computeInvoice, getCardInvoices } from "@/engine/invoiceEngine";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";
import type { FinanceAlert, NotificationPrefs } from "./types";

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(`${yyyymmdd}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0]!;
}

function daysUntil(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function shortDate(yyyymmdd: string): string {
  const [, m, d] = yyyymmdd.split("-");
  return `${d}/${m}`;
}

export function buildFinanceAlerts(
  state: AppState,
  prefs: NotificationPrefs,
): FinanceAlert[] {
  if (!prefs.enabled) return [];

  const tdy = today();
  const tomorrow = addDays(tdy, 1);
  const month = currentMonth();
  const alerts: FinanceAlert[] = [];

  for (const tx of state.transactions) {
    if (tx.categoryId === SEED_INVOICE_PAYMENT_CATEGORY_ID) continue;
    if (tx.status === "paid") continue;

    const amount = `R$ ${fmt(tx.amount)}`;
    const label = tx.description.trim() || "Lançamento";

    if (prefs.overdue && tx.paymentDate < tdy) {
      alerts.push({
        id: `overdue:${tx.id}`,
        kind: "overdue",
        line: `${label} venceu ${shortDate(tx.paymentDate)} · ${amount}`,
        priority: 1,
      });
      continue;
    }

    if (prefs.dueToday && tx.type === "expense" && tx.paymentDate === tdy) {
      alerts.push({
        id: `due-today:${tx.id}`,
        kind: "dueToday",
        line: `Vence hoje: ${label} · ${amount}`,
        priority: 2,
      });
      continue;
    }

    if (prefs.dueTomorrow && tx.type === "expense" && tx.paymentDate === tomorrow) {
      alerts.push({
        id: `due-tomorrow:${tx.id}`,
        kind: "dueTomorrow",
        line: `Vence amanhã: ${label} · ${amount}`,
        priority: 5,
      });
      continue;
    }

    if (prefs.incomeToday && tx.type === "income" && tx.paymentDate === tdy) {
      alerts.push({
        id: `income-today:${tx.id}`,
        kind: "incomeToday",
        line: `A receber hoje: ${label} · ${amount}`,
        priority: 4,
      });
    }
  }

  if (prefs.cardInvoiceDue) {
    const seen = new Set<string>();
    for (const card of state.cards.filter(c => c.active)) {
      const invoices = getCardInvoices(card, state.installments, 2);
      for (const inv of invoices) {
        if (inv.status === "paid" || inv.totalAmount <= 0) continue;
        const key = `${card.id}:${inv.competenceMonth}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const days = daysUntil(tdy, inv.dueDate);
        if (days < 0 || days > 3) continue;

        const when =
          days === 0 ? "vence hoje" : days === 1 ? "vence amanhã" : `vence em ${days} dias`;
        alerts.push({
          id: `card-due:${card.id}:${inv.competenceMonth}`,
          kind: "cardInvoiceDue",
          line: `Fatura ${card.name} ${when} · R$ ${fmt(inv.totalAmount)}`,
          priority: days === 0 ? 2 : 3,
        });
      }
    }
  }

  const spentByCat = getSpentByCategory(month, state.transactions, state.installments, state.purchases);
  for (const budget of state.budgets.filter(b => b.month === month && b.limitAmount > 0)) {
    const spent = spentByCat[budget.categoryId] ?? 0;
    const cat = state.categories.find(c => c.id === budget.categoryId);
    const name = cat?.name ?? "Categoria";
    const pct = Math.round((spent / budget.limitAmount) * 100);

    if (prefs.budgetOver && spent > budget.limitAmount) {
      alerts.push({
        id: `budget-over:${budget.id}`,
        kind: "budgetOver",
        line: `Orçamento estourado: ${name} (${pct}%)`,
        priority: 6,
      });
    } else if (prefs.budgetWarning && pct >= 80 && spent <= budget.limitAmount) {
      alerts.push({
        id: `budget-warn:${budget.id}`,
        kind: "budgetWarning",
        line: `Orçamento em risco: ${name} (${pct}%)`,
        priority: 7,
      });
    }
  }

  return alerts.sort((a, b) => a.priority - b.priority || a.line.localeCompare(b.line));
}

export function formatAlertDigest(alerts: FinanceAlert[], maxLines = 4): { title: string; body: string } {
  if (alerts.length === 0) {
    return { title: "FlowCash", body: "" };
  }

  const lines = alerts.slice(0, maxLines).map(a => a.line);
  const extra = alerts.length - lines.length;
  const body = extra > 0 ? `${lines.join("\n")}\n…e mais ${extra}` : lines.join("\n");

  const title =
    alerts.some(a => a.kind === "overdue")
      ? "Contas em atraso"
      : alerts.some(a => a.kind === "dueToday" || a.kind === "cardInvoiceDue")
        ? "Vencimentos hoje"
        : "Lembretes FlowCash";

  return { title, body };
}

export function alertDigestKey(alerts: FinanceAlert[]): string {
  return alerts.map(a => a.id).sort().join("|");
}
