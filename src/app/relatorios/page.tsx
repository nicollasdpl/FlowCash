"use client";
import { useState, useMemo, type ReactNode } from "react";
import { useApp } from "@/context/AppContext";
import { addMonths, currentMonth, fmt, isBalanceNegative, isBalancePositive } from "@/engine/financialEngine";
import { getSpentByCategory } from "@/engine/budgetEngine";
import { getConsumptionByCategory } from "@/app/relatorios/consumptionByCategory";
import { auth } from "@/lib/firebase";
import DonutChart, { type Segment } from "@/components/DonutChart";
import SpendingHeatmapCalendar from "@/components/SpendingHeatmapCalendar";
import CategoryIcon from "@/components/CategoryIcon";
import {
  ChevronLeft, ChevronRight, BarChart2, AlertTriangle, TrendingUp,
  TrendingDown, Sparkles, Package,
} from "lucide-react";

// ─── Constantes / helpers de mês ─────────────────────────────────────────────

const MONTH_SHORT: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function shortMonth(yyyymm: string): string {
  const [, m] = yyyymm.split("-");
  return MONTH_SHORT[m] ?? yyyymm;
}
function fullMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
function fmtShort(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return v.toFixed(0);
}

// ─── Markdown mínimo (mesma regra do AIPageContent.tsx) ──────────────────────

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
      return <strong key={i} style={{ color: "var(--text-1)" }}>{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

function Markdown({ text }: { text: string }) {
  type Block = { kind: "p" | "ul"; lines: string[] };
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (current) { blocks.push(current); current = null; }
      continue;
    }
    const listMatch = /^\s*-\s+(.*)$/.exec(line);
    if (listMatch) {
      if (current?.kind !== "ul") {
        if (current) blocks.push(current);
        current = { kind: "ul", lines: [] };
      }
      current.lines.push(listMatch[1]);
    } else {
      if (current?.kind !== "p") {
        if (current) blocks.push(current);
        current = { kind: "p", lines: [] };
      }
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return (
    <>
      {blocks.map((b, i) => b.kind === "ul" ? (
        <ul key={i} style={{ margin: "6px 0 0", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "3px" }}>
          {b.lines.map((l, j) => <li key={j} style={{ lineHeight: 1.5 }}>{renderInline(l)}</li>)}
        </ul>
      ) : (
        <p key={i} style={{ margin: i === 0 ? 0 : "8px 0 0", lineHeight: 1.5 }}>{renderInline(b.lines.join(" "))}</p>
      ))}
    </>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────

type CategoryViewMode = "invoice" | "consumption";

export default function Relatorios() {
  const { state } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonth());
  const [categoryView, setCategoryView] = useState<CategoryViewMode>("invoice");

  const [insights, setInsights]               = useState<string>("");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError]     = useState<string>("");

  const atCurrentMonth = selectedMonth === currentMonth();

  function changeMonth(delta: number) {
    const next = addMonths(selectedMonth, delta);
    if (delta > 0 && next > currentMonth()) return;
    setSelectedMonth(next);
  }

  // ── Janela de 3 meses (selecionado + 2 anteriores) ───────────────────────
  const months = useMemo(
    () => [addMonths(selectedMonth, -2), addMonths(selectedMonth, -1), selectedMonth],
    [selectedMonth],
  );

  // ── Dados por mês (paymentDate p/ resumo, competenceDate p/ categoria) ───
  const monthData = useMemo(() => months.map(month => {
    const paidIncome = state.transactions
      .filter(t => t.type === "income" && t.status === "paid" && t.paymentDate.startsWith(month))
      .reduce((s, t) => s + t.amount, 0);
    const paidExpense = state.transactions
      .filter(t => t.type === "expense" && t.status === "paid" && t.paymentDate.startsWith(month))
      .reduce((s, t) => s + t.amount, 0);
    return { month, income: paidIncome, expense: paidExpense };
  }), [months, state.transactions]);

  const selectedData = monthData[2];
  const balance      = selectedData.income - selectedData.expense;
  const maxChartVal  = Math.max(...monthData.flatMap(d => [d.income, d.expense]), 1);

  // ── Maior gasto (categoria) no mês selecionado — competenceDate ──────────
  // Inclui transactions de despesa + parcelas de cartão com competência no mês.
  const spentByCatSelected = useMemo(
    () => getSpentByCategory(selectedMonth, state.transactions, state.installments, state.purchases),
    [selectedMonth, state.transactions, state.installments, state.purchases],
  );
  const spentByCatPrev = useMemo(
    () => getSpentByCategory(months[1], state.transactions, state.installments, state.purchases),
    [months, state.transactions, state.installments, state.purchases],
  );

  const consumptionByCatSelected = useMemo(
    () => getConsumptionByCategory(selectedMonth, state.transactions, state.purchases),
    [selectedMonth, state.transactions, state.purchases],
  );
  const consumptionByCatPrev = useMemo(
    () => getConsumptionByCategory(months[1], state.transactions, state.purchases),
    [months, state.transactions, state.purchases],
  );

  const activeSpentByCat = categoryView === "invoice" ? spentByCatSelected : consumptionByCatSelected;
  const activeSpentByCatPrev = categoryView === "invoice" ? spentByCatPrev : consumptionByCatPrev;

  const biggestCategory = useMemo(() => {
    let topId = ""; let topVal = 0;
    for (const [catId, amount] of Object.entries(spentByCatSelected)) {
      if (amount > topVal) { topId = catId; topVal = amount; }
    }
    const cat = state.categories.find(c => c.id === topId);
    return cat ? { name: cat.name, amount: topVal, color: cat.color } : null;
  }, [spentByCatSelected, state.categories]);

  // ── Projeção (só mês corrente) ───────────────────────────────────────────
  const projection = useMemo(() => {
    if (!atCurrentMonth) return null;

    // Realizado: despesas já pagas com pagamento no mês.
    const realized = state.transactions
      .filter(t => t.type === "expense" && t.status === "paid" && t.paymentDate.startsWith(selectedMonth))
      .reduce((s, t) => s + t.amount, 0);

    // Futuro conhecido: despesas a pagar (pending/overdue) no mês
    // + parcelas de cartão não pagas com competência no mês.
    const pendingTx = state.transactions
      .filter(t => t.type === "expense" && t.status !== "paid" && t.paymentDate.startsWith(selectedMonth))
      .reduce((s, t) => s + t.amount, 0);
    const unpaidInstallments = state.installments
      .filter(i => i.competenceMonth === selectedMonth && !i.paid)
      .reduce((s, i) => s + i.amount, 0);
    const futureKnown = pendingTx + unpaidInstallments;

    const projected = realized + futureKnown;
    const income    = selectedData.income;
    return { projected, realized, futureKnown, income, danger: projected > income && income > 0 };
  }, [atCurrentMonth, selectedMonth, state.transactions, state.installments, selectedData.income]);

  // ── Donut + lista de categorias (mês selecionado vs anterior) ────────────
  type CatRow = { id: string; name: string; color: string; icon: string; spent: number; prevSpent: number; pct: number; variation: number | null };
  const catRows: CatRow[] = useMemo(() => {
    const totalSpent = Object.values(activeSpentByCat).reduce((s, v) => s + v, 0);
    return Object.entries(activeSpentByCat)
      .map(([catId, spent]) => {
        const cat       = state.categories.find(c => c.id === catId);
        const prevSpent = activeSpentByCatPrev[catId] ?? 0;
        const variation = prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : null;
        const pct       = totalSpent > 0 ? (spent / totalSpent) * 100 : 0;
        return {
          id:    catId,
          name:  cat?.name  ?? "—",
          color: cat?.color ?? "#6B7FA3",
          icon:  cat?.icon  ?? "",
          spent, prevSpent, pct, variation,
        };
      })
      .sort((a, b) => b.spent - a.spent);
  }, [activeSpentByCat, activeSpentByCatPrev, state.categories]);

  const donutTotal = catRows.reduce((s, r) => s + r.spent, 0);

  // DonutChart consome percentages somando ~100. Arredonda mas joga o resto
  // no maior segmento pra não sobrar gap fantasma.
  const donutSegments: Segment[] = useMemo(() => {
    if (catRows.length === 0 || donutTotal === 0) return [];
    const rounded = catRows.map(r => ({
      name: r.name,
      color: r.color,
      amount: r.spent,
      percentage: Math.round((r.spent / donutTotal) * 100),
    }));
    const sum  = rounded.reduce((s, r) => s + r.percentage, 0);
    const drift = 100 - sum;
    if (drift !== 0 && rounded.length > 0) rounded[0].percentage += drift;
    return rounded;
  }, [catRows, donutTotal]);

  // ── Orçamentos do mês ────────────────────────────────────────────────────
  const budgetsThisMonth = useMemo(
    () => state.budgets.filter(b => b.month === selectedMonth),
    [state.budgets, selectedMonth],
  );

  // ── Insights IA ──────────────────────────────────────────────────────────
  async function fetchInsights() {
    setInsightsLoading(true);
    setInsightsError("");

    const user = auth.currentUser;
    if (!user) {
      setInsightsLoading(false);
      setInsightsError("Faça login para gerar insights.");
      return;
    }
    let idToken: string;
    try { idToken = await user.getIdToken(); }
    catch {
      setInsightsLoading(false);
      setInsightsError("Não consegui validar sua sessão.");
      return;
    }

    // Monta texto dos 3 meses dentro da pergunta. Evita "R$" e verbos monetários
    // pra que detectIntent classifique como "question" (heurística pelo fallback).
    const linesPorMes = monthData.map(d => {
      const m = fullMonth(d.month);
      const cats = Object.entries(getSpentByCategory(d.month, state.transactions, state.installments, state.purchases))
        .map(([catId, amount]) => {
          const cat = state.categories.find(c => c.id === catId);
          return { name: cat?.name ?? "—", amount };
        })
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
      const catsStr = cats.length === 0
        ? "sem despesas"
        : cats.map(c => `${c.name} ${c.amount.toFixed(2)}`).join(", ");
      return `- ${m}: receitas ${d.income.toFixed(2)}, despesas ${d.expense.toFixed(2)}, categorias ${catsStr}`;
    }).join("\n");

    const message =
      `Analise meus últimos 3 meses financeiros e me dê 3 insights práticos e objetivos. ` +
      `Aponte o maior problema e uma ação concreta para corrigir.\n\n` +
      `Histórico:\n${linesPorMes}`;

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          message,
          categories: state.categories.filter(c => !c.isSystem),
          accounts: state.accounts.filter(a => a.active),
          cards: state.cards,
        }),
      });
      const data = await res.json();
      if (data.intent === "question" && typeof data.answer === "string" && data.answer.trim()) {
        setInsights(data.answer.trim());
      } else if (data.intent === "error") {
        setInsightsError(data.message || "Erro ao gerar insights.");
      } else if (data.intent === "unknown") {
        setInsightsError(data.message || "Não consegui gerar insights com os dados disponíveis.");
      } else {
        setInsightsError("Resposta inesperada da IA.");
      }
    } catch {
      setInsightsError("Sem conexão. Verifique sua internet.");
    } finally {
      setInsightsLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "20px 16px", maxWidth: "680px", margin: "0 auto" }}>

      {/* ── Header com nav de mês ────────────────────────────────────────── */}
      <div className="fade-up-1" style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em", marginBottom: "12px" }}>
          Relatórios
        </h1>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", padding: "4px",
        }}>
          <button
            onClick={() => changeMonth(-1)}
            aria-label="Mês anterior"
            style={{
              background: "none", border: "none", color: "var(--text-2)", cursor: "pointer",
              padding: "8px 14px", minHeight: "44px", minWidth: "44px",
              display: "flex", alignItems: "center", justifyContent: "center",
              touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
            }}
          >
            <ChevronLeft size={18} strokeWidth={1.5} />
          </button>
          <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)", flex: 1, textAlign: "center" }}>
            {fullMonth(selectedMonth)}
          </p>
          <button
            onClick={() => changeMonth(1)}
            disabled={atCurrentMonth}
            aria-label="Próximo mês"
            style={{
              background: "none", border: "none",
              color: atCurrentMonth ? "var(--text-3)" : "var(--text-2)",
              cursor: atCurrentMonth ? "default" : "pointer",
              opacity: atCurrentMonth ? 0.4 : 1,
              padding: "8px 14px", minHeight: "44px", minWidth: "44px",
              display: "flex", alignItems: "center", justifyContent: "center",
              touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
            }}
          >
            <ChevronRight size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ── SEÇÃO 1: Resumo do mês (2x2) ────────────────────────────────── */}
      <div className="fade-up-2" style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px",
      }}>
        <SummaryCard
          label="Receitas" value={`R$ ${fmt(selectedData.income)}`}
          valueColor="var(--green)"
        />
        <SummaryCard
          label="Despesas" value={`R$ ${fmt(selectedData.expense)}`}
          valueColor="var(--red)"
        />
        <SummaryCard
          label="Saldo líquido"
          value={`${isBalanceNegative(balance) ? "−" : ""}R$ ${fmt(Math.abs(balance))}`}
          valueColor={isBalanceNegative(balance) ? "var(--red)" : isBalancePositive(balance) ? "var(--accent)" : "var(--text-2)"}
        />
        <SummaryCard
          label="Maior gasto"
          value={biggestCategory ? `R$ ${fmt(biggestCategory.amount)}` : "—"}
          valueColor={biggestCategory?.color ?? "var(--text-3)"}
          subtitle={biggestCategory?.name}
        />
      </div>

      {/* ── SEÇÃO 2: Projeção (só mês corrente) ─────────────────────────── */}
      {projection && (
        <div className="card fade-up-3" style={{ padding: "16px 18px", marginBottom: "16px" }}>
          <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "8px" }}>
            Projeção de fechamento
          </p>
          <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
            <p className="mono" style={{
              fontSize: "22px", fontWeight: 700,
              color: projection.danger ? "var(--red)" : "var(--text-1)",
            }}>
              R$ {fmt(projection.projected)}
            </p>
            <p style={{ fontSize: "11.5px", color: "var(--text-3)" }}>
              estimado até o fim do mês
            </p>
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-3)", lineHeight: 1.5 }}>
            Baseado em gastos realizados + compromissos futuros do mês.
            Receita do mês: <span style={{ color: "var(--green)", fontWeight: 600 }}>R$ {fmt(projection.income)}</span>.
          </p>
          {projection.danger && (
            <div style={{
              marginTop: "12px",
              padding: "10px 12px",
              background: "var(--red-10)", border: "1px solid var(--red-20)",
              borderRadius: "10px",
              display: "flex", alignItems: "center", gap: "10px",
            }}>
              <AlertTriangle size={16} strokeWidth={1.5} color="var(--red)" />
              <p style={{ fontSize: "12.5px", color: "var(--red)", fontWeight: 600, lineHeight: 1.4 }}>
                Você pode fechar o mês no negativo.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── SEÇÃO 3: Evolução mensal (bar + line) ───────────────────────── */}
      <div className="card fade-up-4" style={{ padding: "16px 18px", marginBottom: "16px" }}>
        <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "14px" }}>
          Evolução mensal · 3 meses
        </p>

        <BarLineChart data={monthData} max={maxChartVal} />

        <div style={{
          display: "flex", gap: "14px", marginTop: "12px",
          paddingTop: "12px", borderTop: "1px solid var(--border)",
        }}>
          <Legend color="var(--red)"   label="Despesas" shape="bar"  />
          <Legend color="var(--green)" label="Receitas" shape="line" />
        </div>
      </div>

      {/* ── SEÇÃO 4: Mapa de calor — gastos por dia ─────────────────────── */}
      <div className="card fade-up-5" style={{ padding: "16px 18px", marginBottom: "16px" }}>
        <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "14px" }}>
          Gastos por dia
        </p>
        <SpendingHeatmapCalendar
          month={selectedMonth}
          transactions={state.transactions}
          installments={state.installments}
          purchases={state.purchases}
        />
      </div>

      {/* ── SEÇÃO 5: Categorias (donut + lista com variação) ────────────── */}
      <div className="card fade-up-5" style={{ overflow: "hidden", marginBottom: "16px" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "12px" }}>
            Gastos por categoria
          </p>
          <div style={{
            display: "flex", gap: "6px",
            padding: "3px", background: "rgba(255,255,255,0.04)",
            borderRadius: "10px", border: "1px solid var(--border)",
          }}>
            {([
              { id: "invoice" as const, label: "Por fatura" },
              { id: "consumption" as const, label: "Consumo real" },
            ]).map(opt => (
              <button
                key={opt.id}
                onClick={() => setCategoryView(opt.id)}
                style={{
                  flex: 1, padding: "8px 6px", borderRadius: "8px",
                  border: categoryView === opt.id ? "1px solid var(--border-accent)" : "1px solid transparent",
                  fontSize: "11.5px", fontWeight: 700, fontFamily: "inherit",
                  cursor: "pointer", touchAction: "manipulation",
                  background: categoryView === opt.id ? "var(--accent-10)" : "transparent",
                  color: categoryView === opt.id ? "var(--accent)" : "var(--text-3)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {categoryView === "consumption" && (
            <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "10px", lineHeight: 1.4 }}>
              Gastos pela data em que você consumiu ou comprou. Pode diferir do total da fatura do mesmo mês.
            </p>
          )}
        </div>

        {donutSegments.length === 0 ? (
          <div style={{ padding: "32px 18px", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--text-3)" }}>
              Sem despesas em {fullMonth(selectedMonth)}.
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "center", padding: "20px 18px 8px" }}>
              <DonutChart
                segments={donutSegments}
                totalLabel="Total"
                total={`R$ ${fmtShort(donutTotal)}`}
              />
            </div>

            <div style={{ padding: "4px 18px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {catRows.map(row => (
                <div key={row.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    {row.icon
                      ? <CategoryIcon icon={row.icon} color={row.color} size={16} />
                      : <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: row.color }} />}
                    <span style={{ fontSize: "13px", color: "var(--text-1)", fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.name}
                    </span>
                    <VariationBadge variation={row.variation} />
                    <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)" }}>
                      R$ {fmt(row.spent)}
                    </span>
                  </div>
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: `${Math.min(row.pct, 100)}%`, background: row.color }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── SEÇÃO 6: Orçamentos (só se houver) ──────────────────────────── */}
      {budgetsThisMonth.length > 0 && (
        <div className="card fade-up-5" style={{ overflow: "hidden", marginBottom: "16px" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              Orçamentos do mês
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {budgetsThisMonth.map((budget, i) => {
              const cat       = state.categories.find(c => c.id === budget.categoryId);
              const spent     = spentByCatSelected[budget.categoryId] ?? 0;
              const pct       = budget.limitAmount > 0 ? Math.round((spent / budget.limitAmount) * 100) : 0;
              const over      = spent > budget.limitAmount;
              const barColor  = over ? "var(--red)" : pct > 80 ? "var(--amber)" : (cat?.color ?? "var(--accent)");
              const pctColor  = over ? "var(--red)" : pct > 80 ? "var(--amber)" : "var(--text-2)";
              return (
                <div key={budget.id} style={{
                  padding: "12px 18px",
                  borderBottom: i < budgetsThisMonth.length - 1 ? "1px solid var(--border)" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    {cat?.icon
                      ? <CategoryIcon icon={cat.icon} color={cat.color} size={16} />
                      : <Package size={16} strokeWidth={1.5} color="var(--text-3)" />}
                    <span style={{ fontSize: "13px", color: "var(--text-1)", fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {cat?.name ?? "—"}
                    </span>
                    <span className="mono" style={{ fontSize: "12.5px", fontWeight: 700, color: over ? "var(--red)" : "var(--text-1)" }}>
                      R$ {fmt(spent)}
                    </span>
                    <span className="mono" style={{ fontSize: "11px", color: "var(--text-3)" }}>
                      / R$ {fmt(budget.limitAmount)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div className="progress-bar-bg" style={{ flex: 1 }}>
                      <div className="progress-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                    </div>
                    <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: pctColor, minWidth: "36px", textAlign: "right" }}>
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SEÇÃO 7: Insights IA ────────────────────────────────────────── */}
      <div className="card fade-up-5" style={{ padding: "16px 18px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <Sparkles size={14} strokeWidth={1.5} color="var(--accent)" />
          <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
            Insights da IA
          </p>
        </div>

        {!insights && !insightsLoading && !insightsError && (
          <p style={{ fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.5, marginBottom: "12px" }}>
            A IA analisa seus últimos 3 meses e devolve 3 observações práticas com uma ação concreta. Gera só quando você pedir.
          </p>
        )}

        {insightsLoading && (
          <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5 }}>
            Analisando seus dados...
          </p>
        )}

        {insightsError && (
          <div style={{
            padding: "10px 12px", marginBottom: "12px",
            background: "var(--red-10)", border: "1px solid var(--red-20)",
            borderRadius: "10px",
          }}>
            <p style={{ fontSize: "12.5px", color: "var(--red)", lineHeight: 1.4 }}>
              {insightsError}
            </p>
          </div>
        )}

        {insights && !insightsLoading && (
          <div style={{ fontSize: "13px", color: "var(--text-2)", marginBottom: "14px" }}>
            <Markdown text={insights} />
          </div>
        )}

        {!insightsLoading && (
          <button
            onClick={fetchInsights}
            style={{
              padding: "10px 16px",
              background: "var(--accent)", border: "none",
              borderRadius: "10px",
              color: "#06100E", fontSize: "13px", fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", touchAction: "manipulation",
              display: "inline-flex", alignItems: "center", gap: "6px",
            }}
          >
            <Sparkles size={13} strokeWidth={1.5} />
            {insights ? "Atualizar insights" : "Gerar insights"}
          </button>
        )}
      </div>

      {/* Sem dados global (3 meses todos zerados) */}
      {monthData.every(d => d.income === 0 && d.expense === 0) && (
        <div className="card" style={{ padding: "32px 18px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px", color: "var(--text-3)" }}>
            <BarChart2 size={36} strokeWidth={1.5} />
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-3)" }}>
            Sem dados em {fullMonth(selectedMonth)} e nos 2 meses anteriores.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, valueColor, subtitle }: {
  label: string; value: string; valueColor: string; subtitle?: string;
}) {
  return (
    <div className="card" style={{ padding: "12px 14px", minWidth: 0 }}>
      <p style={{ fontSize: "9px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "6px" }}>
        {label}
      </p>
      <p className="mono" style={{
        fontSize: "15px", fontWeight: 700, color: valueColor,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value}
      </p>
      {subtitle && (
        <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Legend({ color, label, shape }: { color: string; label: string; shape: "bar" | "line" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      {shape === "bar" ? (
        <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: color }} />
      ) : (
        <div style={{ width: "14px", height: "2px", background: color, borderRadius: "1px" }} />
      )}
      <span style={{ fontSize: "11.5px", color: "var(--text-2)" }}>{label}</span>
    </div>
  );
}

function VariationBadge({ variation }: { variation: number | null }) {
  if (variation === null || !isFinite(variation)) return null;
  const isUp = variation > 0;
  const isFlat = Math.abs(variation) < 1;
  if (isFlat) return null;
  const color = isUp ? "var(--red)" : "var(--green)";
  const bg    = isUp ? "var(--red-10)" : "var(--green-10)";
  const Arrow = isUp ? TrendingUp : TrendingDown;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "3px",
      padding: "2px 6px", borderRadius: "6px",
      background: bg, color,
      fontSize: "10.5px", fontWeight: 700,
    }}>
      <Arrow size={10} strokeWidth={1.5} />
      {isUp ? "+" : ""}{Math.round(variation)}%
    </span>
  );
}

// ─── Bar + Line chart (SVG inline) ───────────────────────────────────────────
// Layout: HTML divs para barras (estiramento natural via height %), SVG overlay
// pra linha (vectorEffect non-scaling-stroke evita borrar quando estica).

function BarLineChart({ data, max }: { data: { month: string; income: number; expense: number }[]; max: number }) {
  const Y_TICKS = 4; // 4 marcações (0, max/3, 2max/3, max)

  return (
    <div style={{ position: "relative", height: "180px" }}>
      {/* Y-axis labels + grid */}
      <div style={{ position: "absolute", inset: "0 0 25px 0", paddingLeft: "44px" }}>
        {Array.from({ length: Y_TICKS }).map((_, i) => {
          const value = (max * (Y_TICKS - 1 - i)) / (Y_TICKS - 1);
          return (
            <div key={i} style={{
              position: "absolute", left: 0, right: 0,
              top: `${(i / (Y_TICKS - 1)) * 100}%`,
              borderTop: i === Y_TICKS - 1 ? "1px solid var(--text-3)" : "1px dashed rgba(255,255,255,0.06)",
            }}>
              <span style={{
                position: "absolute", right: `calc(100% + 6px)`, top: "-7px",
                fontSize: "9px", color: "var(--text-3)",
                fontFamily: "var(--font-space-mono, monospace)",
                whiteSpace: "nowrap",
              }}>
                {fmtShort(value)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Bars + line area */}
      <div style={{ position: "absolute", inset: "0 0 25px 44px" }}>
        {/* Bars */}
        <div style={{ position: "absolute", inset: 0, display: "flex" }}>
          {data.map((d, i) => (
            <div key={i} style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <div style={{
                width: "44%",
                height: `${(d.expense / max) * 100}%`,
                background: "var(--red)",
                borderRadius: "4px 4px 0 0",
                minHeight: d.expense > 0 ? "3px" : "0",
                opacity: d.expense > 0 ? 1 : 0.15,
                transition: "height 0.4s ease",
              }} />
            </div>
          ))}
        </div>

        {/* Line overlay */}
        <svg
          width="100%" height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
        >
          <polyline
            fill="none"
            stroke="var(--green)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            points={data.map((d, i) =>
              `${((i + 0.5) * 100) / data.length},${100 - (d.income / max) * 100}`
            ).join(" ")}
          />
          {data.map((d, i) => (
            <circle
              key={i}
              cx={((i + 0.5) * 100) / data.length}
              cy={100 - (d.income / max) * 100}
              r="3"
              fill="var(--bg-card)"
              stroke="var(--green)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>

      {/* Month labels */}
      <div style={{ position: "absolute", bottom: 0, left: "44px", right: 0, display: "flex", height: "20px" }}>
        {data.map((d, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center",
            fontSize: "10.5px", color: "var(--text-3)", fontWeight: 600,
          }}>
            {shortMonth(d.month)}
          </div>
        ))}
      </div>
    </div>
  );
}
