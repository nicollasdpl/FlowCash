"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp, newId } from "@/context/AppContext";
import { auth } from "@/lib/firebase";
import { currentMonth, addMonths } from "@/engine/financialEngine";
import { getSpentByCategory } from "@/engine/budgetEngine";
import { AlertTriangle, BarChart2, Trash2, Package, Copy, Sparkles } from "lucide-react";
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

  // ── Toast simples (sem lib) ────────────────────────────────────────────────
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }

  // ── Copiar orçamentos do mês anterior ──────────────────────────────────────
  function copyPreviousMonth() {
    const prev = addMonths(selectedMonth, -1);
    const prevLabel = fullMonthLabel(prev);
    const prevBudgets = state.budgets.filter(b => b.month === prev);
    if (prevBudgets.length === 0) {
      showToast(`Nenhum orçamento encontrado em ${prevLabel}`);
      return;
    }
    const toCopy = prevBudgets.filter(b => !usedCategoryIds.has(b.categoryId));
    if (toCopy.length === 0) {
      showToast(`Os orçamentos de ${prevLabel} já existem neste mês`);
      return;
    }
    if (!confirm(`Copiar ${toCopy.length} orçamento${toCopy.length > 1 ? "s" : ""} de ${prevLabel}?`)) return;
    toCopy.forEach(b => {
      dispatch({ type: "ADD_BUDGET", payload: { id: newId(), categoryId: b.categoryId, limitAmount: b.limitAmount, month: selectedMonth } });
    });
    showToast(`${toCopy.length} orçamento${toCopy.length > 1 ? "s" : ""} copiado${toCopy.length > 1 ? "s" : ""} de ${prevLabel}`);
  }

  // ── Sugestão de orçamentos por IA ──────────────────────────────────────────
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{ categoryId: string; amount: number }[] | null>(null);

  async function suggestBudgets() {
    const user = auth.currentUser;
    if (!user) { showToast("Faça login para usar a sugestão por IA."); return; }
    setAiLoading(true);
    try {
      const idToken = await user.getIdToken();
      // gastos reais dos 3 meses anteriores ao selecionado
      const months = [addMonths(selectedMonth, -1), addMonths(selectedMonth, -2), addMonths(selectedMonth, -3)];
      const spentLast3Months: { categoryId: string; month: string; spent: number }[] = [];
      for (const month of months) {
        const map = getSpentByCategory(month, state.transactions, state.installments, state.purchases);
        for (const [categoryId, spent] of Object.entries(map)) {
          if (spent > 0) spentLast3Months.push({ categoryId, month, spent });
        }
      }
      const categories = state.categories
        .filter(c => c.type === "expense" && !c.isSystem)
        .map(c => ({ id: c.id, name: c.name }));

      const res = await fetch("/api/ai-budget", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ categories, spentLast3Months }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.suggestions)) {
        showToast(res.status === 429 ? "Limite da IA atingido. Tente em instantes." : "Não consegui sugerir agora. Tente novamente.");
        return;
      }
      // só categorias que ainda não têm orçamento no mês
      const filtered = (data.suggestions as { categoryId: string; amount: number }[])
        .filter(s => !usedCategoryIds.has(s.categoryId) && s.amount > 0);
      if (filtered.length === 0) {
        showToast("Sem sugestões novas (categorias já orçadas ou sem histórico).");
        return;
      }
      setAiSuggestions(filtered);
    } catch {
      showToast("Erro ao chamar a sugestão por IA.");
    } finally {
      setAiLoading(false);
    }
  }

  function updateSuggestion(categoryId: string, amount: number) {
    setAiSuggestions(prev => prev ? prev.map(s => s.categoryId === categoryId ? { ...s, amount } : s) : prev);
  }

  function applySuggestions() {
    if (!aiSuggestions) return;
    let created = 0;
    aiSuggestions.forEach(s => {
      if (usedCategoryIds.has(s.categoryId) || !s.amount || s.amount <= 0) return;
      dispatch({ type: "ADD_BUDGET", payload: { id: newId(), categoryId: s.categoryId, limitAmount: s.amount, month: selectedMonth } });
      created++;
    });
    setAiSuggestions(null);
    showToast(`${created} orçamento${created !== 1 ? "s" : ""} criado${created !== 1 ? "s" : ""} pela IA`);
  }

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

      {/* Ações: copiar mês anterior + sugerir por IA */}
      <div className="fade-up-1" style={{ marginBottom: "16px", display: "flex", gap: "8px" }}>
        <button
          className="btn-secondary"
          onClick={copyPreviousMonth}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "13px" }}
        >
          <Copy size={15} strokeWidth={1.5} />
          Copiar mês anterior
        </button>
        <button
          className="btn-secondary"
          onClick={suggestBudgets}
          disabled={aiLoading}
          aria-label="Sugerir orçamentos por IA"
          title="Sugerir orçamentos por IA"
          style={{ width: "48px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: aiLoading ? 0.6 : 1 }}
        >
          {aiLoading ? (
            <div style={{ width: "15px", height: "15px", border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          ) : (
            <Sparkles size={16} strokeWidth={1.5} />
          )}
        </button>
      </div>

      {/* Card de revisão das sugestões da IA */}
      {aiSuggestions && (
        <div className="card fade-up-2" style={{ padding: "14px 16px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <Sparkles size={15} strokeWidth={1.5} color="var(--accent)" />
            <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Sugestão de orçamentos
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {aiSuggestions.map(s => {
              const cat = state.categories.find(c => c.id === s.categoryId);
              return (
                <div key={s.categoryId} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "32px", height: "32px", borderRadius: "9px", flexShrink: 0,
                    background: cat ? `${cat.color}18` : "rgba(255,255,255,0.06)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {cat?.icon
                      ? <CategoryIcon icon={cat.icon} color={cat.color} size={15} />
                      : <Package size={15} strokeWidth={1.5} color="var(--text-3)" />}
                  </div>
                  <span style={{ flex: 1, minWidth: 0, fontSize: "13px", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cat?.name ?? "—"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
                    <span style={{ fontSize: "12px", color: "var(--text-3)" }}>R$</span>
                    <input
                      className="mono"
                      type="text"
                      inputMode="numeric"
                      value={s.amount ? String(s.amount) : ""}
                      onChange={e => updateSuggestion(s.categoryId, parseInt(e.target.value.replace(/\D/g, "")) || 0)}
                      style={{ width: "78px", textAlign: "right", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "8px", padding: "6px 8px", color: "var(--text-1)", fontSize: "13px", fontFamily: "inherit" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
            <button className="btn-primary" onClick={applySuggestions} style={{ flex: 1, textAlign: "center", justifyContent: "center" }}>
              Aplicar sugestões
            </button>
            <button className="btn-secondary" onClick={() => setAiSuggestions(null)} style={{ padding: "0 16px" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

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
            const rawPct = budget.limitAmount > 0 ? Math.round((spent / budget.limitAmount) * 100) : 0;
            const barPct = Math.min(rawPct, 100);
            const over = spent > budget.limitAmount;
            // verde < 70 · amarelo 70–90 · vermelho > 90
            const barColor = rawPct > 90 ? "var(--red)" : rawPct >= 70 ? "var(--amber)" : "var(--green)";

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
                    <p style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {cat?.name ?? "—"}
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

                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${barPct}%`, background: barColor, boxShadow: `0 0 6px ${barColor}55` }}
                  />
                </div>
                <p className="mono" style={{ fontSize: "11.5px", marginTop: "8px", fontWeight: 600, color: barColor }}>
                  R$ {fmt(spent)} de R$ {fmt(budget.limitAmount)} ({rawPct}%)
                </p>

                {over && (
                  <p style={{ fontSize: "11px", color: "var(--red)", marginTop: "4px", fontWeight: 600 }}>
                    Excedido em R$ {fmt(spent - budget.limitAmount)}
                  </p>
                )}
                {!over && rawPct >= 70 && (
                  <p style={{ fontSize: "11px", color: "var(--amber)", marginTop: "4px", fontWeight: 600 }}>
                    Atenção: {Math.max(100 - rawPct, 0)}% do limite restante
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", left: "16px", right: "16px", bottom: "84px",
          zIndex: 60, display: "flex", justifyContent: "center", pointerEvents: "none",
        }}>
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: "10px", padding: "10px 16px",
            fontSize: "12.5px", color: "var(--text-1)", fontWeight: 600,
            boxShadow: "0 6px 20px rgba(0,0,0,0.45)", textAlign: "center", maxWidth: "100%",
          }}>
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
