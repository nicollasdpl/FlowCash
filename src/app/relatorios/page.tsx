"use client";
import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { addMonths, currentMonth } from "@/engine/financialEngine";
import { getSpentByCategory } from "@/engine/budgetEngine";
import {
  averageResult,
  buildReportActions,
  getBudgetPace,
  getCategoryOutliers,
  getFutureCommitments,
  getMonthlyResults,
  getRecurringCosts,
  getSpendingRoom,
  localDateStr,
  type ActionTarget,
} from "@/engine/reportInsightsEngine";
import SpendingHeatmapCalendar from "@/components/SpendingHeatmapCalendar";
import { ChevronLeft, ChevronRight, CalendarDays, PieChart, Sparkles } from "lucide-react";
import CollapsibleCard from "./components/CollapsibleCard";
import DecisionHero from "./components/DecisionHero";
import ActionList from "./components/ActionList";
import SummaryGrid from "./components/SummaryGrid";
import CategoryOutliers from "./components/CategoryOutliers";
import BudgetPace from "./components/BudgetPace";
import FutureCommitments from "./components/FutureCommitments";
import RecurringCosts from "./components/RecurringCosts";
import EvolutionChart from "./components/EvolutionChart";
import CategoriesSection from "./components/CategoriesSection";
import AIInsights from "./components/AIInsights";
import { brl, fullMonth, monthOnly } from "./components/format";

const SECTION_ID: Record<ActionTarget, string> = {
  hero: "rel-hero",
  summary: "rel-summary",
  outliers: "rel-outliers",
  budgets: "rel-budgets",
  future: "rel-future",
  recurring: "rel-recurring",
};

const EVOLUTION_MONTHS = 6;
const LOOKBACK = 3;

