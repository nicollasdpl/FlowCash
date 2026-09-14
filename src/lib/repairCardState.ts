/**
 * Reparo pós-bug de edição de compra (DEL+ADD):
 * 1) Valor pt-BR "1.240,62" virava ~1,24 → parcelas ~R$ 0,21
 * 2) Parcelas pagas eram recriadas como não pagas → fatura VENCIDA + projetado
 *    descontava de novo uma fatura já liquidada no extrato.
 */
import type {
  CardInstallment,
  CardPurchase,
  CreditCard,
  Transaction,
} from "@/types/financial";
import { generateInstallments, getInvoiceDates, hasInvoicePaymentForDue, invoiceDueMonthLabel } from "@/engine/invoiceEngine";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";

/** Estado mínimo necessário para o reparo (compatível com AppState). */
export type RepairableState = {
  cards: CreditCard[];
  purchases: CardPurchase[];
  installments: CardInstallment[];
  transactions: Transaction[];
};

/**
 * Detecta total corrompido pelo parse "1.240,62" → 1.24.
 * Heurística: total < R$ 5, ≥2 parcelas, parcela média < R$ 1.
 */
export function isCorruptedPurchaseAmount(purchase: CardPurchase, installments: CardInstallment[]): boolean {
  if (purchase.amount >= 5) return false;
  if (purchase.totalInstallments < 2) return false;
  const own = installments.filter(i => i.purchaseId === purchase.id);
  if (own.length === 0) return false;
  const avg = own.reduce((s, i) => s + i.amount, 0) / own.length;
  return avg < 1;
}

/** Recupera total ≈ valor × 1000 (efeito do ponto de milhar no parse). */
export function recoverCorruptedAmount(amount: number): number {
  return Math.round(amount * 1000 * 100) / 100;
}

function repairCorruptedPurchases(state: RepairableState): RepairableState {
  let purchases = state.purchases;
  let installments = state.installments;
  let changed = false;

  for (const purchase of state.purchases) {
    if (!isCorruptedPurchaseAmount(purchase, installments)) continue;
    const card = state.cards.find(c => c.id === purchase.cardId);
    if (!card || purchase.isSubscription) continue;

    const recovered = /picpay/i.test(purchase.description) && purchase.totalInstallments === 6
      ? 1240.62
      : recoverCorruptedAmount(purchase.amount);
    if (recovered < 10 || recovered === purchase.amount) continue;

    const paidBefore = installments
      .filter(i => i.purchaseId === purchase.id && i.paid)
      .map(i => ({ n: i.installmentNumber, paidAt: i.paidAt }));

    const fixed: CardPurchase = { ...purchase, amount: recovered };
    const without = installments.filter(i => i.purchaseId !== purchase.id);
    const regenerated = generateInstallments(fixed, card, without).map(inst => {
      const prev = paidBefore.find(p => p.n === inst.installmentNumber);
      return prev ? { ...inst, paid: true, paidAt: prev.paidAt } : inst;
    });

    purchases = purchases.map(p => (p.id === purchase.id ? fixed : p));
    installments = [...without, ...regenerated];
    changed = true;
  }

  return changed ? { ...state, purchases, installments } : state;
}

/** Marca parcelas como pagas quando já existe liquidação no extrato. */
function repairPaidFlagsFromInvoicePayments(state: RepairableState): RepairableState {
  let installments = state.installments;
  let changed = false;

  for (const card of state.cards) {
    const months = new Set(
      installments.filter(i => i.cardId === card.id).map(i => i.competenceMonth),
    );
    for (const month of months) {
      const monthInst = installments.filter(
        i => i.cardId === card.id && i.competenceMonth === month,
      );
      if (monthInst.length === 0 || monthInst.every(i => i.paid)) continue;

      const { dueDate } = getInvoiceDates(month, card.closingDay, card.dueDay);
      if (!hasInvoicePaymentForDue(state.transactions, card, dueDate)) continue;

      const label = invoiceDueMonthLabel(dueDate).toLowerCase();
      const name = card.name.trim().toLowerCase();
      const paidAt =
        state.transactions.find(t => {
          if (t.categoryId !== SEED_INVOICE_PAYMENT_CATEGORY_ID || t.status !== "paid") return false;
          const desc = (t.description ?? "").toLowerCase();
          return desc.includes(name) && desc.includes(label);
        })?.paymentDate ?? dueDate;

      installments = installments.map(i => {
        if (i.cardId !== card.id || i.competenceMonth !== month || i.paid) return i;
        changed = true;
        return { ...i, paid: true, paidAt };
      });
    }
  }

  return changed ? { ...state, installments } : state;
}

/**
 * Aplica reparos idempotentes. Retorna `changed` para forçar sync no Firestore.
 */
export function repairCardState<T extends RepairableState>(state: T): { state: T; changed: boolean } {
  const before = JSON.stringify({
    p: state.purchases.map(x => [x.id, x.amount]),
    i: state.installments.map(x => [x.id, x.amount, x.paid]),
  });

  let next: RepairableState = state;
  next = repairCorruptedPurchases(next);
  next = repairPaidFlagsFromInvoicePayments(next);

  const after = JSON.stringify({
    p: next.purchases.map(x => [x.id, x.amount]),
    i: next.installments.map(x => [x.id, x.amount, x.paid]),
  });

  const changed = before !== after;
  return { state: changed ? ({ ...state, ...next } as T) : state, changed };
}
