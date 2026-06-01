"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { currentMonth, addMonths } from "@/engine/financialEngine";
import { getSpentByCategory } from "@/engine/budgetEngine";
import { AlertTriangle, BarChart2, Trash2, Package } from "lucide-react";
import CategoryIcon from "@/components/CategoryIcon";

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function fullMonthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Orcamentos() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());

  const budgetsThisMonth = useMemo(
    () => state.budgets.filter(b => b.month === selectedMonth),
    [state.budgets, selectedMonth]
  );

  // Inclui transactions de despesa + parcelas de cartão (via budgetEngine).
  const spentByCategory = useMemo(
    () => getSpentByCategory(selectedMonth, state.transactions, state.installments, state.purchases),
    [selectedMonth, state.transactions, state.installments, state.purchases],
  );

  const usedCategoryIds = new Set(budgetsThisMonth.map(b => b.categoryId));
  const availableCategories = state.categories.filter(
    c => c.type === "expense" && !c.isSystem && !usedCategoryIds.has(c.id)
  );

  const totalLimit = budgetsThisMonth.reduce((s, b) => s + b.limitAmount, 0);
  const totalSpent = budgetsThisMonth.reduce((s, b) => s + (spentByCategory[b.categoryId] ?? 0), 0);
  const overBudgetCount = budgetsThisMonth.filter(b => (spentByCategory[b.categoryId] ?? 0) > b.limitAmount).length;

  return (
    <div style={{ padding: "20px 16px", maxWidth: "680px", margin: "0 auto" }}>

      {/* Header */}
      <div className="fade-up-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em" }}>Orçamentos</h1>
          <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
            Controle de gastos por categoria
          </p>
        </div>
        {availableCategories.length > 0 && (
          <button
            className="btn-primary"
            onClick={() => router.push(`/orcamentos/nova?month=${selectedMonth}`)}
            style={{ fontSize: "13px", padding: "10px 16px" }}
          >
            + Novo
          </button>
        )}
      </div>

      {/* Seletor de mês */}
      <div className="fade-up-1" style={{ marginBottom: "16px" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", padding: "4px",
        }}>
          <button
            onClick={() => setSelectedMonth(m => addMonths(m, -1))}
            style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", fontSize: "20px", padding: "8px 16px", minHeight: "44px", minWidth: "48px", display: "flex", alignItems: "center", justifyContent: "center" }}
          >‹</button>
          <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.01em", flex: 1, textAlign: "center" }}>
            {fullMonthLabel(selectedMonth)}
          </p>
          <button
            onClick={() => setSelectedMonth(m => addMonths(m, 1))}
            style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", fontSize: "20px", padding: "8px 16px", minHeight: "44px", minWidth: "48px", display: "flex", alignItems: "center", justifyContent: "center" }}
          >›</button>
        </div>
      </div>

      {/* Resumo geral */}
      {budgetsThisMonth.length > 0 && (
        <div className="fade-up-2" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "16px" }}>
          {[
            { label: "Limite total", value: totalLimit, color: "var(--text-1)" },
            { label: "Gasto", value: totalSpent, color: totalSpent > totalLimit ? "var(--red)" : "var(--text-1)" },
            { label: "Disponível", value: Math.max(totalLimit - totalSpent, 0), color: "var(--green)" },
          ].map((s, i) => (
            <div key={i} className="card" style={{ padding: "12px 14px" }}>
              <p style={{ fontSize: "9px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "4px" }}>{s.label}</p>
              <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: s.color }}>R$ {fmt(s.value)}</p>
            </div>
          ))}
        </div>
      )}

      {overBudgetCount > 0 && (
        <div className="fade-up-2" style={{
          padding: "12px 16px", marginBottom: "16px",
          background: "var(--red-10)", border: "1px solid var(--red-20)",
          borderRadius: "var(--r-md)",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <AlertTriangle size={18} strokeWidth={1.5} color="var(--red)" style={{ flexShrink: 0 }} />
          <p style={{ fontSize: "13px", color: "var(--red)", fontWeight: 600 }}>
            {overBudgetCount} categoria{overBudgetCount > 1 ? "s" : ""} ultrapassou{overBudgetCount > 1 ? "ram" : ""} o limite
          </p>
        </div>
      )}

      {/* Lista de orçamentos */}
      {budgetsThisMonth.length === 0 ? (
        <div className="card fade-up-3" style={{ padding: "48px 24px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px", color: "var(--text-3)" }}>
            <BarChart2 size={44} strokeWidth={1.5} />
          </div>
          <p style={{ color: "var(--text-2)", fontSize: "15px", fontWeight: 600 }}>Nenhum orçamento</p>
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginTop: "6px", marginBottom: "20px" }}>
            Defina limites de gasto por categoria para este mês.
          </p>
          <button className="btn-primary" onClick={() => router.push(`/orcamentos/nova?month=${selectedMonth}`)}>
            + Criar orçamento
          </button>
        </div>
      ) : (
        <div className="fade-up-3" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {budgetsThisMonth.map(budget => {
            const cat = state.categories.find(c => c.id === budget.categoryId);
            const spent = spentByCategory[budget.categoryId] ?? 0;
            const pct = Math.min(Math.round((spent / budget.limitAmount) * 100), 100);
            const over = spent > budget.limitAmount;
            const barColor = over ? "var(--red)" : pct > 80 ? "var(--amber)" : cat?.color ?? "var(--accent)";

            return (
              <div
                key={budget.id}
                className="card"
                onClick={() => router.push(`/orcamentos/${budget.id}/editar`)}
                style={{ padding: "16px 18px", cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "12px", flexShrink: 0,
                    background: cat ? `${cat.color}18` : "rgba(255,255,255,0.06)",
                    border: `1px solid ${cat?.color ?? "var(--border)"}30`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px",
                  }}>
                    {cat?.icon
                      ? <CategoryIcon icon={cat.icon} color={cat.color} size={18} />
                      : <Package size={18} strokeWidth={1.5} color="var(--text-3)" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-1)" }}>
                      {cat?.name ?? "—"}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    <div style={{ textAlign: "right" }}>
                      <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: over ? "var(--red)" : "var(--text-1)" }}>
                        R$ {fmt(spent)}
                      </p>
                      <p className="mono" style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "1px" }}>
                        / R$ {fmt(budget.limitAmount)}
                      </p>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (confirm(`Excluir o orçamento de ${cat?.name ?? "categoria"}?`)) {
                          dispatch({ type: "DEL_BUDGET", payload: budget.id });
                        }
                      }}
                      style={{
                        background: "var(--red-10)", border: "1px solid var(--red-20)",
                        borderRadius: "8px", color: "var(--red)",
                        width: "32px", height: "32px",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, touchAction: "manipulation",
                      }}
                      title="Excluir orçamento"
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div className="progress-bar-bg" style={{ flex: 1 }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${pct}%`,
                        background: barColor,
                        boxShadow: `0 0 6px ${barColor}55`,
                      }}
                    />
                  </div>
                  <span className="mono" style={{ fontSize: "12px", fontWeight: 700, color: barColor, flexShrink: 0 }}>
                    {pct}%
                  </span>
                </div>

                {over && (
                  <p style={{ fontSize: "11px", color: "var(--red)", marginTop: "8px", fontWeight: 600 }}>
                    Excedido em R$ {fmt(spent - budget.limitAmount)}
                  </p>
                )}
                {!over && pct > 80 && (
                  <p style={{ fontSize: "11px", color: "var(--amber)", marginTop: "8px", fontWeight: 600 }}>
                    Atenção: {100 - pct}% do limite restante
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
