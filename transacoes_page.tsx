"use client";
import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import type { Transaction } from "@/context/AppContext";
import TransactionModal from "@/components/TransactionModal";
import TransactionDrawer from "@/components/TransactionDrawer";
import { currentMonth, addMonths, fmt } from "@/engine/financialEngine";

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
  const { state, dispatch } = useApp();
  const [filter, setFilter] = useState<FilterKey>("Todos");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [showModal, setShowModal] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [editTx, setEditTx] = useState<Transaction | null>(null);

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

  function handleStatusChange(id: string, status: Transaction["status"]) {
    const tx = state.transactions.find(t => t.id === id);
    if (!tx) return;
    dispatch({ type: "UPD_TX", payload: { ...tx, status } });
    setSelectedTx(prev => prev?.id === id ? { ...prev, status } : prev);
  }

  function handleDelete(id: string) {
    dispatch({ type: "DEL_TX", payload: id });
    setSelectedTx(null);
  }

  return (
    <div style={{ padding: "16px", maxWidth: "860px", margin: "0 auto" }}>
      {showModal && <TransactionModal onClose={() => setShowModal(false)} />}
      {editTx && <TransactionModal transaction={editTx} onClose={() => setEditTx(null)} />}
      <TransactionDrawer
        tx={selectedTx}
        categories={state.categories}
        onClose={() => setSelectedTx(null)}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
        onEdit={tx => { setSelectedTx(null); setEditTx(tx); }}
      />

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
          onClick={() => setShowModal(true)}
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
            <p style={{ fontSize: "32px", marginBottom: "10px" }}>🔍</p>
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
              return (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "13px 14px",
                    borderTop: "1px solid var(--border)",
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
                    {cat?.icon ?? (tx.type === "income" ? "💰" : "📦")}
                  </div>

                  <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                    <p style={{
                      fontSize: "13.5px", fontWeight: 600, color: "var(--text-1)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {tx.description}
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                      {cat?.name ?? "—"} · {fmtDate(tx.paymentDate)}
                      {tx.isRecurring && " · 🔄"}
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
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
