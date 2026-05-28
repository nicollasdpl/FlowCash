// ─────────────────────────────────────────────────────────────────────────────
// INVOICE ENGINE — Motor de faturas e parcelamentos
// Todas funções são PURAS — sem side effects, sem estado.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CreditCard, CardPurchase, CardInstallment, Invoice, InvoiceStatus,
} from "@/types/financial";
import { currentMonth, addMonths } from "./financialEngine";

// ─── QUAL FATURA UMA COMPRA ENTRA ────────────────────────────────────────────
// REGRA: purchaseDate < fechamento do mês da compra → fatura do mês atual
//        purchaseDate >= fechamento do mês da compra → fatura do mês seguinte
// O fechamento é clampado ao último dia do mês (ex: fechamento dia 30 em fevereiro = dia 28).
export function getCompetenceMonth(purchaseDate: string, closingDay: number): string {
  const purchaseMonth = purchaseDate.substring(0, 7);
  const [y, m] = purchaseDate.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const closingDate = `${purchaseMonth}-${String(Math.min(closingDay, lastDay)).padStart(2, "0")}`;
  return purchaseDate < closingDate ? purchaseMonth : addMonths(purchaseMonth, 1);
}

// ─── DATAS DE FECHAMENTO E VENCIMENTO DA FATURA ──────────────────────────────
// Ambas as datas são no próprio competenceMonth, clampadas ao último dia do mês.
// Ex: competenceMonth 2026-06, closingDay 10, dueDay 17
//     → closingDate 2026-06-10, dueDate 2026-06-17
export function getInvoiceDates(
  competenceMonth: string,
  closingDay: number,
  dueDay: number,
): { closingDate: string; dueDate: string } {
  const [y, m] = competenceMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();

  const closingDate = `${competenceMonth}-${String(Math.min(closingDay, lastDay)).padStart(2, "0")}`;
  const dueDate     = `${competenceMonth}-${String(Math.min(dueDay,     lastDay)).padStart(2, "0")}`;

  return { closingDate, dueDate };
}

// ─── GERAR PARCELAS A PARTIR DE UMA COMPRA ───────────────────────────────────
// Cada parcela é uma obrigação futura real em seu próprio mês de competência.
// TV R$2400 12x → 12 parcelas, cada uma em seu mês de fatura.
export function generateInstallments(
  purchase: CardPurchase,
  card: CreditCard,
  existingInstallments: CardInstallment[] = [],
): CardInstallment[] {
  const installmentAmount = purchase.amount / purchase.totalInstallments;
  const firstCompetenceMonth = getCompetenceMonth(purchase.purchaseDate, card.closingDay);
  const installments: CardInstallment[] = [];

  // Gerar um ID base único a partir do purchaseId
  const baseId = purchase.id;

  for (let i = 0; i < purchase.totalInstallments; i++) {
    const competenceMonth = addMonths(firstCompetenceMonth, i);
    const installmentId = `${baseId}_inst_${i + 1}`;

    // Verificar se já existe (para não duplicar)
    const existing = existingInstallments.find(inst => inst.id === installmentId);
    if (existing) {
      installments.push(existing);
      continue;
    }

    installments.push({
      id: installmentId,
      purchaseId: purchase.id,
      cardId: purchase.cardId,
      installmentNumber: i + 1,
      totalInstallments: purchase.totalInstallments,
      amount: parseFloat(installmentAmount.toFixed(2)),
      competenceMonth,
      paid: false,
    });
  }

  // Ajuste de arredondamento na última parcela
  if (installments.length > 0 && !installments[installments.length - 1].paid) {
    const sumWithoutLast = installments
      .slice(0, -1)
      .reduce((s, inst) => s + inst.amount, 0);
    const remainder = parseFloat((purchase.amount - sumWithoutLast).toFixed(2));
    installments[installments.length - 1] = {
      ...installments[installments.length - 1],
      amount: remainder,
    };
  }

  return installments;
}

