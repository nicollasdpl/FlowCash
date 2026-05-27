"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { currentMonth, addMonths, fmt } from "@/engine/financialEngine";
import { Search, TrendingUp, Package, RefreshCw, Pencil, Trash2 } from "lucide-react";
import CategoryIcon from "@/components/CategoryIcon";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function fullMonthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function fmtDate(d: string) {
  if (!d) return "—";
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

type FilterKey = "Todos" | "A pagar" | "Pago" | "Vencido" | "Receitas";
const FILTERS: FilterKey[] = ["Todos", "A pagar", "Pago", "Vencido", "Receitas"];

const statusMap = {
  paid: { cls: "badge badge-pago", label: "Pago" },
  pending: { cls: "badge badge-pagar", label: "A pagar" },
  overdue: { cls: "badge badge-vencido", label: "Vencido" },
};

export default function Transacoes() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const [filter, setFilter] = useState<FilterKey>("Todos");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const summaryBase = useMemo(() =>
    state.transactions.filter(t => t.competenceDate.startsWith(selectedMonth)),
    [state.transactions, selectedMonth]
  );

  const income = summaryBase.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = summaryBase.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const aPagar = summaryBase.filter(t => t.status === "pending").reduce((s, t) => s + t.amount, 0);
  const vencido = summaryBase.filter(t => t.status === "overdue").reduce((s, t) => s + t.amount, 0);

  const filtered = useMemo(() => {
    let txs = [...summaryBase];
    if (filter === "A pagar") txs = txs.filter(t => t.status === "pending");
    else if (filter === "Pago") txs = txs.filter(t => t.status === "paid");
    else if (filter === "Vencido") txs = txs.filter(t => t.status === "overdue");
    else if (filter === "Receitas") txs = txs.filter(t => t.type === "income");
    return txs.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [summaryBase, filter]);

  return (
    <div style={{ padding: "16px", maxWidth: "860px", margin: "0 auto" }}>

      {/* ── Header ── */}
      <div className="fade-up-1" style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: "16px",
      }}>
        <div>
          <h1 style={{
            fontSize: "20px", fontWeight: 700, color: "var(--text-1)",
            letterSpacing: "-0.03em",
          }}>Transações</h1>
          <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
            {state.transactions.length} registros
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => router.push("/transacoes/nova")}
          style={{
            fontSize: "24px", padding: "0",
            width: "48px", height: "48px",
            borderRadius: "14px",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >+</button>
      </div>

      {/* ── Seletor de Mês ── */}
      <div className="fade-up-1" style={{ marginBottom: "14px" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", padding: "4px",
        }}>
          <button
            onClick={() => setSelectedMonth(m => addMonths(m, -1))}
            style={{
              background: "none", border: "none", color: "var(--text-2)",
              cursor: "pointer", fontSize: "20px",
              padding: "8px 16px", minHeight: "44px", minWidth: "48px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >‹</button>
          <p style={{
            fontSize: "15px", fontWeight: 700, color: "var(--text-1)",
            letterSpacing: "-0.01em", flex: 1, textAlign: "center",
          }}>
            {fullMonthLabel(selectedMonth)}
          </p>
          <button
            onClick={() => setSelectedMonth(m => addMonths(m, 1))}
            style={{
              background: "none", border: "none", color: "var(--text-2)",
              cursor: "pointer", fontSize: "20px",
              padding: "8px 16px", minHeight: "44px", minWidth: "48px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >›</button>
        </div>
      </div>

      {/* ── Resumo ── */}
      <div className="fade-up-2" style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: "8px", marginBottom: "14px",
      }}>
        <div className="card" style={{ padding: "13px 14px" }}>
          <p style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "4px" }}>↑ Receitas</p>
          <p className="mono" style={{ fontSize: "17px", fontWeight: 700, color: "var(--green)" }}>R$ {fmt(income)}</p>
        </div>
        <div className="card" style={{ padding: "13px 14px" }}>
          <p style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "4px" }}>↓ Despesas</p>
          <p className="mono" style={{ fontSize: "17px", fontWeight: 700, color: expense > income ? "var(--red)" : "var(--text-1)" }}>R$ {fmt(expense)}</p>
        </div>
        {aPagar > 0 && (
          <div className="card" style={{ padding: "13px 14px", background: "var(--amber-10)", borderColor: "var(--amber-20)" }}>
            <p style={{ fontSize: "10px", color: "var(--amber)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "4px" }}>A pagar</p>
            <p className="mono" style={{ fontSize: "17px", fontWeight: 700, color: "var(--amber)" }}>R$ {fmt(aPagar)}</p>
          </div>
        )}
        {vencido > 0 && (
          <div className="card" style={{ padding: "13px 14px", background: "var(--red-10)", borderColor: "var(--red-20)" }}>
            <p style={{ fontSize: "10px", color: "var(--red)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "4px" }}>Vencido</p>
            <p className="mono" style={{ fontSize: "17px", fontWeight: 700, color: "var(--red)" }}>R$ {fmt(vencido)}</p>
          </div>
        )}
      </div>

      {/* ── Filtros ── */}
      <div className="fade-up-3" style={{
        marginBottom: "12px", display: "flex", gap: "7px",
        overflowX: "auto", paddingBottom: "4px",
        WebkitOverflowScrolling: "touch",
        msOverflowStyle: "none",
        scrollbarWidth: "none",
      }}>
        {FILTERS.map(f => (
          <button
            key={f}
            className={`filter-btn${filter === f ? " active" : ""}`}
            onClick={() => setFilter(f)}
          >{f}</button>
        ))}
      </div>

      {/* ── Lista ── */}
      <div className="card fade-up-4" style={{ overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "48px 16px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px", color: "var(--text-3)" }}>
              <Search size={32} strokeWidth={1.5} />
            </div>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-2)" }}>
              Nenhuma transação
            </p>
            <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
              {filter !== "Todos" ? "Tente outro filtro" : `Sem lançamentos em ${fullMonthLabel(selectedMonth)}`}
            </p>
          </div>
        ) : (
          <>
            <div style={{ padding: "10px 14px 8px", display: "flex", justifyContent: "flex-end" }}>
              <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 600 }}>
                {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
            {filtered.map((tx) => {
              const cat = state.categories.find(c => c.id === tx.categoryId);
              const s = statusMap[tx.status];
              const menuOpen = openMenuId === tx.id;
              return (
                <div key={tx.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <div
                    onClick={() => { if (menuOpen) { setOpenMenuId(null); return; } router.push(`/transacoes/${tx.id}/editar`); }}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "13px 14px",
                      cursor: "pointer",
                      transition: "background 0.12s",
                      minHeight: "64px",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{
                      width: "40px", height: "40px", borderRadius: "12px", flexShrink: 0,
                      background: cat ? `${cat.color}18` : "rgba(255,255,255,0.06)",
                      border: `1px solid ${cat?.color ?? "#ffffff"}20`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "17px",
                    }}>
                      {cat?.icon
                        ? <CategoryIcon icon={cat.icon} color={cat.color} size={17} />
                        : tx.type === "income"
                          ? <TrendingUp size={17} strokeWidth={1.5} color="var(--green)" />
                          : <Package size={17} strokeWidth={1.5} color="var(--text-3)" />
                      }
                    </div>

                    <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                      <p style={{
                        fontSize: "13.5px", fontWeight: 600, color: "var(--text-1)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {tx.description}
                      </p>
                      <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
                        {cat?.name ?? "—"} · {fmtDate(tx.paymentDate)}
                        {tx.isRecurring && <RefreshCw size={10} strokeWidth={1.5} style={{ marginLeft: "2px" }} />}
                      </p>
                    </div>

                    <div style={{
                      display: "flex", flexDirection: "column",
                      alignItems: "flex-end", gap: "4px",
                      flexShrink: 0, marginLeft: "4px",
                    }}>
                      <p className="mono" style={{
                        fontSize: "14px", fontWeight: 700, whiteSpace: "nowrap",
                        color: tx.type === "income" ? "var(--green)" : "var(--text-1)",
                      }}>
                        {tx.type === "income" ? "+" : "-"}R$ {fmt(tx.amount)}
                      </p>
                      <span className={s.cls}>{s.label}</span>
                    </div>

                    <button
                      onClick={e => { e.stopPropagation(); setOpenMenuId(id => id === tx.id ? null : tx.id); }}
                      style={{
                        background: menuOpen ? "var(--bg-input)" : "none",
                        border: menuOpen ? "1px solid var(--border)" : "none",
                        borderRadius: "8px", color: "var(--text-3)",
                        cursor: "pointer", fontSize: "18px", fontWeight: 700,
                        width: "32px", height: "32px", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        letterSpacing: "0px", touchAction: "manipulation",
                      }}
                      title="Mais opções"
                    >⋯</button>
                  </div>

                  {menuOpen && (
                    <div style={{
                      display: "flex", gap: "8px",
                      padding: "0 14px 12px 66px",
                    }}>
                      <button
                        onClick={() => { setOpenMenuId(null); router.push(`/transacoes/${tx.id}/editar`); }}
                        style={{
                          flex: 1, padding: "9px 12px", borderRadius: "10px",
                          background: "var(--bg-input)", border: "1px solid var(--border)",
                          color: "var(--text-1)", fontSize: "13px", fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                          minHeight: "40px", touchAction: "manipulation",
                        }}
                      >
                        <Pencil size={13} strokeWidth={1.5} /> Editar
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Excluir esta transação? Esta ação não pode ser desfeita.")) {
                            dispatch({ type: "DEL_TX", payload: tx.id });
                            setOpenMenuId(null);
                          }
                        }}
                        style={{
                          flex: 1, padding: "9px 12px", borderRadius: "10px",
                          background: "var(--red-10)", border: "1px solid var(--red-20)",
                          color: "var(--red)", fontSize: "13px", fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                          minHeight: "40px", touchAction: "manipulation",
                        }}
                      >
                        <Trash2 size={13} strokeWidth={1.5} /> Excluir
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
