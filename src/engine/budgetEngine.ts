// Helpers de orçamento.
// Regra de competência (não de caixa) — o gasto conta no mês em que a obrigação
// nasce, mesmo se ainda não foi pago.
//
// Inclui:
//   a) transactions com type === "expense" e competenceDate no mês (qualquer status:
//      paid, pending ou overdue — todas representam compromisso já assumido)
//   b) installments de cartão com competenceMonth === month, herdando o categoryId
//      da purchase pai. Installments sem purchase pai são ignorados (compra deletada
//      ou subscription cancelada — sem purchase não há como resolver a categoria).
//
// Não inclui pagamento de fatura (isso é liquidação, não gasto novo).

import type { Transaction, CardInstallment, CardPurchase } from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";

export function getSpentByCategory(
  month: string,
  transactions: Transaction[],
  installments: CardInstallment[],
  purchases: CardPurchase[],
): Record<string, number> {
  const map: Record<string, number> = {};

  for (const t of transactions) {
    // Ignora a liquidação de fatura: não é gasto novo por categoria.
    // As parcelas do cartão já contam pelas categorias corretas no bloco (b).
    if (t.categoryId === SEED_INVOICE_PAYMENT_CATEGORY_ID) continue;
    if (t.type === "expense" && t.competenceDate.startsWith(month)) {
      map[t.categoryId] = (map[t.categoryId] ?? 0) + t.amount;
    }
  }

  // Index purchases por id para lookup O(1).
  const purchaseById = new Map(purchases.map(p => [p.id, p]));

  for (const inst of installments) {
    if (inst.competenceMonth !== month) continue;
    const purchase = purchaseById.get(inst.purchaseId);
    if (!purchase) continue; // órfã: compra deletada / subscription cancelada
    map[purchase.categoryId] = (map[purchase.categoryId] ?? 0) + inst.amount;
  }

  return map;
}
