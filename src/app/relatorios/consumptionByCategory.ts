// Gastos por categoria na data real de consumo (não ciclo de fatura).
// Usado apenas na visão "Consumo real" em Relatórios.

import type { Transaction, CardPurchase } from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";
import { addMonths } from "@/engine/financialEngine";

function installmentAmounts(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = parseFloat((total / count).toFixed(2));
  const amounts = Array.from({ length: count }, () => base);
  if (count > 1) {
    const sumWithoutLast = amounts.slice(0, -1).reduce((s, v) => s + v, 0);
    amounts[count - 1] = parseFloat((total - sumWithoutLast).toFixed(2));
  }
  return amounts;
}

function addToMap(map: Record<string, number>, categoryId: string, amount: number) {
  if (amount <= 0) return;
  map[categoryId] = (map[categoryId] ?? 0) + amount;
}

export function getConsumptionByCategory(
  month: string,
  transactions: Transaction[],
  purchases: CardPurchase[],
): Record<string, number> {
  const map: Record<string, number> = {};

  for (const t of transactions) {
    if (t.categoryId === SEED_INVOICE_PAYMENT_CATEGORY_ID) continue;
    if (t.type === "expense" && t.competenceDate.startsWith(month)) {
      addToMap(map, t.categoryId, t.amount);
    }
  }

  for (const purchase of purchases) {
    const purchaseMonth = purchase.purchaseDate.substring(0, 7);
    const catId = purchase.categoryId;

    if (purchase.isSubscription) {
      if (month >= purchaseMonth) {
        addToMap(map, catId, purchase.amount);
      }
      continue;
    }

    if (purchase.totalInstallments <= 1) {
      if (purchase.purchaseDate.startsWith(month)) {
        addToMap(map, catId, purchase.amount);
      }
      continue;
    }

    const amounts = installmentAmounts(purchase.amount, purchase.totalInstallments);
    for (let i = 0; i < amounts.length; i++) {
      const installmentMonth = addMonths(purchaseMonth, i);
      if (installmentMonth === month) {
        addToMap(map, catId, amounts[i]);
      }
    }
  }

  return map;
}
