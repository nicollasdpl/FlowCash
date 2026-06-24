// Gastos por categoria — visão "Consumo real" em Relatórios.
//
// À vista: fatura do mês (competenceMonth) + compras com purchaseDate no mês que
// caem na fatura seguinte — sem repetir essas na fatura de julho.
// Parcelado: valor da parcela no mês civil a partir da purchaseDate.
// Manual: competenceDate no mês, sem duplicar compra do cartão na mesma data/valor.

import type { Transaction, CardInstallment, CardPurchase, CreditCard } from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";
import { addMonths } from "@/engine/financialEngine";
import { getCompetenceMonth } from "@/engine/invoiceEngine";

function addToMap(map: Record<string, number>, categoryId: string, amount: number) {
  if (amount <= 0 || !categoryId) return;
  map[categoryId] = (map[categoryId] ?? 0) + amount;
}

function oneTimeConsumptionAmount(
  month: string,
  purchase: CardPurchase,
  inst: CardInstallment,
  closingDay: number,
): number {
  const purchaseMonth = purchase.purchaseDate.substring(0, 7);
  const competenceMonth = inst.competenceMonth;
  const spillToNext =
    competenceMonth > purchaseMonth &&
    addMonths(purchaseMonth, 1) === competenceMonth;
  const expectedInvoice = getCompetenceMonth(purchase.purchaseDate, closingDay);

  // Mesmo mês civil, fatura do mês seguinte (ex.: 19/jun → fatura jul, conta em jun)
  if (
    purchaseMonth === month &&
    competenceMonth > month &&
    addMonths(purchaseMonth, 1) === competenceMonth
  ) {
    return inst.amount;
  }

  if (competenceMonth === month) {
    // Virada do mês anterior já contada no mês da compra (ex.: 19/jun não repete em jul)
    if (
      spillToNext &&
      purchaseMonth === addMonths(month, -1) &&
      expectedInvoice === month &&
      purchaseMonth === addMonths(competenceMonth, -1)
    ) {
      return 0;
    }
    return inst.amount;
  }

  return 0;
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
  cards: CreditCard[] = [],
): Record<string, number> {
  const map: Record<string, number> = {};
  const closingByCard = new Map(cards.map(c => [c.id, c.closingDay]));
  const installmentsByPurchase = new Map<string, CardInstallment[]>();
  for (const inst of installments) {
    const list = installmentsByPurchase.get(inst.purchaseId) ?? [];
    list.push(inst);
    installmentsByPurchase.set(inst.purchaseId, list);
  }

  const cardPurchaseKeys = new Set<string>();

  for (const purchase of purchases) {
    if (purchase.isSubscription) {
      const purchaseMonth = purchase.purchaseDate.substring(0, 7);
      if (month >= purchaseMonth) {
        addToMap(map, purchase.categoryId, purchase.amount);
        cardPurchaseKeys.add(`${purchase.categoryId}|${purchase.purchaseDate}|${purchase.amount.toFixed(2)}`);
      }
      continue;
    }

    const purchaseInsts = installmentsByPurchase.get(purchase.id) ?? [];
    const total = purchase.totalInstallments ?? 1;

    if (purchaseInsts.length === 0) {
      if (purchase.purchaseDate.startsWith(month)) {
        addToMap(map, purchase.categoryId, purchase.amount);
        cardPurchaseKeys.add(`${purchase.categoryId}|${purchase.purchaseDate}|${purchase.amount.toFixed(2)}`);
      }
      continue;
    }

    for (const inst of purchaseInsts) {
      const closingDay = closingByCard.get(purchase.cardId) ?? 10;
      const amount =
        total <= 1
          ? oneTimeConsumptionAmount(month, purchase, inst, closingDay)
          : getConsumptionMonth(purchase, inst) === month
            ? inst.amount
            : 0;
      if (amount <= 0) continue;

      addToMap(map, purchase.categoryId, amount);
      cardPurchaseKeys.add(`${purchase.categoryId}|${purchase.purchaseDate}|${amount.toFixed(2)}`);
    }
  }

  for (const t of transactions) {
    if (t.categoryId === SEED_INVOICE_PAYMENT_CATEGORY_ID) continue;
    if (t.type !== "expense" || !t.competenceDate.startsWith(month)) continue;

    const txKey = `${t.categoryId}|${t.competenceDate}|${t.amount.toFixed(2)}`;
    if (cardPurchaseKeys.has(txKey)) continue;

    const dupPurchase = purchases.some(
      p =>
        p.categoryId === t.categoryId &&
        p.purchaseDate === t.competenceDate &&
        amountsMatch(p.amount, t.amount),
    );
    if (dupPurchase) continue;

    addToMap(map, t.categoryId, t.amount);
  }

  return map;
}
