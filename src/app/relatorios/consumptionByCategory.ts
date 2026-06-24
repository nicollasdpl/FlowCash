// Gastos por categoria na data real de consumo (não ciclo de fatura).
// Usado apenas na visão "Consumo real" em Relatórios.
//
// Regra cartão (não assinatura): purchaseDate no mês → purchase.amount integral.
// Reflete "o que comprei neste mês", sem espalhar parcelas nem usar ciclo de fatura.
// Assinaturas: valor mensal a partir do mês de início.
// Lançamentos manuais: competenceDate no mês.

import type { Transaction, CardPurchase } from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";

function addToMap(map: Record<string, number>, categoryId: string, amount: number) {
  if (amount <= 0 || !categoryId) return;
  map[categoryId] = (map[categoryId] ?? 0) + amount;
}

export function getConsumptionByCategory(
  month: string,
  transactions: Transaction[],
  _installments: unknown[],
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
    if (purchase.isSubscription) {
      const purchaseMonth = purchase.purchaseDate.substring(0, 7);
      if (month >= purchaseMonth) {
        addToMap(map, purchase.categoryId, purchase.amount);
      }
      continue;
    }

    if (purchase.purchaseDate.startsWith(month)) {
      addToMap(map, purchase.categoryId, purchase.amount);
    }
  }

  return map;
}
