// Gastos por categoria — visão "Consumo real" em Relatórios.
//
// Cartão: valor da PARCELA (installment.amount) no mês de competência da fatura
// (competenceMonth) — igual ao orçamento / por fatura. Parcelado 200 em 20x → R$10/mês.
// Lançamentos manuais: competenceDate no mês, exceto duplicatas óbvias do cartão.

import type { Transaction, CardInstallment, CardPurchase } from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";

function addToMap(map: Record<string, number>, categoryId: string, amount: number) {
  if (amount <= 0 || !categoryId) return;
  map[categoryId] = (map[categoryId] ?? 0) + amount;
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

export function getConsumptionByCategory(
  month: string,
  transactions: Transaction[],
  installments: CardInstallment[],
  purchases: CardPurchase[],
): Record<string, number> {
  const map: Record<string, number> = {};
  const purchaseById = new Map(purchases.map(p => [p.id, p]));

  // 1) Cartão — parcelas no mês de competência da fatura
  const unmatchedCardAmounts = new Map<string, number[]>();

  for (const inst of installments) {
    if (inst.competenceMonth !== month) continue;
    const purchase = purchaseById.get(inst.purchaseId);
    if (!purchase) continue;
    addToMap(map, purchase.categoryId, inst.amount);
    const list = unmatchedCardAmounts.get(purchase.categoryId) ?? [];
    list.push(inst.amount);
    unmatchedCardAmounts.set(purchase.categoryId, list);
  }

  // 2) Lançamentos manuais — ignora pagamento de fatura e duplicatas do cartão
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
