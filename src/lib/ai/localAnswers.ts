import type { FinancialContext } from "./types";
import { fmtBRL } from "./formatFinancialContextBlock";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} de ${y}`;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}

/** Detecta perguntas simples respondíveis localmente (sem Gemini). */
export function tryLocalAnswer(message: string, ctx: FinancialContext): string | null {
  const m = normalize(message);

  if (
    m.includes("quanto gastei esse mes") ||
    m.includes("quanto gastei este mes") ||
    m.includes("quanto gastei no mes") ||
    (m.includes("quanto gastei") && !m.includes("categoria"))
  ) {
    const top = ctx.byCategory.filter(c => c.spent > 0).slice(0, 3);
    const topLines = top.map(c => `- **${c.name}**: ${fmtBRL(c.spent)}`).join("\n");
    const change =
      ctx.summary.expenseChangePct !== null
        ? ` Isso é **${ctx.summary.expenseChangePct >= 0 ? "+" : ""}${ctx.summary.expenseChangePct}%** em relação ao mês anterior.`
        : "";
    return `Em **${monthLabel(ctx.month)}**, você gastou **${fmtBRL(ctx.summary.expenses)}**.${change}\n\nMaiores categorias:\n${topLines || "- (sem gastos registrados)"}`;
  }

  const budgetMatch =
    /falta quanto pro? or[cç]amento de (.+)/.exec(m) ||
    /quanto falta (?:pro?|para o?) or[cç]amento de (.+)/.exec(m) ||
    /or[cç]amento de (.+) quanto falta/.exec(m);

  if (budgetMatch) {
    const query = budgetMatch[1].replace(/\?$/, "").trim();
    const cat = ctx.byCategory.find(c => normalize(c.name).includes(query) || query.includes(normalize(c.name)));
    if (!cat || cat.budget === undefined) {
      return `Não encontrei orçamento para **${query}** em ${monthLabel(ctx.month)}.`;
    }
    const remaining = Math.max(0, cat.budget - cat.spent);
    if (cat.overBudget) {
      return `Seu orçamento de **${cat.name}** é **${fmtBRL(cat.budget)}**. Você já gastou **${fmtBRL(cat.spent)}** — passou **${fmtBRL(cat.spent - cat.budget)}** do limite.`;
    }
    return `Seu orçamento de **${cat.name}** é **${fmtBRL(cat.budget)}**. Você já gastou **${fmtBRL(cat.spent)}**, faltam **${fmtBRL(remaining)}**.`;
  }

  if (m.includes("resumo do mes") || m.includes("resumo desse mes") || m === "resumo") {
    const lines = [
      `- Receitas: **${fmtBRL(ctx.summary.income)}**`,
      `- Despesas: **${fmtBRL(ctx.summary.expenses)}**`,
      `- Saldo das contas: **${fmtBRL(ctx.summary.balance)}**`,
    ];
    if (ctx.budgetAlerts.length > 0) {
      lines.push(`- Orçamentos estourados: **${ctx.budgetAlerts.map(a => a.name).join(", ")}**`);
    }
    return `Resumo de **${monthLabel(ctx.month)}**:\n${lines.join("\n")}`;
  }

  if (m.includes("qual meu saldo") || m.includes("quanto tenho") || m.includes("saldo das contas")) {
    const accLines = ctx.accounts.map(a => `- **${a.name}**: ${fmtBRL(a.currentBalance)}`).join("\n");
    return `Saldo total: **${fmtBRL(ctx.summary.balance)}**\n\nPor conta:\n${accLines || "- (sem contas)"}`;
  }

  if (m.includes("fatura") && (m.includes("cartao") || m.includes("cartão") || ctx.cards.length === 1)) {
    const card = ctx.cards[0];
    if (!card) return null;
    return `Fatura de **${card.name}** (${card.brand}): **${fmtBRL(card.currentInvoiceAmount)}**, vence em **${card.invoiceDueDate}**. Limite disponível: **${fmtBRL(card.availableLimit)}**.`;
  }

  return null;
}
