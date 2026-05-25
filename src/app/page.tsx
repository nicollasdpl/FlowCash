"use client";
import { useState, useMemo } from "react";
import TransactionDrawer from "@/components/TransactionDrawer";
import TransactionModal from "@/components/TransactionModal";
import { useApp } from "@/context/AppContext";
import type { Transaction } from "@/context/AppContext";
import {
  getCurrentBalance, getProjectedBalance, getDueThisWeek,
  getOverdueTransactions, getMonthlyProjections, currentMonth, fmt,
} from "@/engine/financialEngine";
import { computeInvoice } from "@/engine/invoiceEngine";

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

function endOfMonth() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().split("T")[0];
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

function monthLabel(yyyymm: string) {
  const [, m] = yyyymm.split("-");
  return MONTH_LABELS[m] ?? yyyymm;
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

  const cm = currentMonth();
  const eom = endOfMonth();

  const totalBalance = useMemo(() =>
    state.accounts.filter(a => a.active).reduce((s, a) => s + getCurrentBalance(a, state.transactions), 0),
    [state.accounts, state.transactions]
  );

  const totalProjected = useMemo(() =>
    state.accounts.filter(a => a.active).reduce((s, a) => s + getProjectedBalance(a, state.transactions, eom), 0),
    [state.accounts, state.transactions, eom]
  );

  const monthTxs = useMemo(() =>
    state.transactions.filter(t => t.competenceDate.startsWith(cm)),
    [state.transactions, cm]
  );
  const monthIncome = monthTxs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthTxs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const overdue = useMemo(() => getOverdueTransactions(state.transactions), [state.transactions]);
  const dueThisWeek = useMemo(() =>
    getDueThisWeek(state.transactions).filter(t => t.status !== "overdue"),
    [state.transactions]
  );

  const cardInvoices = useMemo(() =>
    state.cards.filter(c => c.active).map(card => ({
      card,
      invoice: computeInvoice(card, state.installments, cm),
    })).filter(({ invoice }) => invoice.totalAmount > 0),
    [state.cards, state.installments, cm]
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

  const recent = useMemo(() =>
    [...state.transactions]
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
      .slice(0, 10),
    [state.transactions]
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

      <div style={{ padding: "20px 16px", maxWidth: "680px", margin: "0 auto" }}>

        {/* ── Header ─────────────────────────── */}
        <div className="fade-up-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            {name ? (
              <>
                <p style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
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

        {/* ── Saldo Real + Projetado ──────────── */}
        <div className="card fade-up-1" style={{ padding: "20px 20px 16px", marginBottom: "12px" }}>
          <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
            Saldo Real
          </p>
          <p className="mono" style={{
            fontSize: "36px", fontWeight: 700, letterSpacing: "-0.03em",
            color: totalBalance >= 0 ? "var(--text-1)" : "var(--red)",
            lineHeight: 1,
          }}>
            R$ {fmt(totalBalance)}
          </p>

          {totalProjected !== totalBalance && (
            <div style={{
              marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                  Projetado (fim do mês)
                </p>
                <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginTop: "2px" }}>
                  Inclui pendentes ainda não pagos
                </p>
              </div>
              <p className="mono" style={{ fontSize: "16px", fontWeight: 700, color: totalProjected >= 0 ? "var(--accent)" : "var(--red)", flexShrink: 0 }}>
                R$ {fmt(totalProjected)}
              </p>
            </div>
          )}
        </div>

        {/* ── Receitas / Despesas do mês ─────── */}
        <div className="fade-up-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
          <div className="card" style={{ padding: "14px 16px" }}>
            <p style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "5px" }}>↑ Receitas</p>
            <p className="mono" style={{ fontSize: "19px", fontWeight: 700, color: "var(--green)" }}>R$ {fmt(monthIncome)}</p>
            <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginTop: "3px" }}>
              {monthTxs.filter(t => t.type === "income").length} lançamento{monthTxs.filter(t => t.type === "income").length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="card" style={{ padding: "14px 16px" }}>
            <p style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "5px" }}>↓ Despesas</p>
            <p className="mono" style={{ fontSize: "19px", fontWeight: 700, color: monthExpense > monthIncome ? "var(--red)" : "var(--text-1)" }}>R$ {fmt(monthExpense)}</p>
            <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginTop: "3px" }}>
              {monthTxs.filter(t => t.type === "expense").length} lançamento{monthTxs.filter(t => t.type === "expense").length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* ── Obrigações Futuras ──────────────── */}
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

        {/* ── Faturas de Cartão ───────────────── */}
        {cardInvoices.length > 0 && (
          <div className="card fade-up-3" style={{ overflow: "hidden", marginBottom: "16px" }}>
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
        {recurringUpcoming.length > 0 && (
          <div className="card fade-up-3" style={{ overflow: "hidden", marginBottom: "16px" }}>
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
                    padding: "13px 16px", cursor: "pointer", transition: "background 0.15s",
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
        {projections.some(p => p.projectedIncome > 0 || p.projectedExpense > 0) && (
          <div className="card fade-up-4" style={{ overflow: "hidden", marginBottom: "16px" }}>
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
              return (
                <div key={p.month} style={{
                  display: "grid", gridTemplateColumns: "56px 1fr 1fr 1fr",
                  alignItems: "center", padding: "12px 16px",
                  borderBottom: i < projections.length - 1 ? "1px solid var(--border)" : "none",
                  gap: "8px",
                }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-2)" }}>{monthLabel(p.month)}</span>
                  <span className="mono" style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--green)", textAlign: "right" }}>
                    +{fmt(p.projectedIncome)}
                  </span>
                  <span className="mono" style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--red)", textAlign: "right" }}>
                    -{fmt(p.projectedExpense)}
                  </span>
                  <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: riskColor, textAlign: "right" }}>
                    {p.projectedBalance >= 0 ? "" : "-"}R${Math.abs(p.projectedBalance) >= 1000
                      ? `${(Math.abs(p.projectedBalance) / 1000).toFixed(1)}k`
                      : fmt(Math.abs(p.projectedBalance))}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Lançamentos Recentes ─────────────── */}
        <div className="card fade-up-5" style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Lançamentos
            </p>
            <a href="/transacoes" style={{ fontSize: "11.5px", color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
              Ver todos →
            </a>
          </div>

          {recent.length === 0 ? (
            <div style={{ padding: "36px 16px", textAlign: "center" }}>
              <p style={{ fontSize: "32px", marginBottom: "10px" }}>💸</p>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-2)" }}>Nenhum lançamento ainda</p>
              <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                Toque em + para adicionar sua primeira transação
              </p>
            </div>
          ) : (
            recent.map((tx, i) => {
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
