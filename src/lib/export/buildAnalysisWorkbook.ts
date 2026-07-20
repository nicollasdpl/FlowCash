import * as XLSX from "xlsx";
import type {
  Account,
  Budget,
  CardInstallment,
  CardPurchase,
  Category,
  CreditCard,
  Goal,
  Transaction,
} from "@/types/financial";
import {
  addMonths,
  currentMonth,
  getCardLimitSummary,
  getCurrentBalance,
  getMonthlyProjections,
  getProjectedBalance,
} from "@/engine/financialEngine";
import { computeInvoice } from "@/engine/invoiceEngine";
import { getSpentByCategory } from "@/engine/budgetEngine";

export interface AnalysisExportInput {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  cards: CreditCard[];
  purchases: CardPurchase[];
  installments: CardInstallment[];
  goals: Goal[];
}

const SHEET_NAMES = [
  "Resumo",
  "Categorias",
  "Contas",
  "Transacoes",
  "Cartoes",
  "Parcelas",
  "Previstos",
  "Orcamentos",
  "Metas",
] as const;

export type AnalysisSheetName = (typeof SHEET_NAMES)[number];

function endOfMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const last = new Date(y, m, 0);
  return `${yyyymm}-${String(last.getDate()).padStart(2, "0")}`;
}

function catName(categories: Category[], id: string): string {
  return categories.find(c => c.id === id)?.name ?? "—";
}

function accountName(accounts: Account[], id: string): string {
  return accounts.find(a => a.id === id)?.name ?? "—";
}

function cardName(cards: CreditCard[], id: string): string {
  return cards.find(c => c.id === id)?.name ?? "—";
}

function appendSheet(wb: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]) {
  const sheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ _: "" }]);
  if (rows.length === 0) {
    // empty placeholder — clear the dummy key for readability
    sheet["A1"] = { t: "s", v: "(vazio)" };
  }
  XLSX.utils.book_append_sheet(wb, sheet, name);
}

