"use client";
import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import type { Transaction } from "@/context/AppContext";
import TransactionModal from "@/components/TransactionModal";
import TransactionDrawer from "@/components/TransactionDrawer";
import { currentMonth } from "@/engine/financialEngine";

type FilterKey = "Todos" | "A pagar" | "Pago" | "Vencido" | "Receitas";

const FILTERS: FilterKey[] = ["Todos", "A pagar", "Pago", "Vencido", "Receitas"];

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const statusMap = {
  paid: { cls: "badge badge-pago", label: "Pago" },
  pending: { cls: "badge badge-pagar", label: "A pagar" },
  overdue: { cls: "badge badge-vencido", label: "Vencido" },
};

export default function Transacoes() {
  const { state, dispatch } = useApp();
  const [filter, setFilter] = useState<FilterKey>("Todos");
  const [monthFilter, setMonthFilter] = useState(currentMonth());
  const [showModal, setShowModal] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [editTx, setEditTx] = useState<Transaction | null>(null);

  const filtered = useMemo(() => {
    let txs = [...state.transactions];
    if (monthFilter) {
      txs = txs.filter(t => t.competenceDate.startsWith(monthFilter));
    }
    if (filter === "A pagar") txs = txs.filter(t => t.status === "pending");
    else if (filter === "Pago") txs = txs.filter(t => t.status === "paid");
    else if (filter === "Vencido") txs = txs.filter(t => t.status === "overdue");
    else if (filter === "Receitas") txs = txs.filter(t => t.type === "income");
    return txs.sort((a, b) => b.competenceDate.localeCompare(a.competenceDate));
  }, [state.transactions, filter, monthFilter]);

  const summaryBase = useMemo(() => {
    return state.transactions.filter(t => t.competenceDate.startsWith(monthFilter));
  }, [state.transactions, monthFilter]);

  const income = summaryBase.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = summaryBase.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const aPagar = summaryBase.filter(t => t.status === "pending").reduce((s, t) => s + t.amount, 0);
  const vencido = summaryBase.filter(t => t.status === "overdue").reduce((s, t) => s + t.amount, 0);

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
    <div style={{ padding: "28px", maxWidth: "1000px" }}>
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

      {/* Header */}
      <div className="fade-up-1" style={{ marginBottom: "28px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em" }}>Transações</h1>
          <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "3px" }}>
            {state.transactions.length} movimentações cadastradas
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Nova transação</button>
      </div>

      {/* Summary */}
      <div className="fade-up-2" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "Receitas", value: income, color: "var(--green)" },
          { label: "Despesas", value: expense, color: "var(--red)" },
          { label: "A pagar", value: aPagar, color: "var(--amber)" },
          { label: "Vencido", value: vencido, color: "var(--red)" },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: "16px 18px" }}>
            <p style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "5px" }}>{s.label}</p>
            <p className="mono" style={{ fontSize: "17px", fontWeight: 700, color: s.color, letterSpacing: "-0.02em" }}>
              R$ {fmt(s.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="fade-up-3 card" style={{ padding: "12px 16px", marginBottom: "14px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="month"
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)",
            borderRadius: "8px", color: "var(--text-1)", fontSize: "12px", padding: "5px 10px",
            fontFamily: "inherit", cursor: "pointer",
          }}
        />
        <div style={{ width: "1px", height: "20px", background: "var(--border)", margin: "0 4px" }} />
        <span style={{ fontSize: "11.5px", color: "var(--text-3)", fontWeight: 700, marginRight: "4px" }}>Status:</span>
        {FILTERS.map(f => (
          <button
            key={f}
            className={`filter-btn${filter === f ? " active" : ""}`}
            onClick={() => setFilter(f)}
          >{f}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--text-3)" }}>
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="card fade-up-4" style={{ overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 110px 120px 130px 110px",
          padding: "11px 20px", borderBottom: "1px solid var(--border)",
          fontSize: "10.5px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase",
        }}>
          <span>Descrição</span>
          <span>Competência</span>
          <span>Pagamento</span>
          <span style={{ textAlign: "right" }}>Valor</span>
          <span style={{ textAlign: "center" }}>Status</span>
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-3)", fontSize: "14px" }}>
            Nenhuma transação encontrada.
          </div>
        )}

        {filtered.map((tx, i) => {
          const cat = state.categories.find(c => c.id === tx.categoryId);
          const s = statusMap[tx.status];
          return (
            <div
              key={tx.id}
              onClick={() => setSelectedTx(tx)}
              style={{
                display: "grid", gridTemplateColumns: "1fr 110px 120px 130px 110px",
                padding: "13px 20px", alignItems: "center", cursor: "pointer",
                borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-card-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
                  background: cat ? `${cat.color}18` : "rgba(255,255,255,0.06)",
                  border: `1px solid ${cat?.color ?? "#ffffff"}22`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px",
                }}>{cat?.icon ?? (tx.type === "income" ? "💰" : "📦")}</div>
                <div>
                  <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-1)" }}>{tx.description}</div>
                  <div style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "1px" }}>{cat?.name ?? "Sem categoria"}</div>
                </div>
              </div>
              <span style={{ fontSize: "12.5px", color: "var(--text-2)" }}>{formatDate(tx.competenceDate)}</span>
              <span style={{
                fontSize: "12.5px",
                color: tx.status === "overdue" ? "var(--red)" : "var(--text-2)",
                fontWeight: tx.status === "overdue" ? 600 : 400,
              }}>{formatDate(tx.paymentDate)}</span>
              <div className="mono" style={{
                fontSize: "14px", fontWeight: 700, textAlign: "right",
                color: tx.type === "income" ? "var(--green)" : "var(--text-1)", letterSpacing: "-0.02em",
              }}>
                {tx.type === "income" ? "+" : "-"}R$ {fmt(tx.amount)}
              </div>
              <div style={{ textAlign: "center" }}>
                <span className={s.cls}>{s.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
