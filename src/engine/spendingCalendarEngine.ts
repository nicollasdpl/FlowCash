import type { Transaction, CardInstallment, CardPurchase } from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";

export type SpendingCalendarMode = "competence" | "payment";

export interface DaySpendingItem {
  id: string;
  description: string;
  amount: number;
  kind: "transaction" | "installment";
}

export interface DaySpending {
  date: string;
  total: number;
  items: DaySpendingItem[];
}

/** Dia do calendário para parcela: mesmo dia da compra, clampado ao mês da fatura. */
export function installmentCalendarDay(competenceMonth: string, purchaseDate: string): string {
  const day = Number(purchaseDate.split("-")[2]);
  const [y, m] = competenceMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const d = Math.min(day, lastDay);
  return `${competenceMonth}-${String(d).padStart(2, "0")}`;
}

function ensureDay(map: Record<string, DaySpending>, date: string): DaySpending {
  if (!map[date]) map[date] = { date, total: 0, items: [] };
  return map[date];
}

function addItem(
  map: Record<string, DaySpending>,
  date: string,
  item: DaySpendingItem,
) {
  const day = ensureDay(map, date);
  day.items.push(item);
  day.total += item.amount;
}

export function buildDailySpendingMap(
  month: string,
  transactions: Transaction[],
  installments: CardInstallment[],
  purchases: CardPurchase[],
  mode: SpendingCalendarMode,
): Record<string, DaySpending> {
  const map: Record<string, DaySpending> = {};
  const purchaseById = new Map(purchases.map(p => [p.id, p]));

  if (mode === "competence") {
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      if (t.categoryId === SEED_INVOICE_PAYMENT_CATEGORY_ID) continue;
      if (!t.competenceDate.startsWith(month)) continue;
      addItem(map, t.competenceDate, {
        id: t.id,
        description: t.description,
        amount: t.amount,
        kind: "transaction",
      });
    }

    for (const inst of installments) {
      if (inst.competenceMonth !== month) continue;
      const purchase = purchaseById.get(inst.purchaseId);
      if (!purchase) continue;
      const date = installmentCalendarDay(inst.competenceMonth, purchase.purchaseDate);
      addItem(map, date, {
        id: inst.id,
        description: purchase.description,
        amount: inst.amount,
        kind: "installment",
      });
    }
  } else {
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      if (t.categoryId === SEED_INVOICE_PAYMENT_CATEGORY_ID) continue;
      if (t.status !== "paid") continue;
      if (!t.paymentDate.startsWith(month)) continue;
      addItem(map, t.paymentDate, {
        id: t.id,
        description: t.description,
        amount: t.amount,
        kind: "transaction",
      });
    }

    for (const inst of installments) {
      if (!inst.paid || !inst.paidAt) continue;
      if (!inst.paidAt.startsWith(month)) continue;
      const purchase = purchaseById.get(inst.purchaseId);
      if (!purchase) continue;
      addItem(map, inst.paidAt, {
        id: inst.id,
        description: purchase.description,
        amount: inst.amount,
        kind: "installment",
      });
    }
  }

  return map;
}

export function getCalendarGrid(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function heatAlpha(amount: number, max: number): number {
  if (amount <= 0 || max <= 0) return 0;
  const t = Math.min(amount / max, 1);
  return 0.14 + t * 0.72;
}
