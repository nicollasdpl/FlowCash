"use client";
import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { addMonths, currentMonth, getCardCommittedByMonth } from "@/engine/financialEngine";
import { getCardExpensesByCategory } from "@/engine/invoiceEngine";
import { BarChart2, CreditCard } from "lucide-react";
import CategoryIcon from "@/components/CategoryIcon";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

export default function Relatorios() {
  const { state } = useApp();

  const months = useMemo(() => {
    const cm = currentMonth();
    return Array.from({ length: 6 }, (_, i) => addMonths(cm, i - 5));
  }, []);

  const monthData = useMemo(() =>
    months.map(month => {
      const txs = state.transactions.filter(t => t.competenceDate.startsWith(month));
      const income = txs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const expense = txs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
      const cardCommitted = getCardCommittedByMonth(state.installments, month);
      return { month, income, expense, cardCommitted, balance: income - expense };
    }),
    [months, state.transactions, state.installments]
  );

  const maxVal = Math.max(
    ...monthData.map(d => Math.max(d.income, d.expense, d.cardCommitted)),
    1
  );
  const hasAnyData = monthData.some(d => d.income > 0 || d.expense > 0 || d.cardCommitted > 0);

  const byCategory = useMemo(() => {
    const map: Record<string, { amount: number; color: string; icon: string }> = {};
    state.transactions
      .filter(t => t.type === "expense" && months.some(m => t.competenceDate.startsWith(m)))
      .forEach(t => {
        const cat = state.categories.find(c => c.id === t.categoryId);
        const name = cat?.name ?? "Outros";
        if (!map[name]) map[name] = { amount: 0, color: cat?.color ?? "#6B7FA3", icon: cat?.icon ?? "" };
        map[name].amount += t.amount;
      });
    return Object.entries(map).sort((a, b) => b[1].amount - a[1].amount);
  }, [state.transactions, state.categories, months]);

  const cardByCategory = useMemo(() => {
    const relevantInstallments = state.installments.filter(
      i => months.some(m => i.competenceMonth === m)
    );
    const catMap = getCardExpensesByCategory(relevantInstallments, state.purchases);
    return Object.entries(catMap)
      .map(([catId, amount]) => {
        const cat = state.categories.find(c => c.id === catId);
        return { name: cat?.name ?? "Outros", amount, color: cat?.color ?? "#6B7FA3", icon: cat?.icon ?? "" };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [state.installments, state.purchases, state.categories, months]);

  const totalExpense = byCategory.reduce((s, [, v]) => s + v.amount, 0) || 1;
  const totalCardCommitted = cardByCategory.reduce((s, c) => s + c.amount, 0);

  function monthLabel(yyyymm: string) {
    const [, m] = yyyymm.split("-");
    return MONTH_LABELS[m] ?? yyyymm;
  }

  return (
    <div style={{ padding: "20px 16px", maxWidth: "860px", margin: "0 auto" }}>
      <div className="fade-up-1" style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em" }}>Relatórios</h1>
        <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "3px" }}>Últimos 6 meses</p>
      </div>

      {!hasAnyData ? (
        <div className="card" style={{ padding: "48px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px", color: "var(--text-3)" }}>
            <BarChart2 size={48} strokeWidth={1.5} />
          </div>
          <p style={{ color: "var(--text-2)", fontSize: "15px", fontWeight: 600 }}>Sem dados ainda</p>
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginTop: "6px" }}>
            Adicione transações para ver seus relatórios aqui.
          </p>
        </div>
      ) : (
        <>
          {/* ── Gráfico de barras ── */}
          <div className="card fade-up-2" style={{ padding: "20px", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "20px" }}>
              Receitas vs Despesas vs Cartão
            </h2>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", height: "140px" }}>
              {monthData.map(({ month, income, expense, cardCommitted }) => (
                <div key={month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <div style={{ display: "flex", gap: "2px", alignItems: "flex-end", width: "100%", height: "120px" }}>
                    <div style={{
                      flex: 1, borderRadius: "4px 4px 0 0",
                      height: income > 0 ? `${(income / maxVal) * 120}px` : "3px",
                      background: income > 0 ? "var(--green)" : "rgba(255,255,255,0.06)",
                      transition: "height 0.6s ease", minHeight: "3px",
                    }} />
                    <div style={{
                      flex: 1, borderRadius: "4px 4px 0 0",
                      height: expense > 0 ? `${(expense / maxVal) * 120}px` : "3px",
                      background: expense > 0 ? "var(--red)" : "rgba(255,255,255,0.06)",
                      transition: "height 0.6s ease", minHeight: "3px",
                    }} />
                    <div style={{
                      flex: 1, borderRadius: "4px 4px 0 0",
                      height: cardCommitted > 0 ? `${(cardCommitted / maxVal) * 120}px` : "3px",
                      background: cardCommitted > 0 ? "var(--amber)" : "rgba(255,255,255,0.06)",
                      transition: "height 0.6s ease", minHeight: "3px",
                      opacity: cardCommitted > 0 ? 0.85 : 0.3,
                    }} />
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 600 }}>{monthLabel(month)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "16px", marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
              {[
                { color: "var(--green)", label: "Receitas" },
                { color: "var(--red)", label: "Despesas" },
                { color: "var(--amber)", label: "Cartão" },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: color }} />
                  <span style={{ fontSize: "12px", color: "var(--text-2)" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Resumo mensal ── */}
          <div className="card fade-up-3" style={{ overflow: "hidden", marginBottom: "16px" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Resumo Mensal</h2>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "58px 1fr 1fr 1fr",
              padding: "10px 18px", fontSize: "10px", fontWeight: 700,
              color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase",
              borderBottom: "1px solid var(--border)",
            }}>
              <span>Mês</span>
              <span style={{ textAlign: "right" }}>Receitas</span>
              <span style={{ textAlign: "right" }}>Despesas</span>
              <span style={{ textAlign: "right" }}>Saldo</span>
            </div>
            {monthData.filter(d => d.income > 0 || d.expense > 0 || d.cardCommitted > 0).map(({ month, income, expense, cardCommitted, balance }) => (
              <div key={month} style={{
                display: "grid", gridTemplateColumns: "58px 1fr 1fr 1fr",
                padding: "12px 18px", borderBottom: "1px solid var(--border)",
                alignItems: "start",
              }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-2)", paddingTop: "2px" }}>{monthLabel(month)}</span>
                <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--green)", textAlign: "right" }}>
                  R$ {fmt(income)}
                </span>
                <div style={{ textAlign: "right" }}>
                  <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--red)" }}>
                    R$ {fmt(expense)}
                  </p>
                  {cardCommitted > 0 && (
                    <p className="mono" style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--amber)", marginTop: "3px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                      <CreditCard size={10} strokeWidth={1.5} />
                      {fmt(cardCommitted)}
                    </p>
                  )}
                </div>
                <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: balance >= 0 ? "var(--accent)" : "var(--red)", textAlign: "right", paddingTop: "2px" }}>
                  {balance >= 0 ? "+" : ""}R$ {fmt(balance)}
                </span>
              </div>
            ))}
          </div>

          {/* ── Gastos realizados por categoria ── */}
          {byCategory.length > 0 && (
            <div className="card fade-up-4" style={{ overflow: "hidden", marginBottom: "16px" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
                <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  Gastos por categoria
                </h2>
                <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>Transações realizadas</p>
              </div>
              {byCategory.map(([name, { amount, color, icon }], i) => {
                const pct = Math.round((amount / totalExpense) * 100);
                return (
                  <div key={name} style={{
                    padding: "14px 18px",
                    borderBottom: i < byCategory.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {icon && <span style={{ fontSize: "16px" }}>{icon}</span>}
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>{name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "11.5px", color: "var(--text-3)" }}>{pct}%</span>
                        <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)" }}>
                          R$ {fmt(amount)}
                        </span>
                      </div>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Comprometido com cartão por categoria ── */}
          {cardByCategory.length > 0 && (
            <div className="card fade-up-5" style={{ overflow: "hidden" }}>
              <div style={{
                padding: "14px 18px", borderBottom: "1px solid var(--amber-20)",
                background: "rgba(245,158,11,0.06)",
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <CreditCard size={14} strokeWidth={1.5} color="var(--amber)" />
                <div>
                  <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--amber)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    Comprometido com Cartão
                  </h2>
                  <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                    Parcelas em aberto · total R$ {fmt(totalCardCommitted)}
                  </p>
                </div>
              </div>
              {cardByCategory.map((cat, i) => {
                const pct = totalCardCommitted > 0 ? Math.round((cat.amount / totalCardCommitted) * 100) : 0;
                return (
                  <div key={cat.name} style={{
                    padding: "14px 18px",
                    borderBottom: i < cardByCategory.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {cat.icon && <CategoryIcon icon={cat.icon} color={cat.color} size={16} />}
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>{cat.name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "11.5px", color: "var(--text-3)" }}>{pct}%</span>
                        <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--amber)" }}>
                          R$ {fmt(cat.amount)}
                        </span>
                      </div>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${pct}%`, background: "var(--amber)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
