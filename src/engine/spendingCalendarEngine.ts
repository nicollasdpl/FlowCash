import type { Transaction, CardInstallment, CardPurchase, Category } from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";

export type SpendingCalendarMode = "competence" | "payment";

export interface DaySpendingItem {
  id: string;
  description: string;
  amount: number;
  kind: "transaction" | "installment";
  flow: "expense" | "income";
  categoryId: string;
}

export interface DaySpending {
  date: string;
  /** @deprecated Prefer expenseTotal; kept as alias for expenseTotal for callers. */
  total: number;
  expenseTotal: number;
  incomeTotal: number;
  net: number;
  items: DaySpendingItem[];
}

export interface DescriptionGroup {
  key: string;
  label: string;
  amount: number;
  count: number;
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
  if (!map[date]) {
    map[date] = {
      date,
      total: 0,
      expenseTotal: 0,
      incomeTotal: 0,
      net: 0,
      items: [],
    };
  }
  return map[date];
}

function addItem(
  map: Record<string, DaySpending>,
  date: string,
  item: DaySpendingItem,
) {
  const day = ensureDay(map, date);
  day.items.push(item);
  if (item.flow === "expense") {
    day.expenseTotal += item.amount;
    day.total += item.amount;
  } else {
    day.incomeTotal += item.amount;
  }
  day.net = day.incomeTotal - day.expenseTotal;
}

function excludedReportIds(categories?: Pick<Category, "id" | "excludeFromReports">[]): Set<string> {
  if (!categories) return new Set();
  return new Set(categories.filter(c => c.excludeFromReports).map(c => c.id));
}

export interface BuildDailySpendingMapOptions {
  categories?: Pick<Category, "id" | "excludeFromReports">[];
  /** When set, only expense items of this category (no income). */
  categoryId?: string;
}

export function buildDailySpendingMap(
  month: string,
  transactions: Transaction[],
  installments: CardInstallment[],
  purchases: CardPurchase[],
  mode: SpendingCalendarMode,
  options: BuildDailySpendingMapOptions = {},
): Record<string, DaySpending> {
  const map: Record<string, DaySpending> = {};
  const purchaseById = new Map(purchases.map(p => [p.id, p]));
  const excluded = excludedReportIds(options.categories);
  const onlyCat = options.categoryId;

  if (mode === "competence") {
    for (const t of transactions) {
      if (t.type === "expense") {
        if (t.categoryId === SEED_INVOICE_PAYMENT_CATEGORY_ID) continue;
        if (onlyCat && t.categoryId !== onlyCat) continue;
        if (!t.competenceDate.startsWith(month)) continue;
        addItem(map, t.competenceDate, {
          id: t.id,
          description: t.description,
          amount: t.amount,
          kind: "transaction",
          flow: "expense",
          categoryId: t.categoryId || "__none__",
        });
      } else if (t.type === "income" && !onlyCat) {
        if (excluded.has(t.categoryId)) continue;
        if (!t.competenceDate.startsWith(month)) continue;
        addItem(map, t.competenceDate, {
          id: t.id,
          description: t.description,
          amount: t.amount,
          kind: "transaction",
          flow: "income",
          categoryId: t.categoryId || "__none__",
        });
      }
    }

    for (const inst of installments) {
      if (inst.competenceMonth !== month) continue;
      const purchase = purchaseById.get(inst.purchaseId);
      if (!purchase) continue;
      if (onlyCat && purchase.categoryId !== onlyCat) continue;
      const date = installmentCalendarDay(inst.competenceMonth, purchase.purchaseDate);
      addItem(map, date, {
        id: inst.id,
        description: purchase.description,
        amount: inst.amount,
        kind: "installment",
        flow: "expense",
        categoryId: purchase.categoryId || "__none__",
      });
    }
  } else {
    for (const t of transactions) {
      if (t.status !== "paid") continue;
      if (t.type === "expense") {
        if (t.categoryId === SEED_INVOICE_PAYMENT_CATEGORY_ID) continue;
        if (onlyCat && t.categoryId !== onlyCat) continue;
        if (!t.paymentDate.startsWith(month)) continue;
        addItem(map, t.paymentDate, {
          id: t.id,
          description: t.description,
          amount: t.amount,
          kind: "transaction",
          flow: "expense",
          categoryId: t.categoryId || "__none__",
        });
      } else if (t.type === "income" && !onlyCat) {
        if (excluded.has(t.categoryId)) continue;
        if (!t.paymentDate.startsWith(month)) continue;
        addItem(map, t.paymentDate, {
          id: t.id,
          description: t.description,
          amount: t.amount,
          kind: "transaction",
          flow: "income",
          categoryId: t.categoryId || "__none__",
        });
      }
    }

    for (const inst of installments) {
      if (!inst.paid || !inst.paidAt) continue;
      if (!inst.paidAt.startsWith(month)) continue;
      const purchase = purchaseById.get(inst.purchaseId);
      if (!purchase) continue;
      if (onlyCat && purchase.categoryId !== onlyCat) continue;
      addItem(map, inst.paidAt, {
        id: inst.id,
        description: purchase.description,
        amount: inst.amount,
        kind: "installment",
        flow: "expense",
        categoryId: purchase.categoryId || "__none__",
      });
    }
  }

  return map;
}

export function normalizeDescriptionKey(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, " ");
}

export function groupByDescription(
  items: { description: string; amount: number }[],
): DescriptionGroup[] {
  const map = new Map<string, { label: string; labelCounts: Map<string, number>; amount: number; count: number }>();

  for (const item of items) {
    const key = normalizeDescriptionKey(item.description);
    if (!key) continue;
    let entry = map.get(key);
    if (!entry) {
      entry = { label: item.description.trim(), labelCounts: new Map(), amount: 0, count: 0 };
      map.set(key, entry);
    }
    entry.amount += item.amount;
    entry.count += 1;
    const raw = item.description.trim();
    entry.labelCounts.set(raw, (entry.labelCounts.get(raw) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([key, entry]) => {
      let bestLabel = entry.label;
      let bestCount = 0;
      for (const [label, n] of entry.labelCounts) {
        if (n > bestCount) {
          bestCount = n;
          bestLabel = label;
        }
      }
      return { key, label: bestLabel, amount: entry.amount, count: entry.count };
    })
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "pt-BR"));
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