/** Monta o workbook de análise com todas as abas. */
export function buildAnalysisWorkbook(input: AnalysisExportInput): XLSX.WorkBook {
  const month = currentMonth();
  const monthEnd = endOfMonth(month);
  const excludedIncome = new Set(
    input.categories.filter(c => c.excludeFromReports).map(c => c.id),
  );

  const paidIncome = input.transactions
    .filter(
      t =>
        t.type === "income" &&
        t.status === "paid" &&
        t.paymentDate.startsWith(month) &&
        !excludedIncome.has(t.categoryId),
    )
    .reduce((s, t) => s + t.amount, 0);

  const spentMap = getSpentByCategory(
    month,
    input.transactions,
    input.installments,
    input.purchases,
  );
  const expenses = Object.values(spentMap).reduce((s, v) => s + v, 0);

  const balance = input.accounts
    .filter(a => a.active)
    .reduce((s, a) => s + getCurrentBalance(a, input.transactions), 0);

  const projections = getMonthlyProjections(
    input.accounts,
    input.transactions,
    6,
    input.installments,
  );

  const resumoRows: Record<string, unknown>[] = [
    {
      secao: "mes_atual",
      mes: month,
      receita: paidIncome,
      despesa: expenses,
      saldo_contas: balance,
      projetado_receita: null,
      projetado_despesa: null,
      projetado_saldo: null,
      risco: null,
    },
    ...projections.map(p => ({
      secao: "projecao",
      mes: p.month,
      receita: null,
      despesa: null,
      saldo_contas: null,
      projetado_receita: p.projectedIncome,
      projetado_despesa: p.projectedExpense,
      projetado_saldo: p.projectedBalance,
      risco: p.riskLevel,
    })),
  ];

  const categoryRows: Record<string, unknown>[] = [];
  for (let i = 0; i < 12; i++) {
    const m = addMonths(month, -i);
    const map = getSpentByCategory(m, input.transactions, input.installments, input.purchases);
    for (const [categoryId, valor] of Object.entries(map)) {
      if (valor === 0) continue;
      categoryRows.push({
        mes: m,
        categoria: catName(input.categories, categoryId),
        categoryId,
        valor,
      });
    }
  }
  categoryRows.sort((a, b) =>
    String(b.mes).localeCompare(String(a.mes)) ||
    Number(b.valor) - Number(a.valor),
  );

  const contasRows = input.accounts.map(a => ({
    id: a.id,
    nome: a.name,
    tipo: a.type,
    ativa: a.active,
    saldo_atual: getCurrentBalance(a, input.transactions),
    saldo_projetado_fim_mes: getProjectedBalance(
      a,
      input.transactions,
      monthEnd,
      input.cards,
      input.installments,
    ),
  }));

  const transacoesRows = [...input.transactions]
    .sort((a, b) => (b.paymentDate || "").localeCompare(a.paymentDate || ""))
    .map(t => ({
      id: t.id,
      data_pagamento: t.paymentDate,
      data_competencia: t.competenceDate,
      descricao: t.description,
      tipo: t.type,
      status: t.status,
      valor: t.amount,
      categoria: catName(input.categories, t.categoryId),
      conta: accountName(input.accounts, t.accountId),
      origem: t.origin,
    }));

  const cartoesRows = input.cards.map(card => {
    const summary = getCardLimitSummary(card, input.installments, input.purchases);
    const invoice = computeInvoice(card, input.installments, month);
    return {
      id: card.id,
      nome: card.name,
      bandeira: card.brand,
      ativo: card.active,
      limite_total: summary.totalLimit,
      limite_usado: summary.usedLimit,
      limite_disponivel: summary.availableLimit,
      fatura_mes: summary.currentInvoiceAmount,
      vencimento_fatura: invoice.dueDate,
      status_fatura: invoice.status,
    };
  });

  const purchaseById = new Map(input.purchases.map(p => [p.id, p]));
  const parcelasRows = [...input.installments]
    .sort((a, b) =>
      a.competenceMonth.localeCompare(b.competenceMonth) ||
      a.installmentNumber - b.installmentNumber,
    )
    .map(i => {
      const purchase = purchaseById.get(i.purchaseId);
      return {
        id: i.id,
        cartao: cardName(input.cards, i.cardId),
        descricao: purchase?.description ?? "—",
        competencia: i.competenceMonth,
        parcela: `${i.installmentNumber}/${i.totalInstallments}`,
        valor: i.amount,
        paga: i.paid,
        categoria: purchase
          ? catName(input.categories, purchase.categoryId)
          : "—",
        assinatura: purchase?.isSubscription ? true : false,
      };
    });

  const previstosTx = input.transactions
    .filter(t => t.status === "pending" || t.status === "overdue")
    .map(t => ({
      origem: "conta" as const,
      data: t.paymentDate,
      descricao: t.description,
      tipo: t.type,
      status: t.status,
      valor: t.amount,
      categoria: catName(input.categories, t.categoryId),
      conta_ou_cartao: accountName(input.accounts, t.accountId),
    }));

  const previstosCard = input.installments
    .filter(i => !i.paid && i.competenceMonth >= month)
    .map(i => {
      const purchase = purchaseById.get(i.purchaseId);
      return {
        origem: "cartao" as const,
        data: i.competenceMonth,
        descricao: purchase?.description ?? "—",
        tipo: "expense" as const,
        status: "pending" as const,
        valor: i.amount,
        categoria: purchase
          ? catName(input.categories, purchase.categoryId)
          : "—",
        conta_ou_cartao: cardName(input.cards, i.cardId),
      };
    });

  const previstosRows = [...previstosTx, ...previstosCard].sort((a, b) =>
    String(a.data).localeCompare(String(b.data)),
  );

  const orcamentosRows = input.budgets.map(b => {
    const spent = getSpentByCategory(
      b.month,
      input.transactions,
      input.installments,
      input.purchases,
    )[b.categoryId] ?? 0;
    const pct =
      b.limitAmount > 0 ? Math.round((spent / b.limitAmount) * 100) : null;
    return {
      mes: b.month,
      categoria: catName(input.categories, b.categoryId),
      limite: b.limitAmount,
      gasto: spent,
      percentual: pct,
      estourou: b.limitAmount > 0 && spent > b.limitAmount,
    };
  });

  const metasRows = input.goals.map(g => ({
    nome: g.name,
    atual: g.currentAmount,
    alvo: g.targetAmount,
    percentual:
      g.targetAmount > 0
        ? Math.round((g.currentAmount / g.targetAmount) * 100)
        : 0,
    prazo: g.deadline,
    concluida: g.completed,
    conta: accountName(input.accounts, g.accountId),
  }));

  const wb = XLSX.utils.book_new();
  appendSheet(wb, "Resumo", resumoRows);
  appendSheet(wb, "Categorias", categoryRows);
  appendSheet(wb, "Contas", contasRows);
  appendSheet(wb, "Transacoes", transacoesRows);
  appendSheet(wb, "Cartoes", cartoesRows);
  appendSheet(wb, "Parcelas", parcelasRows);
  appendSheet(wb, "Previstos", previstosRows);
  appendSheet(wb, "Orcamentos", orcamentosRows);
  appendSheet(wb, "Metas", metasRows);

  return wb;
}

export function getAnalysisSheetNames(wb: XLSX.WorkBook): string[] {
  return wb.SheetNames.slice();
}

/** Dispara download do .xlsx no browser. */
export function downloadAnalysisWorkbook(
  filename: string,
  wb: XLSX.WorkBook,
): void {
  const data = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAnalysisExcel(input: AnalysisExportInput): void {
  const wb = buildAnalysisWorkbook(input);
  const date = new Date().toISOString().split("T")[0];
  downloadAnalysisWorkbook(`flowcash_analise_${date}.xlsx`, wb);
}

export { SHEET_NAMES };