// ─── CALCULAR FATURA DE UM MÊS ESPECÍFICO ────────────────────────────────────
// Agrupa parcelas do mês e calcula totais.
export function computeInvoice(
  card: CreditCard,
  installments: CardInstallment[],
  competenceMonth: string,
): Invoice {
  const cardInstallments = installments.filter(
    i => i.cardId === card.id && i.competenceMonth === competenceMonth,
  );

  const totalAmount = cardInstallments.reduce((s, i) => s + i.amount, 0);
  const allPaid = cardInstallments.length > 0 && cardInstallments.every(i => i.paid);
  const { closingDate, dueDate } = getInvoiceDates(competenceMonth, card.closingDay, card.dueDay);

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  let status: InvoiceStatus;
  if (allPaid && cardInstallments.length > 0) {
    status = "paid";
  } else if (today >= dueDate) {
    status = "overdue";
  } else if (today >= closingDate) {
    status = "closed";
  } else {
    status = "open";
  }

  return {
    id: `invoice_${card.id}_${competenceMonth}`,
    cardId: card.id,
    competenceMonth,
    closingDate,
    dueDate,
    totalAmount,
    status,
  };
}

// ─── TODAS AS FATURAS DE UM CARTÃO ───────────────────────────────────────────
// Retorna faturas para os meses que têm parcelas + meses futuros.
export function getCardInvoices(
  card: CreditCard,
  installments: CardInstallment[],
  futureMonths = 3,
): Invoice[] {
  const cardInstallments = installments.filter(i => i.cardId === card.id);

  // Coletar todos os meses com parcelas
  const monthsSet = new Set<string>(cardInstallments.map(i => i.competenceMonth));

  // Adicionar meses futuros a partir do atual
  const cm = currentMonth();
  for (let i = 0; i < futureMonths; i++) {
    monthsSet.add(addMonths(cm, i));
  }

  const months = Array.from(monthsSet).sort();
  return months.map(month => computeInvoice(card, installments, month));
}

// ─── FATURA ATUAL DE UM CARTÃO ────────────────────────────────────────────────
export function getCurrentInvoice(
  card: CreditCard,
  installments: CardInstallment[],
): Invoice {
  return computeInvoice(card, installments, currentMonth());
}

// ─── PARCELAS DA FATURA ATUAL ────────────────────────────────────────────────
export function getCurrentInvoiceInstallments(
  card: CreditCard,
  installments: CardInstallment[],
): CardInstallment[] {
  const cm = currentMonth();
  return installments.filter(i => i.cardId === card.id && i.competenceMonth === cm);
}

// ─── PARCELAS POR MÊS DE COMPETÊNCIA ────────────────────────────────────────
export function getInstallmentsByMonth(
  installments: CardInstallment[],
  cardId: string,
  competenceMonth: string,
): CardInstallment[] {
  return installments.filter(
    i => i.cardId === cardId && i.competenceMonth === competenceMonth,
  );
}

// ─── COMPROMETIDO DE CARTÃO POR CATEGORIA ───────────────────────────────────
// Agrupa parcelas não pagas (passadas pré-filtradas pelo chamador) por categoryId
// da compra original. Útil para gráficos de categoria incluindo cartão.
export function getCardExpensesByCategory(
  installments: CardInstallment[],
  purchases: CardPurchase[],
): Record<string, number> {
  const result: Record<string, number> = {};
  installments
    .filter(i => !i.paid)
    .forEach(i => {
      const purchase = purchases.find(p => p.id === i.purchaseId);
      if (!purchase?.categoryId) return;
      result[purchase.categoryId] = (result[purchase.categoryId] ?? 0) + i.amount;
    });
  return result;
}

// ─── PARCELA DE ASSINATURA (mensal, gerada sob demanda) ──────────────────────
// ID determinístico por mês garante idempotência — nunca duplica.
export function generateSubscriptionInstallment(
  purchase: CardPurchase,
  _card: CreditCard,
  competenceMonth: string,
): CardInstallment {
  return {
    id: `${purchase.id}_sub_${competenceMonth}`,
    purchaseId: purchase.id,
    cardId: purchase.cardId,
    installmentNumber: 1,
    totalInstallments: 1,
    amount: purchase.amount,
    competenceMonth,
    paid: false,
  };
}

// ─── VALOR TOTAL DE UMA COMPRA PARCELADA ────────────────────────────────────
export function getPurchaseTotalPaid(
  purchase: CardPurchase,
  installments: CardInstallment[],
): { paid: number; remaining: number; totalInstallments: number; paidInstallments: number } {
  const purchaseInstallments = installments.filter(i => i.purchaseId === purchase.id);
  const paidInstallments = purchaseInstallments.filter(i => i.paid);
  const paid = paidInstallments.reduce((s, i) => s + i.amount, 0);
  const remaining = purchase.amount - paid;

  return {
    paid,
    remaining,
    totalInstallments: purchase.totalInstallments,
    paidInstallments: paidInstallments.length,
  };
}
