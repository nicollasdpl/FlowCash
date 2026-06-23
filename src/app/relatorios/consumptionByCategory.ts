// Gastos por categoria na data real de consumo (não ciclo de fatura).
// Usado apenas na visão "Consumo real" em Relatórios.
//
// Cartão: usa parcelas reais (amount) com mês de consumo derivado da purchaseDate.
// À vista → mês da compra. Parcelado → mês civil a partir da compra (parcela N).
// Assinaturas → valor mensal a partir do mês de início.

import type { Transaction, CardPurchase, CardInstallment } from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";
import { addMonths } from "@/engine/financialEngine";

function addToMap(map: Record<string, number>, categoryId: string, amount: number) {
  if (amount <= 0 || !categoryId) return;
  map[categoryId] = (map[categoryId] ?? 0) + amount;
}

/** Mês civil em que o gasto do cartão deve aparecer na visão consumo real. */
export function getConsumptionMonth(
  purchase: CardPurchase,
  installment: CardInstallment,
): string {
  const purchaseMonth = purchase.purchaseDate.substring(0, 7);
  const total = purchase.totalInstallments ?? 1;
  if (total <= 1) {
    return purchaseMonth;
  }
  return addMonths(purchaseMonth, installment.installmentNumber - 1);
}

export function getConsumptionByCategory(
  month: string,
  transactions: Transaction[],
  installments: CardInstallment[],
  purchases: CardPurchase[],
): Record<string, number> {
  const map: Record<string, number> = {};
  const purchaseById = new Map(purchases.map(p => [p.id, p]));
  const purchasesWithInstallments = new Set(installments.map(i => i.purchaseId));

  for (const t of transactions) {
    if (t.categoryId === SEED_INVOICE_PAYMENT_CATEGORY_ID) continue;
    if (t.type === "expense" && t.competenceDate.startsWith(month)) {
      addToMap(map, t.categoryId, t.amount);
    }
  }

  for (const purchase of purchases) {
    if (!purchase.isSubscription) continue;
    const purchaseMonth = purchase.purchaseDate.substring(0, 7);
    if (month >= purchaseMonth) {
      addToMap(map, purchase.categoryId, purchase.amount);
    }
  }

  for (const inst of installments) {
    const purchase = purchaseById.get(inst.purchaseId);
    if (!purchase || purchase.isSubscription) continue;
    const consumptionMonth = getConsumptionMonth(purchase, inst);
    if (consumptionMonth === month) {
      addToMap(map, purchase.categoryId, inst.amount);
    }
  }

  // Compras sem parcelas geradas (legado / órfãs)
  for (const purchase of purchases) {
    if (purchase.isSubscription || purchasesWithInstallments.has(purchase.id)) continue;
    const total = purchase.totalInstallments ?? 1;
    if (total <= 1) {
      if (purchase.purchaseDate.startsWith(month)) {
        addToMap(map, purchase.categoryId, purchase.amount);
      }
      continue;
    }
    const base = parseFloat((purchase.amount / total).toFixed(2));
    const purchaseMonth = purchase.purchaseDate.substring(0, 7);
    for (let i = 0; i < total; i++) {
      const installmentMonth = addMonths(purchaseMonth, i);
      if (installmentMonth !== month) continue;
      const amount = i === total - 1
        ? parseFloat((purchase.amount - base * (total - 1)).toFixed(2))
        : base;
      addToMap(map, purchase.categoryId, amount);
    }
  }

  return map;
}