export default function Relatorios() {
  const { state } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonth());

  const todayStr = localDateStr(new Date());
  const thisMonth = todayStr.slice(0, 7);
  const atCurrentMonth = selectedMonth === thisMonth;

  function changeMonth(delta: number) {
    const next = addMonths(selectedMonth, delta);
    if (delta > 0 && next > thisMonth) return;
    setSelectedMonth(next);
  }

  const evolutionMonths = useMemo(
    () => Array.from({ length: EVOLUTION_MONTHS }, (_, i) => addMonths(selectedMonth, i - (EVOLUTION_MONTHS - 1))),
    [selectedMonth],
  );

  const results = useMemo(
    () => getMonthlyResults(evolutionMonths, state.transactions, state.installments, state.purchases, state.categories),
    [evolutionMonths, state.transactions, state.installments, state.purchases, state.categories],
  );
  const result = results[results.length - 1];
  const average = useMemo(() => averageResult(results.slice(-1 - LOOKBACK, -1)), [results]);

  const room = useMemo(
    () => atCurrentMonth
      ? getSpendingRoom(state.accounts, state.transactions, state.cards, state.installments, todayStr)
      : null,
    [atCurrentMonth, state.accounts, state.transactions, state.cards, state.installments, todayStr],
  );

  const outliers = useMemo(
    () => getCategoryOutliers(selectedMonth, state.transactions, state.installments, state.purchases, LOOKBACK),
    [selectedMonth, state.transactions, state.installments, state.purchases],
  );
  const hasHistory = average !== null;

  const spentByCat = useMemo(
    () => getSpentByCategory(selectedMonth, state.transactions, state.installments, state.purchases),
    [selectedMonth, state.transactions, state.installments, state.purchases],
  );
  const budgetPace = useMemo(
    () => getBudgetPace(state.budgets, spentByCat, selectedMonth, todayStr),
    [state.budgets, spentByCat, selectedMonth, todayStr],
  );

  const commitments = useMemo(
    () => getFutureCommitments(state.installments, state.purchases, thisMonth, 6),
    [state.installments, state.purchases, thisMonth],
  );
  const recurring = useMemo(
    () => getRecurringCosts(state.transactions, state.installments, state.purchases, thisMonth),
    [state.transactions, state.installments, state.purchases, thisMonth],
  );

  const categoryName = useMemo(() => {
    const byId = new Map(state.categories.map(c => [c.id, c.name]));
    return (id: string) => byId.get(id) ?? "Sem categoria";
  }, [state.categories]);

  const actions = useMemo(
    () => buildReportActions({
      room,
      result,
      average,
      outliers,
      budgets: budgetPace,
      releases: commitments.releases,
      recurring,
      categoryName,
      monthClosed: selectedMonth < thisMonth,
    }),
    [room, result, average, outliers, budgetPace, commitments.releases, recurring, categoryName, selectedMonth, thisMonth],
  );

  const averageIncome = average?.income ?? 0;

  function goTo(target: ActionTarget) {
    document.getElementById(SECTION_ID[target])?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function buildAIContext(): string {
    const n = (v: number) => v.toFixed(2);
    const lines: string[] = [`Mês analisado: ${fullMonth(selectedMonth)}${atCurrentMonth ? " (em andamento)" : ""}.`];
    if (room) {
      lines.push(
        `Espaço até o fim do mês: saldo projetado ${n(room.free)}, ${n(room.perDay)} por dia em ${room.daysLeft} dias. ` +
        `Fatura que vence em ${monthOnly(room.nextMonth)}: ${n(room.nextInvoice)}.`,
      );
    }
    lines.push("Resultado mensal (receita caixa / despesa por competência / sobra / taxa de poupança):");
    for (const r of results) {
      lines.push(`- ${fullMonth(r.month)}: ${n(r.income)} / ${n(r.expense)} / ${n(r.net)} / ${r.savingsRate === null ? "sem receita" : `${Math.round(r.savingsRate * 100)}%`}`);
    }
    if (outliers.length > 0) {
      lines.push("Categorias acima da média dos meses anteriores:");
      for (const o of outliers.slice(0, 5)) {
        lines.push(`- ${categoryName(o.categoryId)}: ${n(o.current)} contra média ${n(o.average)} (excesso ${n(o.excess)})`);
      }
    }
    const riskyBudgets = budgetPace.filter(b => b.status !== "ok");
    if (riskyBudgets.length > 0) {
      lines.push("Orçamentos em risco:");
      for (const b of riskyBudgets) {
        lines.push(`- ${categoryName(b.categoryId)}: gasto ${n(b.spent)} de limite ${n(b.limit)}, projeção ${n(b.projected)}`);
      }
    }
    lines.push(`Compromissos no cartão (próximos meses): ${commitments.months.map(m => `${monthOnly(m.month)} ${n(m.total)}`).join(", ")}.`);
    if (commitments.releases.length > 0) {
      lines.push(`Parcelas terminando: ${commitments.releases.map(r => `${monthOnly(r.month)} libera ${n(r.amount)}`).join(", ")}.`);
    }
    if (recurring.items.length > 0) {
      lines.push(
        `Recorrências: ${n(recurring.monthlyTotal)} por mês (${n(recurring.yearlyTotal)} por ano). Maiores: ` +
        recurring.items.slice(0, 5).map(i => `${i.description} ${n(i.monthly)}`).join(", ") + ".",
      );
    }
    return lines.join("\n");
  }

  const topCategory = useMemo(() => {
    let top: { id: string; amount: number } | null = null;
    for (const [id, amount] of Object.entries(spentByCat)) {
      if (!top || amount > top.amount) top = { id, amount };
    }
    return top;
  }, [spentByCat]);

  const noData = results.every(r => r.income === 0 && r.expense === 0);

  return (
    <div style={{ padding: "16px 12px 88px", maxWidth: "680px", margin: "0 auto", minWidth: 0 }}>
      <div style={{ marginBottom: "14px" }}>
        <h1 className="page-title" style={{ marginBottom: "10px" }}>Relatórios</h1>
        <div className="month-nav">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Mês anterior" className="icon-btn ghost">
            <ChevronLeft size={18} strokeWidth={1.5} />
          </button>
          <p className="month-nav-label">{fullMonth(selectedMonth)}</p>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            disabled={atCurrentMonth}
            aria-label="Próximo mês"
            className="icon-btn ghost"
            style={{ opacity: atCurrentMonth ? 0.4 : 1 }}
          >
            <ChevronRight size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {noData ? (
        <div className="soft-card" style={{ padding: "32px 18px", textAlign: "center" }}>
          <p style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>
            Sem receitas nem despesas em {fullMonth(selectedMonth)} e nos {EVOLUTION_MONTHS - 1} meses anteriores.
          </p>
        </div>
      ) : (
        <>
          <DecisionHero id={SECTION_ID.hero} room={room} result={result} selectedMonth={selectedMonth} />
          <ActionList actions={actions} onGo={goTo} />
          <SummaryGrid id={SECTION_ID.summary} result={result} average={average} inProgress={atCurrentMonth} />
          <CategoryOutliers id={SECTION_ID.outliers} outliers={outliers} categories={state.categories} hasHistory={hasHistory} />
          <BudgetPace id={SECTION_ID.budgets} paces={budgetPace} categories={state.categories} />
          <FutureCommitments
            id={SECTION_ID.future}
            months={commitments.months}
            releases={commitments.releases}
            averageIncome={averageIncome}
          />
          <RecurringCosts
            id={SECTION_ID.recurring}
            items={recurring.items}
            monthlyTotal={recurring.monthlyTotal}
            yearlyTotal={recurring.yearlyTotal}
            categories={state.categories}
            averageIncome={averageIncome}
          />
          <EvolutionChart results={results} selectedMonth={selectedMonth} />
        </>
      )}

      <CollapsibleCard
        title="Gastos por categoria"
        subtitle={topCategory
          ? `Maior: ${categoryName(topCategory.id)} · ${brl(topCategory.amount)}`
          : "Sem despesas no mês"}
        icon={<PieChart size={14} strokeWidth={1.5} color="var(--text-2)" />}
      >
        <CategoriesSection
          month={selectedMonth}
          transactions={state.transactions}
          installments={state.installments}
          purchases={state.purchases}
          categories={state.categories}
          cards={state.cards}
        />
      </CollapsibleCard>

      <CollapsibleCard
        title="Fluxo por dia"
        subtitle="Calendário de entradas e saídas do mês"
        icon={<CalendarDays size={14} strokeWidth={1.5} color="var(--text-2)" />}
      >
        <div style={{ padding: "12px" }}>
          <SpendingHeatmapCalendar
            month={selectedMonth}
            transactions={state.transactions}
            installments={state.installments}
            purchases={state.purchases}
            categories={state.categories}
          />
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title="Insights da IA"
        subtitle="Sugestões a partir dos números acima"
        icon={<Sparkles size={14} strokeWidth={1.5} color="var(--accent)" />}
      >
        <AIInsights
          buildContext={buildAIContext}
          categories={state.categories}
          accounts={state.accounts}
          cards={state.cards}
        />
      </CollapsibleCard>
    </div>
  );
}
