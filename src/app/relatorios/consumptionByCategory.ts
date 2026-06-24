// Gastos por categoria — visão "Consumo real" em Relatórios.
//
// Diferente de "Por fatura": conta QUANDO você gastou (purchaseDate), não quando
// a fatura fecha. Usa o valor da PARCELA (installment.amount), nunca o total.
//
// À vista: purchaseDate no mês → parcela da compra.
// Parcelado: parcela N no mês civil purchaseMonth + (N-1).
// Assinatura: valor mensal a partir do mês de início.
// Manual: competenceDate no mês (sem duplicar cartão).

import type { Transaction, CardInstallment, CardPurchase } from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";
import { addMonths } from "@/engine/financialEngine";

function addToMap(map: Record<string, number>, categoryId: string, amount: number) {
  if (amount <= 0 || !categoryId) return;
  map[categoryId] = (map[categoryId] ?? 0) + amount;
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

/** Mês civil em que o gasto ocorreu (data real da compra / parcela). */
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
  const unmatchedCardAmounts = new Map<string, number[]>();

  for (const purchase of purchases) {
    if (!purchase.isSubscription) continue;
    const purchaseMonth = purchase.purchaseDate.substring(0, 7);
    if (month >= purchaseMonth) {
      addToMap(map, purchase.categoryId, purchase.amount);
      const list = unmatchedCardAmounts.get(purchase.categoryId) ?? [];
      list.push(purchase.amount);
      unmatchedCardAmounts.set(purchase.categoryId, list);
    }
  }

  for (const inst of installments) {
    const purchase = purchaseById.get(inst.purchaseId);
    if (!purchase || purchase.isSubscription) continue;
    const consumptionMonth = getConsumptionMonth(purchase, inst);
    if (consumptionMonth !== month) continue;
    addToMap(map, purchase.categoryId, inst.amount);
    const list = unmatchedCardAmounts.get(purchase.categoryId) ?? [];
    list.push(inst.amount);
    unmatchedCardAmounts.set(purchase.categoryId, list);
  }

  for (const t of transactions) {
    if (t.categoryId === SEED_INVOICE_PAYMENT_CATEGORY_ID) continue;
    if (t.type !== "expense" || !t.competenceDate.startsWith(month)) continue;

    const cardAmounts = unmatchedCardAmounts.get(t.categoryId);
    if (cardAmounts) {
      const idx = cardAmounts.findIndex(a => amountsMatch(a, t.amount));
      if (idx >= 0) {
        cardAmounts.splice(idx, 1);
        continue;
      }
    }

    addToMap(map, t.categoryId, t.amount);
  }

  return map;
}
