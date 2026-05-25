"use client";
import { useState, useMemo } from "react";
import DonutChart, { Segment } from "@/components/DonutChart";
import TransactionDrawer from "@/components/TransactionDrawer";
import TransactionModal from "@/components/TransactionModal";
import { useApp } from "@/context/AppContext";
import type { Transaction } from "@/context/AppContext";
import {
  getCurrentBalance, getDueThisWeek, getOverdueTransactions, currentMonth,
} from "@/engine/financialEngine";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string) {
  if (!d) return "—";
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}
function StatusBadge({ status }: { status: Transaction["status"] }) {
  const map = {
    paid: { cls: "badge badge-pago", label: "Pago" },
    pending: { cls: "badge badge-pagar", label: "A pagar" },
    overdue: { cls: "badge badge-vencido", label: "Vencido" },
  };
  const item = map[status];
  return <span className={item.cls}>{item.label}</span>;
}

// Seção de alerta acionável — mostra lista de transações com botão Pagar
function AlertSection({
  title, icon, accentColor, bgColor, borderColor,
  transactions, categories, onPay, onOpen,
}: {
  title: string; icon: string; accentColor: string; bgColor: string; borderColor: string;
  transactions: Transaction[];
  categories: { id: string; name: string; icon: string; color: string }[];
  onPay: (tx: Transaction) => void;
  onOpen: (tx: Transaction) => void;
}) {
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  if (transactions.length === 0) return null;

  return (
    <div style={{
      background: bgColor, border: `1px solid ${borderColor}`,
      borderRadius: "16px", overflow: "hidden", marginBottom: "12px",
    }}>
      {/* Header */}
      <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "18px" }}>{icon}</span>
          <div>
            <p style={{ fontSize: "13px", fontWeight: 700, color: accentColor }}>{title}</p>
            <p style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "1px" }}>
              {transactions.length} transaç{transactions.length === 1 ? "ão" : "ões"} · R$ {fmt(total)}
            </p>
          </div>
        </div>
      </div>

      {/* Transaction rows */}
      <div style={{ borderTop: `1px solid ${borderColor}` }}>
        {transactions.map((tx, i) => {
          const cat = categories.find(c => c.id === tx.categoryId);
          return (
            <div
              key={tx.id}
              className="pay-row"
              style={{ borderBottom: i < transactions.length - 1 ? `1px solid ${borderColor}` : "none" }}
            >
              {/* Icon */}
              <div style={{
                width: "38px", height: "38px", borderRadius: "10px", flexShrink: 0,
                background: `${cat?.color ?? "#ffffff"}15`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px",
              }}
                onClick={() => onOpen(tx)}
              >
                {cat?.icon ?? "📦"}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }} onClick={() => onOpen(tx)}>
                <p style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tx.description}
                </p>
                <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                  {cat?.name ?? "—"} · {fmtDate(tx.paymentDate)}
                </p>
              </div>

              {/* Amount */}
              <p className="mono" onClick={() => onOpen(tx)} style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-1)", flexShrink: 0, marginRight: "10px" }}>
                R$ {fmt(tx.amount)}
              </p>

              {/* Pay button */}
              <button
                className="pay-btn"
                onClick={() => onPay(tx)}
              >
                Pagar
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { state, dispatch } = useApp();
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const cm = currentMonth();

  // Saldo real de todas as contas
  const totalBalance = useMemo(() =>
    state.accounts.filter(a => a.active).reduce((s, a) => s + getCurrentBalance(a, state.transactions), 0),
    [state.accounts, state.transactions]
  );

  // Receitas e despesas do mês (todas, sem filtro de status)
  const monthTxs = useMemo(() =>
    state.transactions.filter(t => t.competenceDate.startsWith(cm)),
    [state.transactions, cm]
  );
  const monthIncome = monthTxs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthTxs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  // Alertas
  const overdue = useMemo(() => getOverdueTransactions(state.transactions), [state.transactions]);
  const dueThisWeek = useMemo(() =>
    getDueThisWeek(state.transactions).filter(t => t.status !== "overdue"),
    [state.transactions]
  );

  // Gráfico de categorias (mês atual, pagas)
  const segments: Segment[] = useMemo(() => {
    const expenses = state.transactions.filter(
      t => t.type === "expense" && t.competenceDate.startsWith(cm) && t.status === "paid"
    );
    const total = expenses.reduce((s, t) => s + t.amount, 0) || 1;
    const byCat: Record<string, { amount: number; color: string }> = {};
    expenses.forEach(t => {
      const cat = state.categories.find(c => c.id === t.categoryId);
      const name = cat?.name ?? "Outros";
      if (!byCat[name]) byCat[name] = { amount: 0, color: cat?.color ?? "#6B7FA3" };
      byCat[name].amount += t.amount;
    });
    return Object.entries(byCat)
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 6)
      .map(([name, { amount, color }]) => ({
        name, amount, color,
        percentage: Math.round((amount / total) * 100),
      }));
  }, [state.transactions, state.categories, cm]);

  // Transações recentes
  const recent = useMemo(() =>
    [...state.transactions]
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
      .slice(0, 10),
    [state.transactions]
  );
  const filteredRecent = useMemo(() => {
    if (!activeCategory) return recent;
    return recent.filter(t => {
      const cat = state.categories.find(c => c.id === t.categoryId);
      return cat?.name === activeCategory;
    });
  }, [recent, activeCategory, state.categories]);

  function payNow(tx: Transaction) {
    dispatch({ type: "UPD_TX", payload: { ...tx, status: "paid" } });
  }

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
    <>
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

      <div style={{ padding: "20px 16px", maxWidth: "680px", margin: "0 auto" }}>

        {/* ── Header ─────────────────────────── */}
        <div className="fade-up-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <p style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Saldo disponível
            </p>
            <p className="mono" style={{
              fontSize: "32px", fontWeight: 700, letterSpacing: "-0.03em",
              color: totalBalance >= 0 ? "var(--text-1)" : "var(--red)",
              marginTop: "2px",
            }}>
              R$ {fmt(totalBalance)}
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={() => setShowModal(true)}
            style={{ fontSize: "20px", padding: "0", width: "48px", height: "48px", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >+</button>
        </div>

        {/* ── Receitas / Despesas ─────────────── */}
        <div className="fade-up-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
          <div className="card" style={{ padding: "16px" }}>
            <p style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "6px" }}>
              ↑ Receitas
            </p>
            <p className="mono" style={{ fontSize: "20px", fontWeight: 700, color: "var(--green)", letterSpacing: "-0.02em" }}>
              R$ {fmt(monthIncome)}
            </p>
            <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginTop: "4px" }}>
              {monthTxs.filter(t => t.type === "income").length} lançamento{monthTxs.filter(t => t.type === "income").length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="card" style={{ padding: "16px" }}>
            <p style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "6px" }}>
              ↓ Despesas
            </p>
            <p className="mono" style={{ fontSize: "20px", fontWeight: 700, color: monthExpense > monthIncome ? "var(--red)" : "var(--text-1)", letterSpacing: "-0.02em" }}>
              R$ {fmt(monthExpense)}
            </p>
            <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginTop: "4px" }}>
              {monthTxs.filter(t => t.type === "expense").length} lançamento{monthTxs.filter(t => t.type === "expense").length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* ── Seções de alerta ────────────────── */}
        <div className="fade-up-2">
          <AlertSection
            title="Transações vencidas"
            icon="⚠️"
            accentColor="var(--red)"
            bgColor="var(--red-10)"
            borderColor="var(--red-20)"
            transactions={overdue}
            categories={state.categories}
            onPay={payNow}
            onOpen={tx => setSelectedTx(tx)}
          />
          <AlertSection
            title="Vencendo esta semana"
            icon="🔔"
            accentColor="var(--amber)"
            bgColor="var(--amber-10)"
            borderColor="var(--amber-20)"
            transactions={dueThisWeek}
            categories={state.categories}
            onPay={payNow}
            onOpen={tx => setSelectedTx(tx)}
          />
        </div>

        {/* ── Gráfico de gastos ───────────────── */}
        {segments.length > 0 && (
          <div className="card fade-up-3" style={{ padding: "20px", marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Gastos por categoria
              </p>
              {activeCategory && (
                <button onClick={() => setActiveCategory(null)} style={{ fontSize: "11px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                  Limpar ×
                </button>
              )}
            </div>
            <DonutChart
              segments={segments}
              totalLabel="Gastos"
              total={`R$ ${fmt(segments.reduce((s, c) => s + c.amount, 0))}`}
              onSegmentClick={seg => setActiveCategory(seg?.name ?? null)}
              activeSegment={activeCategory}
            />
          </div>
        )}

        {/* ── Transações recentes ─────────────── */}
        <div className="card fade-up-4" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Lançamentos
            </p>
            <a href="/transacoes" style={{ fontSize: "12px", color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
              Ver todos →
            </a>
          </div>

          {filteredRecent.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--text-3)", fontSize: "13px" }}>
              Nenhuma transação encontrada.
            </div>
          ) : (
            filteredRecent.map((tx, i) => {
              const cat = state.categories.find(c => c.id === tx.categoryId);
              return (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "13px 16px",
                    borderTop: "1px solid var(--border)",
                    cursor: "pointer", transition: "background 0.15s",
                    minHeight: "60px",
                  }}
                  onTouchStart={() => {}}
                >
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "12px", flexShrink: 0,
                    background: cat ? `${cat.color}18` : "rgba(255,255,255,0.06)",
                    border: `1px solid ${cat?.color ?? "#ffffff"}22`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px",
                  }}>
                    {cat?.icon ?? (tx.type === "income" ? "💰" : "📦")}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tx.description}
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                      {cat?.name ?? "—"} · {fmtDate(tx.paymentDate)}
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
                    <p className="mono" style={{
                      fontSize: "14px", fontWeight: 700,
                      color: tx.type === "income" ? "var(--green)" : "var(--text-1)",
                    }}>
                      {tx.type === "income" ? "+" : "-"}R$ {fmt(tx.amount)}
                    </p>
                    <StatusBadge status={tx.status} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
