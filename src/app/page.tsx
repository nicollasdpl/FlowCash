"use client";
import { useState, useMemo, useRef } from "react";
import TransactionDrawer from "@/components/TransactionDrawer";
import TransactionModal from "@/components/TransactionModal";
import { useApp } from "@/context/AppContext";
import type { Transaction } from "@/context/AppContext";
import {
  getCurrentBalance, getProjectedBalance, getDueThisWeek,
  getOverdueTransactions, getMonthlyProjections, currentMonth, addMonths, fmt,
} from "@/engine/financialEngine";
import { computeInvoice } from "@/engine/invoiceEngine";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MONTH_SHORT: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

function fullMonthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
function shortMonthLabel(yyyymm: string) {
  const [, m] = yyyymm.split("-");
  return MONTH_SHORT[m] ?? yyyymm;
}

function fmtDate(d: string) {
  if (!d) return "—";
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function endOfMonth(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  const last = new Date(y, m, 0);
  return `${yyyymm}-${String(last.getDate()).padStart(2, "0")}`;
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
      <div style={{ borderTop: `1px solid ${borderColor}` }}>
        {transactions.map((tx, i) => {
          const cat = categories.find(c => c.id === tx.categoryId);
          return (
            <div
              key={tx.id}
              className="pay-row"
              style={{ borderBottom: i < transactions.length - 1 ? `1px solid ${borderColor}` : "none" }}
            >
              <div
                style={{
                  width: "38px", height: "38px", borderRadius: "10px", flexShrink: 0,
                  background: `${cat?.color ?? "#ffffff"}15`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px",
                }}
                onClick={() => onOpen(tx)}
              >
                {cat?.icon ?? "📦"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }} onClick={() => onOpen(tx)}>
                <p style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tx.description}
                </p>
                <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                  {cat?.name ?? "—"} · {fmtDate(tx.paymentDate)}
                </p>
              </div>
              <p className="mono" onClick={() => onOpen(tx)} style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-1)", flexShrink: 0, marginRight: "10px" }}>
                R$ {fmt(tx.amount)}
              </p>
              <button className="pay-btn" onClick={() => onPay(tx)}>Pagar</button>
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
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    const dy = Math.abs(touchStartY.current - e.changedTouches[0].clientY);
    // Only swipe if horizontal movement dominates
    if (Math.abs(dx) > 60 && Math.abs(dx) > dy * 1.5) {
      if (dx > 0) setSelectedMonth(m => addMonths(m, 1));
      else setSelectedMonth(m => addMonths(m, -1));
    }
  }

  const eom = endOfMonth(selectedMonth);
  const isCurrentMonth = selectedMonth === currentMonth();

  const totalBalance = useMemo(() =>
    state.accounts.filter(a => a.active).reduce((s, a) => s + getCurrentBalance(a, state.transactions), 0),
    [state.accounts, state.transactions]
  );

  const totalProjected = useMemo(() =>
    state.accounts.filter(a => a.active).reduce((s, a) => s + getProjectedBalance(a, state.transactions, eom), 0),
    [state.accounts, state.transactions, eom]
  );

  const monthTxs = useMemo(() =>
    state.transactions.filter(t => t.competenceDate.startsWith(selectedMonth)),
    [state.transactions, selectedMonth]
  );

  const monthIncome = useMemo(() =>
    monthTxs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
    [monthTxs]
  );
  const monthExpense = useMemo(() =>
    monthTxs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    [monthTxs]
  );
  const monthBalance = monthIncome - monthExpense;

  const overdue = useMemo(() => getOverdueTransactions(state.transactions), [state.transactions]);
  const dueThisWeek = useMemo(() =>
    getDueThisWeek(state.transactions).filter(t => t.status !== "overdue"),
    [state.transactions]
  );

  const cardInvoices = useMemo(() =>
    state.cards.filter(c => c.active).map(card => ({
      card,
      invoice: computeInvoice(card, state.installments, selectedMonth),
    })).filter(({ invoice }) => invoice.totalAmount > 0),
    [state.cards, state.installments, selectedMonth]
  );

  const projections = useMemo(() =>
    getMonthlyProjections(state.accounts, state.transactions, 3),
    [state.accounts, state.transactions]
  );

  const recurringUpcoming = useMemo(() => {
    const td = new Date();
    const todayStr = td.toISOString().split("T")[0];
    const t30 = new Date(td.getTime() + 30 * 86400000).toISOString().split("T")[0];
    return state.transactions
      .filter(t => t.isRecurring && t.status === "pending" && t.paymentDate >= todayStr && t.paymentDate <= t30)
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))
      .slice(0, 5);
  }, [state.transactions]);

  const recentTxs = useMemo(() =>
    [...monthTxs]
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
      .slice(0, 15),
    [monthTxs]
  );

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

  const name = state.userName?.trim() || "";

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

      <div
        style={{ padding: "20px 16px", maxWidth: "680px", margin: "0 auto" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >

        {/* ── Header ─────────────────────────── */}
        <div className="fade-up-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
          <div>
            {name ? (
              <>
                <p style={{ fontSize: "19px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
                  {greeting()}, {name} 👋
                </p>
                <p style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "3px" }}>
                  {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-1)" }}>{greeting()} 👋</p>
                <a href="/configuracoes" style={{ fontSize: "11.5px", color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                  Defina seu nome em Configurações →
                </a>
              </>
            )}
          </div>
          <button
            className="btn-primary"
            onClick={() => setShowModal(true)}
            style={{ fontSize: "22px", padding: "0", width: "48px", height: "48px", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            aria-label="Nova transação"
          >+</button>
        </div>

        {/* ── Seletor de Mês ──────────────────── */}
        <div className="fade-up-1" style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0" }}>
            <button
              onClick={() => setSelectedMonth(m => addMonths(m, -1))}
              style={{
                background: "none", border: "none", color: "var(--text-2)", cursor: "pointer",
                fontSize: "20px", padding: "8px 16px", minHeight: "44px", minWidth: "44px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              aria-label="Mês anterior"
            >‹</button>

            <div style={{ textAlign: "center", minWidth: "160px" }}>
              <p style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
                {fullMonthLabel(selectedMonth)}
              </p>
              {!isCurrentMonth && (
                <button
                  onClick={() => setSelectedMonth(currentMonth())}
                  style={{
                    background: "none", border: "none", color: "var(--accent)", cursor: "pointer",
                    fontSize: "11px", fontWeight: 600, padding: "0", fontFamily: "inherit",
                  }}
                >
                  Ir para hoje
                </button>
              )}
            </div>

            <button
              onClick={() => setSelectedMonth(m => addMonths(m, 1))}
              style={{
                background: "none", border: "none", color: "var(--text-2)", cursor: "pointer",
                fontSize: "20px", padding: "8px 16px", minHeight: "44px", minWidth: "44px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              aria-label="Próximo mês"
            >›</button>
          </div>
        </div>

        {/* ── Saldo Real + Projetado ──────────── */}
        <div className="card fade-up-2" style={{ padding: "20px 20px 16px", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "5px" }}>
                Saldo Real
              </p>
              <p className="mono" style={{
                fontSize: "34px", fontWeight: 700, letterSpacing: "-0.03em",
                color: totalBalance >= 0 ? "var(--text-1)" : "var(--red)",
                lineHeight: 1,
              }}>
                R$ {fmt(totalBalance)}
              </p>
            </div>
            {totalProjected !== totalBalance && (
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "5px" }}>
                  Projetado
                </p>
                <p className="mono" style={{ fontSize: "20px", fontWeight: 700, color: totalProjected >= 0 ? "var(--accent)" : "var(--red)" }}>
                  R$ {fmt(totalProjected)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Receitas / Despesas / Balanço ────── */}
        <div className="fade-up-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
          <div className="card" style={{ padding: "12px 12px" }}>
            <p style={{ fontSize: "9px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "4px" }}>↑ Receitas</p>
            <p className="mono" style={{ fontSize: "15px", fontWeight: 700, color: "var(--green)" }}>
              {monthIncome >= 1000 ? `${(monthIncome / 1000).toFixed(1)}k` : fmt(monthIncome)}
            </p>
          </div>
          <div className="card" style={{ padding: "12px 12px" }}>
            <p style={{ fontSize: "9px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "4px" }}>↓ Despesas</p>
            <p className="mono" style={{ fontSize: "15px", fontWeight: 700, color: monthExpense > monthIncome ? "var(--red)" : "var(--text-1)" }}>
              {monthExpense >= 1000 ? `${(monthExpense / 1000).toFixed(1)}k` : fmt(monthExpense)}
            </p>
          </div>
          <div className="card" style={{ padding: "12px 12px" }}>
            <p style={{ fontSize: "9px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "4px" }}>Balanço</p>
            <p className="mono" style={{ fontSize: "15px", fontWeight: 700, color: monthBalance >= 0 ? "var(--accent)" : "var(--red)" }}>
              {monthBalance >= 0 ? "+" : ""}
              {Math.abs(monthBalance) >= 1000 ? `${(monthBalance / 1000).toFixed(1)}k` : fmt(monthBalance)}
            </p>
          </div>
        </div>

        {/* ── Obrigações ─────────────────────── */}
        {isCurrentMonth && (
          <div className="fade-up-3">
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
        )}

        {/* ── Faturas de Cartão ───────────────── */}
        {cardInvoices.length > 0 && (
          <div className="card fade-up-4" style={{ overflow: "hidden", marginBottom: "16px" }}>
            <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Faturas de Cartão
              </p>
              <a href="/cartoes" style={{ fontSize: "11.5px", color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>Ver →</a>
            </div>
            {cardInvoices.map(({ card, invoice }, i) => (
              <div key={card.id} style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "13px 16px",
                borderBottom: i < cardInvoices.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{
                  width: "38px", height: "38px", borderRadius: "10px", flexShrink: 0,
                  background: `${card.color}22`, border: `1px solid ${card.color}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: "16px" }}>💳</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {card.name}
                  </p>
                  <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                    Vence {fmtDate(invoice.dueDate)} · {invoice.status === "paid" ? "Paga" : invoice.status === "closed" ? "Fechada" : "Em aberto"}
                  </p>
                </div>
                <p className="mono" style={{ fontSize: "14px", fontWeight: 700, color: invoice.status === "paid" ? "var(--green)" : "var(--text-1)", flexShrink: 0 }}>
                  R$ {fmt(invoice.totalAmount)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── Recorrências ────────────────────── */}
        {isCurrentMonth && recurringUpcoming.length > 0 && (
          <div className="card fade-up-4" style={{ overflow: "hidden", marginBottom: "16px" }}>
            <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid var(--border)" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Recorrências (próx. 30 dias)
              </p>
            </div>
            {recurringUpcoming.map((tx, i) => {
              const cat = state.categories.find(c => c.id === tx.categoryId);
              return (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "13px 16px", cursor: "pointer",
                    borderBottom: i < recurringUpcoming.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div style={{
                    width: "38px", height: "38px", borderRadius: "10px", flexShrink: 0,
                    background: cat ? `${cat.color}18` : "rgba(255,255,255,0.06)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px",
                  }}>
                    {cat?.icon ?? "🔄"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tx.description}
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                      {cat?.name ?? "—"} · {fmtDate(tx.paymentDate)}
                    </p>
                  </div>
                  <p className="mono" style={{ fontSize: "14px", fontWeight: 700, color: tx.type === "income" ? "var(--green)" : "var(--text-1)", flexShrink: 0 }}>
                    {tx.type === "income" ? "+" : "-"}R$ {fmt(tx.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Fluxo de Caixa ──────────────────── */}
        {isCurrentMonth && projections.some(p => p.projectedIncome > 0 || p.projectedExpense > 0) && (
          <div className="card fade-up-5" style={{ overflow: "hidden", marginBottom: "16px" }}>
            <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Fluxo de Caixa
              </p>
              <a href="/relatorios" style={{ fontSize: "11.5px", color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                Relatórios →
              </a>
            </div>
            {projections.map((p, i) => {
              const riskColor = p.riskLevel === "danger" ? "var(--red)" : p.riskLevel === "warning" ? "var(--amber)" : "var(--green)";
              const isThisMonth = p.month === currentMonth();
              return (
                <div key={p.month} style={{
                  display: "grid", gridTemplateColumns: "52px 1fr 1fr 1fr",
                  alignItems: "center", padding: "11px 16px",
                  borderBottom: i < projections.length - 1 ? "1px solid var(--border)" : "none",
                  background: isThisMonth ? "rgba(0,229,195,0.04)" : "transparent",
                  gap: "6px",
                }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: isThisMonth ? "var(--accent)" : "var(--text-2)" }}>
                    {shortMonthLabel(p.month)}
                  </span>
                  <span className="mono" style={{ fontSize: "11px", fontWeight: 600, color: "var(--green)", textAlign: "right" }}>
                    +{fmt(p.projectedIncome)}
                  </span>
                  <span className="mono" style={{ fontSize: "11px", fontWeight: 600, color: "var(--red)", textAlign: "right" }}>
                    -{fmt(p.projectedExpense)}
                  </span>
                  <span className="mono" style={{ fontSize: "11px", fontWeight: 700, color: riskColor, textAlign: "right" }}>
                    {p.projectedBalance >= 0 ? "" : "-"}
                    {Math.abs(p.projectedBalance) >= 1000
                      ? `${(Math.abs(p.projectedBalance) / 1000).toFixed(1)}k`
                      : fmt(Math.abs(p.projectedBalance))}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Lançamentos do Mês ──────────────── */}
        <div className="card fade-up-6" style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Lançamentos
            </p>
            <a href="/transacoes" style={{ fontSize: "11.5px", color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
              Ver todos →
            </a>
          </div>

          {recentTxs.length === 0 ? (
            <div style={{ padding: "36px 16px", textAlign: "center" }}>
              <p style={{ fontSize: "32px", marginBottom: "10px" }}>💸</p>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-2)" }}>
                Sem lançamentos em {fullMonthLabel(selectedMonth)}
              </p>
              {isCurrentMonth && (
                <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                  Toque em + para adicionar
                </p>
              )}
            </div>
          ) : (
            recentTxs.map((tx, i) => {
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
                  onTouchStart={e => e.stopPropagation()}
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
