"use client";
import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { addMonths, currentMonth, getCardCommittedByMonth } from "@/engine/financialEngine";
import { getCardExpensesByCategory } from "@/engine/invoiceEngine";
import {
  BarChart2, CreditCard,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
} from "lucide-react";
import CategoryIcon from "@/components/CategoryIcon";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function fmtDate(d: string) {
  if (!d) return "—";
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

const MONTH_SHORT: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

const FULL_MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function shortMonth(yyyymm: string) {
  const [, m] = yyyymm.split("-");
  return MONTH_SHORT[m] ?? yyyymm;
}

function fullMonth(yyyymm: string) {
  const [y, m] = yyyymm.split("-");
  return `${FULL_MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

// ─── Donut chart SVG ─────────────────────────────────────────────────────────

interface CatEntry { catId: string; name: string; amount: number; color: string; icon: string }

function DonutChart({
  entries, total, expandedCat, onSliceClick,
}: {
  entries: CatEntry[];
  total: number;
  expandedCat: string | null;
  onSliceClick: (id: string) => void;
}) {
  if (total === 0 || entries.length === 0) return null;

  const cx = 80, cy = 80, r = 68, inner = r * 0.5;
  let ang = -Math.PI / 2;

  const slices = entries.map(e => {
    const sweep = (e.amount / total) * 2 * Math.PI;
    const start = ang;
    ang += sweep;
    return {
      ...e,
      x1: cx + r * Math.cos(start), y1: cy + r * Math.sin(start),
      x2: cx + r * Math.cos(ang),   y2: cy + r * Math.sin(ang),
      largeArc: sweep > Math.PI ? 1 : 0,
    };
  });

  return (
    <div style={{
      display: "flex", gap: "20px", alignItems: "center",
      padding: "16px 18px", flexWrap: "wrap",
      borderBottom: "1px solid var(--border)",
    }}>
      {/* SVG */}
      <div style={{ flexShrink: 0 }}>
        <svg width="160" height="160" viewBox="0 0 160 160">
          {entries.length === 1 ? (
            <circle
              cx={cx} cy={cy} r={r}
              fill={entries[0].color}
              onClick={() => onSliceClick(entries[0].catId)}
              style={{ cursor: "pointer" }}
            />
          ) : slices.map(s => (
            <path
              key={s.catId}
              d={`M ${cx} ${cy} L ${s.x1.toFixed(2)} ${s.y1.toFixed(2)} A ${r} ${r} 0 ${s.largeArc} 1 ${s.x2.toFixed(2)} ${s.y2.toFixed(2)} Z`}
              fill={s.color}
              stroke="var(--bg-card)"
              strokeWidth="2.5"
              opacity={expandedCat && expandedCat !== s.catId ? 0.3 : 1}
              onClick={() => onSliceClick(s.catId)}
              style={{ cursor: "pointer", transition: "opacity 0.2s" }}
            />
          ))}
          <circle cx={cx} cy={cy} r={inner} fill="var(--bg-card)" />
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize="8" fontWeight="700"
            fill="var(--text-3)" fontFamily="inherit" letterSpacing="0.08em">
            DESPESAS
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize="13" fontWeight="700"
            fill="var(--text-1)" fontFamily="inherit">
            {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : fmt(total)}
          </text>
        </svg>
      </div>

      {/* Legenda */}
      <div style={{ flex: 1, minWidth: "150px", display: "flex", flexDirection: "column", gap: "6px" }}>
        {slices.map(s => {
          const pct = ((s.amount / total) * 100).toFixed(1);
          const active = expandedCat === s.catId;
          return (
            <div
              key={s.catId}
              onClick={() => onSliceClick(s.catId)}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                cursor: "pointer", padding: "4px 7px", borderRadius: "8px",
                background: active ? `${s.color}18` : "transparent",
                border: `1px solid ${active ? s.color + "40" : "transparent"}`,
                transition: "all 0.15s",
              }}
            >
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{
                fontSize: "12px", flex: 1,
                color: active ? "var(--text-1)" : "var(--text-2)",
                fontWeight: active ? 700 : 400,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {s.name}
              </span>
              <span className="mono" style={{ fontSize: "11px", color: "var(--text-3)", flexShrink: 0 }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function Relatorios() {
  const { state } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonth());
  const [expandedCat, setExpandedCat]     = useState<string | null>(null);

  // 6 meses para barra e tabela
  const months = useMemo(() => {
    const cm = currentMonth();
    return Array.from({ length: 6 }, (_, i) => addMonths(cm, i - 5));
  }, []);

  const monthData = useMemo(() =>
    months.map(month => {
      const txs = state.transactions.filter(t => t.competenceDate.startsWith(month));
      const income  = txs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const expense = txs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
      const cardCommitted = getCardCommittedByMonth(state.installments, month);
      return { month, income, expense, cardCommitted, balance: income - expense };
    }),
    [months, state.transactions, state.installments]
  );

  const maxVal     = Math.max(...monthData.map(d => Math.max(d.income, d.expense, d.cardCommitted)), 1);
  const hasAnyData = monthData.some(d => d.income > 0 || d.expense > 0 || d.cardCommitted > 0);

  // Dados do mês selecionado
  const monthTxs = useMemo(() =>
    state.transactions.filter(t => t.competenceDate.startsWith(selectedMonth)),
    [state.transactions, selectedMonth]
  );

  const catEntries = useMemo<CatEntry[]>(() => {
    const map: Record<string, CatEntry> = {};
    monthTxs
      .filter(t => t.type === "expense")
      .forEach(t => {
        const cat = state.categories.find(c => c.id === t.categoryId);
        const key = t.categoryId ?? "__none__";
        if (!map[key]) map[key] = {
          catId: key,
          name:  cat?.name  ?? "Outros",
          amount: 0,
          color: cat?.color ?? "#6B7FA3",
          icon:  cat?.icon  ?? "",
        };
        map[key].amount += t.amount;
      });
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }, [monthTxs, state.categories]);

  const totalExpenseMonth = catEntries.reduce((s, e) => s + e.amount, 0);

  const expandedTxs = useMemo(() =>
    expandedCat
      ? monthTxs
          .filter(t => t.type === "expense" && (
            expandedCat === "__none__" ? !t.categoryId : t.categoryId === expandedCat
          ))
          .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
      : [],
    [monthTxs, expandedCat]
  );

  // Comprometido com cartão (6 meses)
  const cardByCategory = useMemo(() => {
    const relevant = state.installments.filter(i => months.some(m => i.competenceMonth === m));
    const catMap   = getCardExpensesByCategory(relevant, state.purchases);
    return Object.entries(catMap)
      .map(([catId, amount]) => {
        const cat = state.categories.find(c => c.id === catId);
        return { name: cat?.name ?? "Outros", amount, color: cat?.color ?? "#6B7FA3", icon: cat?.icon ?? "" };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [state.installments, state.purchases, state.categories, months]);

  const totalCardCommitted = cardByCategory.reduce((s, c) => s + c.amount, 0);

  function toggleCat(catId: string) {
    setExpandedCat(prev => prev === catId ? null : catId);
  }

  function changeMonth(delta: number) {
    const next = addMonths(selectedMonth, delta);
    if (delta > 0 && next > currentMonth()) return;
    setSelectedMonth(next);
    setExpandedCat(null);
  }

  const atCurrentMonth = selectedMonth >= currentMonth();

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
            <h2 style={{
              fontSize: "13px", fontWeight: 700, color: "var(--text-3)",
              letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "20px",
            }}>
              Receitas vs Despesas vs Cartão
            </h2>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", height: "140px" }}>
              {monthData.map(({ month, income, expense, cardCommitted }) => (
                <div key={month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <div style={{ display: "flex", gap: "2px", alignItems: "flex-end", width: "100%", height: "120px" }}>
                    <div style={{
                      flex: 1, borderRadius: "4px 4px 0 0", minHeight: "3px",
                      height: income > 0 ? `${(income / maxVal) * 120}px` : "3px",
                      background: income > 0 ? "var(--green)" : "rgba(255,255,255,0.06)",
                      transition: "height 0.6s ease",
                    }} />
                    <div style={{
                      flex: 1, borderRadius: "4px 4px 0 0", minHeight: "3px",
                      height: expense > 0 ? `${(expense / maxVal) * 120}px` : "3px",
                      background: expense > 0 ? "var(--red)" : "rgba(255,255,255,0.06)",
                      transition: "height 0.6s ease",
                    }} />
                    <div style={{
                      flex: 1, borderRadius: "4px 4px 0 0", minHeight: "3px",
                      height: cardCommitted > 0 ? `${(cardCommitted / maxVal) * 120}px` : "3px",
                      background: cardCommitted > 0 ? "var(--amber)" : "rgba(255,255,255,0.06)",
                      opacity: cardCommitted > 0 ? 0.85 : 0.3,
                      transition: "height 0.6s ease",
                    }} />
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 600 }}>{shortMonth(month)}</span>
                </div>
              ))}
            </div>
            <div style={{
              display: "flex", gap: "16px", marginTop: "14px",
              paddingTop: "14px", borderTop: "1px solid var(--border)", flexWrap: "wrap",
            }}>
              {[
                { color: "var(--green)", label: "Receitas" },
                { color: "var(--red)",   label: "Despesas" },
                { color: "var(--amber)", label: "Cartão"   },
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
              <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Resumo Mensal
              </h2>
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
                padding: "12px 18px", borderBottom: "1px solid var(--border)", alignItems: "start",
              }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-2)", paddingTop: "2px" }}>{shortMonth(month)}</span>
                <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--green)", textAlign: "right" }}>
                  R$ {fmt(income)}
                </span>
                <div style={{ textAlign: "right" }}>
                  <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--red)" }}>
                    R$ {fmt(expense)}
                  </p>
                  {cardCommitted > 0 && (
                    <p className="mono" style={{
                      fontSize: "10.5px", fontWeight: 700, color: "var(--amber)", marginTop: "3px",
                      display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px",
                    }}>
                      <CreditCard size={10} strokeWidth={1.5} />
                      {fmt(cardCommitted)}
                    </p>
                  )}
                </div>
                <span className="mono" style={{
                  fontSize: "13px", fontWeight: 700,
                  color: balance >= 0 ? "var(--accent)" : "var(--red)",
                  textAlign: "right", paddingTop: "2px",
                }}>
                  {balance >= 0 ? "+" : ""}R$ {fmt(balance)}
                </span>
              </div>
            ))}
          </div>

          {/* ── Gastos por categoria (mês selecionado + donut + accordion) ── */}
          <div className="card fade-up-4" style={{ overflow: "hidden", marginBottom: "16px" }}>

            {/* Header com seletor de mês */}
            <div style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", gap: "10px",
            }}>
              <h2 style={{
                fontSize: "13px", fontWeight: 700, color: "var(--text-3)",
                letterSpacing: "0.05em", textTransform: "uppercase", flex: 1,
              }}>
                Gastos por Categoria
              </h2>
              <button
                onClick={() => changeMonth(-1)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text-2)", padding: "4px", borderRadius: "6px",
                  display: "flex", alignItems: "center", touchAction: "manipulation",
                }}
              >
                <ChevronLeft size={16} strokeWidth={1.5} />
              </button>
              <span style={{
                fontSize: "13px", fontWeight: 700, color: "var(--text-1)",
                minWidth: "110px", textAlign: "center",
              }}>
                {fullMonth(selectedMonth)}
              </span>
              <button
                onClick={() => changeMonth(1)}
                disabled={atCurrentMonth}
                style={{
                  background: "none", border: "none",
                  cursor: atCurrentMonth ? "default" : "pointer",
                  color: atCurrentMonth ? "var(--text-4)" : "var(--text-2)",
                  padding: "4px", borderRadius: "6px",
                  display: "flex", alignItems: "center", touchAction: "manipulation",
                }}
              >
                <ChevronRight size={16} strokeWidth={1.5} />
              </button>
            </div>

            {catEntries.length === 0 ? (
              <div style={{ padding: "36px 18px", textAlign: "center" }}>
                <p style={{ fontSize: "13px", color: "var(--text-3)" }}>
                  Sem despesas em {fullMonth(selectedMonth)}
                </p>
              </div>
            ) : (
              <>
                {/* Donut chart */}
                <DonutChart
                  entries={catEntries}
                  total={totalExpenseMonth}
                  expandedCat={expandedCat}
                  onSliceClick={toggleCat}
                />

                {/* Lista de categorias com accordion */}
                {catEntries.map((cat, i) => {
                  const pct      = Math.round((cat.amount / totalExpenseMonth) * 100);
                  const isExpanded = expandedCat === cat.catId;
                  const catTxs   = isExpanded ? expandedTxs : [];

                  return (
                    <div key={cat.catId}>
                      {/* Linha da categoria */}
                      <div
                        onClick={() => toggleCat(cat.catId)}
                        style={{
                          padding: "13px 18px",
                          borderTop: i === 0 ? "none" : "1px solid var(--border)",
                          cursor: "pointer",
                          background: isExpanded ? "rgba(255,255,255,0.025)" : "transparent",
                          transition: "background 0.15s",
                        }}
                      >
                        <div style={{
                          display: "flex", alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: isExpanded ? "0" : "8px",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            {cat.icon
                              ? <CategoryIcon icon={cat.icon} color={cat.color} size={16} />
                              : <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: cat.color }} />
                            }
                            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>
                              {cat.name}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{ fontSize: "11.5px", color: "var(--text-3)" }}>{pct}%</span>
                            <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)" }}>
                              R$ {fmt(cat.amount)}
                            </span>
                            {isExpanded
                              ? <ChevronUp  size={15} strokeWidth={1.5} color="var(--text-3)" />
                              : <ChevronDown size={15} strokeWidth={1.5} color="var(--text-3)" />
                            }
                          </div>
                        </div>
                        {!isExpanded && (
                          <div className="progress-bar-bg">
                            <div className="progress-bar-fill" style={{ width: `${pct}%`, background: cat.color }} />
                          </div>
                        )}
                      </div>

                      {/* Transações expandidas */}
                      {isExpanded && (
                        <div style={{
                          borderTop: "1px solid var(--border)",
                          background: "rgba(255,255,255,0.012)",
                        }}>
                          {catTxs.length === 0 ? (
                            <div style={{ padding: "16px 18px" }}>
                              <p style={{ fontSize: "12px", color: "var(--text-3)" }}>Nenhuma transação encontrada.</p>
                            </div>
                          ) : catTxs.map((tx, j) => (
                            <div
                              key={tx.id}
                              style={{
                                display: "flex", alignItems: "center", gap: "12px",
                                padding: "11px 18px 11px 40px",
                                borderBottom: j < catTxs.length - 1 ? "1px solid var(--border)" : "none",
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{
                                  fontSize: "13px", fontWeight: 500, color: "var(--text-1)",
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                  {tx.description}
                                </p>
                                <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                                  {fmtDate(tx.paymentDate)}
                                </p>
                              </div>
                              <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)", flexShrink: 0 }}>
                                R$ {fmt(tx.amount)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>

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
                  <h2 style={{
                    fontSize: "13px", fontWeight: 700, color: "var(--amber)",
                    letterSpacing: "0.05em", textTransform: "uppercase",
                  }}>
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
