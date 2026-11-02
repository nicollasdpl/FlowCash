import type { CardInstallment, CardPurchase } from "@/types/financial";

export interface InvoiceOwnershipTotals {
  total: number;
  mine: number;
  others: number;
  byPerson: Record<string, number>;
}

/** A responsabilidade pertence à compra inteira e acompanha todas as parcelas. */
export function getInvoiceOwnershipTotals(
  installments: CardInstallment[],
  purchases: CardPurchase[],
): InvoiceOwnershipTotals {
  const purchaseById = new Map(purchases.map(purchase => [purchase.id, purchase]));
  const totals: InvoiceOwnershipTotals = { total: 0, mine: 0, others: 0, byPerson: {} };

  for (const installment of installments) {
    const amount = Math.round(installment.amount * 100) / 100;
    const person = purchaseById.get(installment.purchaseId)?.responsiblePerson?.trim();
    totals.total += amount;
    if (person) {
      totals.others += amount;
      totals.byPerson[person] = (totals.byPerson[person] ?? 0) + amount;
    } else {
      totals.mine += amount;
    }
  }

  totals.total = Math.round(totals.total * 100) / 100;
  totals.mine = Math.round(totals.mine * 100) / 100;
  totals.others = Math.round(totals.others * 100) / 100;
  for (const person of Object.keys(totals.byPerson)) {
    totals.byPerson[person] = Math.round(totals.byPerson[person] * 100) / 100;
  }
  return totals;
}
