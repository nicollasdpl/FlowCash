import type { FinancialContext } from "./types";

export function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Formata o bloco de contexto financeiro injetado no prompt do Gemini. */
export function formatFinancialContextBlock(ctx: FinancialContext): string {
  const { month, prevMonth, summary, byCategory, recentTransactions, recentPurchases, accounts, cards, goals, budgetAlerts } = ctx;

  const incomeStr = fmtBRL(summary.income);
  const expensesStr = fmtBRL(summary.expenses);
  const balanceStr = fmtBRL(summary.balance);
  const changeStr =
    summary.expenseChangePct !== null
      ? ` (${summary.expenseChangePct >= 0 ? "+" : ""}${summary.expenseChangePct}% vs ${prevMonth})`
      : "";

  const byCatLines =
    byCategory
      .filter(c => c.spent > 0)
      .map(c => {
        const budget =
          c.budget !== undefined
            ? ` / orçamento ${fmtBRL(c.budget)} (${c.budgetUsedPct ?? 0}% usado, faltam ${fmtBRL(c.budgetRemaining ?? 0)})`
            : "";
        const alert = c.overBudget ? " [ESTOURADO]" : "";
        return `  - ${c.name}: ${fmtBRL(c.spent)}${budget}${alert}`;
      })
      .join("\n") || "  (sem gastos no mês)";

  const recentLines =
    recentTransactions
      .slice(0, 10)
      .map(
        t =>
          `  - id=${t.id} | ${t.date} | ${t.type === "income" ? "+" : "−"}${fmtBRL(t.amount)} | ${t.description} (${t.category})`,
      )
      .join("\n") || "  (sem lançamentos recentes)";

  const purchaseLines =
    recentPurchases.length > 0
      ? recentPurchases
          .slice(0, 5)
          .map(p => `  - id=${p.id} | ${p.purchaseDate} | ${fmtBRL(p.amount)} | ${p.description} (${p.category}, cartão ${p.cardName})`)
          .join("\n")
      : "  (sem compras recentes no cartão)";

  const accountLines =
    accounts.length > 0
      ? accounts.map(a => `  - ${a.name}: saldo ${fmtBRL(a.currentBalance)} | projetado ${fmtBRL(a.projectedBalance)}`).join("\n")
      : "  (sem contas ativas)";

  const cardLines =
    cards.length > 0
      ? cards
          .map(
            c =>
              `  - ${c.name} (${c.brand}): fatura ${fmtBRL(c.currentInvoiceAmount)} (vence ${c.invoiceDueDate}) | limite usado ${fmtBRL(c.usedLimit)}/${fmtBRL(c.totalLimit)}`,
          )
          .join("\n")
      : "  (sem cartões)";

  const goalLines =
    goals.length > 0
      ? goals.map(g => `  - ${g.name}: ${fmtBRL(g.currentAmount)} de ${fmtBRL(g.targetAmount)} (${g.progressPct}%, prazo ${g.deadline})`).join("\n")
      : "  (sem metas ativas)";

  const alertLines =
    budgetAlerts.length > 0
      ? budgetAlerts.map(a => `  - ${a.name}: gastou ${fmtBRL(a.spent)} de ${fmtBRL(a.limit)} (passou ${fmtBRL(a.overBy)})`).join("\n")
      : "  (nenhum orçamento estourado)";

  return `

CONTEXTO FINANCEIRO ATUAL:
Mês: ${month}
Resumo do mês: receitas ${incomeStr} | despesas ${expensesStr}${changeStr} | saldo total das contas ${balanceStr}
Gastos por categoria (competência ${month}):
${byCatLines}
Alertas de orçamento:
${alertLines}
Saldos por conta:
${accountLines}
Cartões de crédito:
${cardLines}
Metas ativas:
${goalLines}
Últimos lançamentos (use id= para ações de apagar/editar):
${recentLines}
Compras recentes no cartão:
${purchaseLines}`;
}
