"use client";
import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TransactionDrawer from "@/components/TransactionDrawer";
import { useApp } from "@/context/AppContext";
import type { Transaction } from "@/context/AppContext";
import {
  getCurrentBalance, getProjectedBalance, getDueThisWeek,
  getOverdueTransactions, getMonthlyProjections, getCardCommittedByMonth,
  currentMonth, addMonths, fmt,
} from "@/engine/financialEngine";
import { computeInvoice } from "@/engine/invoiceEngine";
import { AlertTriangle, Bell, CreditCard, Wallet, TrendingUp, Package } from "lucide-react";
import CategoryIcon from "@/components/CategoryIcon";

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
  title: string; icon: React.ReactNode; accentColor: string; bgColor: string; borderColor: string;
  transactions: Transaction[];
  categories: { id: string; name: string; icon: string; color: string }[];
  onPay: (tx: Transaction) => void;
  onOpen: (tx: Transaction) => void;
}) {
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  if (transactions.length === 0) return null;

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: "var(--r-lg)",
      overflow: "hidden",
      marginBottom: "12px",
    }}>
      <div style={{
        padding: "12px 14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: `1px solid ${borderColor}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>
          <div>
            <p style={{ fontSize: "13px", fontWeight: 700, color: accentColor }}>{title}</p>
            <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "1px" }}>
              {transactions.length} item{transactions.length > 1 ? "s" : ""} · R$ {fmt(total)}
            </p>
          </div>
        </div>
      </div>
      {transactions.slice(0, 3).map((tx, i) => {
        const cat = categories.find(c => c.id === tx.categoryId);
        return (
          <div
            key={tx.id}
            className="pay-row"
            style={{
              borderBottom: i < Math.min(transactions.length, 3) - 1 ? `1px solid ${borderColor}` : "none",
            }}
          >
            <div
              style={{
                width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
                background: `${cat?.color ?? "#ffffff"}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "15px",
              }}
              onClick={() => onOpen(tx)}
            >
              {cat?.icon ?? <Package size={15} strokeWidth={1.5} color="var(--text-3)" />}
            </div>

            <div
              style={{ flex: 1, minWidth: 0, overflow: "hidden" }}
              onClick={() => onOpen(tx)}
            >
              <p style={{
                fontSize: "13px", fontWeight: 600, color: "var(--text-1)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {tx.description}
              </p>
              <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "1px" }}>
                {cat?.name ?? "—"} · {fmtDate(tx.paymentDate)}
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0, marginLeft: "8px" }}>
              <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)" }}>
                R$ {fmt(tx.amount)}
              </p>
              <button className="pay-btn" onClick={() => onPay(tx)} style={{ fontSize: "11px", padding: "5px 10px", minHeight: "28px", minWidth: "58px" }}>
                Pagar
              </button>
            </div>
          </div>
        );
      })}
      {transactions.length > 3 && (
        <div style={{ padding: "10px 14px", textAlign: "center" }}>
          <p style={{ fontSize: "12px", color: accentColor, fontWeight: 600 }}>
            +{transactions.length - 3} mais
          </p>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
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

  const cardCommitted = useMemo(() =>
    getCardCommittedByMonth(state.installments, selectedMonth),
    [state.installments, selectedMonth]
  );

  const projections = useMemo(() =>
    getMonthlyProjections(state.accounts, state.transactions, 3, state.installments),
    [state.accounts, state.transactions, state.installments]
  );

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

  const name = (state.userName?.trim() || "").split(" ")[0];

  return (
    <>
      <TransactionDrawer
        tx={selectedTx}
        categories={state.categories}
        onClose={() => setSelectedTx(null)}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
        onEdit={tx => { setSelectedTx(null); router.push(`/transacoes/${tx.id}/editar`); }}
      />

      <div
        style={{ padding: "16px", maxWidth: "680px", margin: "0 auto" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >

        {/* ── Header ── */}
        <div className="fade-up-1" style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}>
          <div style={{ minWidth: 0, flex: 1, paddingRight: "12px" }}>
            <p style={{
              fontSize: "18px", fontWeight: 700, color: "var(--text-1)",
              letterSpacing: "-0.02em", lineHeight: 1.2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {name ? `${greeting()}, ${name}` : greeting()}
            </p>
            <p style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "3px" }}>
              {new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
            </p>
          </div>
        </div>

        {/* ── Seletor de Mês ── */}
        <div className="fade-up-1" style={{ marginBottom: "14px" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            padding: "4px",
          }}>
            <button
              onClick={() => setSelectedMonth(m => addMonths(m, -1))}
              style={{
                background: "none", border: "none", color: "var(--text-2)",
                cursor: "pointer", fontSize: "20px",
                padding: "8px 16px", minHeight: "44px", minWidth: "48px",
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "var(--r-sm)",
              }}
              aria-label="Mês anterior"
            >‹</button>

            <div style={{ textAlign: "center", flex: 1 }}>
              <p style={{
                fontSize: "15px", fontWeight: 700, color: "var(--text-1)",
                letterSpacing: "-0.01em",
              }}>
                {fullMonthLabel(selectedMonth)}
              </p>
              {!isCurrentMonth && (
                <button
                  onClick={() => setSelectedMonth(currentMonth())}
                  style={{
                    background: "none", border: "none",
                    color: "var(--accent)", cursor: "pointer",
                    fontSize: "11px", fontWeight: 600, padding: "0",
                    fontFamily: "inherit",
                  }}
                >
                  Ir para hoje
                </button>
              )}
            </div>

            <button
              onClick={() => setSelectedMonth(m => addMonths(m, 1))}
              style={{
                background: "none", border: "none", color: "var(--text-2)",
                cursor: "pointer", fontSize: "20px",
                padding: "8px 16px", minHeight: "44px", minWidth: "48px",
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "var(--r-sm)",
              }}
              aria-label="Próximo mês"
            >›</button>
          </div>
        </div>

        {/* ── Saldo Principal ── */}
        <div
          className="card fade-up-2"
          style={{
            padding: "20px",
            marginBottom: "12px",
            background: "linear-gradient(135deg, #0F1923 0%, #0D1E34 100%)",
            borderColor: "rgba(0,229,160,0.1)",
          }}
        >
          <p style={{
            fontSize: "10px", fontWeight: 700, color: "var(--text-3)",
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px",
          }}>
            Saldo Real
          </p>
          <p
            className="mono"
            style={{
              fontSize: "34px", fontWeight: 700, letterSpacing: "-0.03em",
              color: totalBalance >= 0 ? "var(--text-1)" : "var(--red)",
              lineHeight: 1,
            }}
          >
            R$ {fmt(totalBalance)}
          </p>

          {totalProjected !== totalBalance && (
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              marginTop: "12px", paddingTop: "12px",
              borderTop: "1px solid var(--border)",
            }}>
              <p style={{ fontSize: "11px", color: "var(--text-3)" }}>Projetado:</p>
              <p
                className="mono"
                style={{
                  fontSize: "15px", fontWeight: 700,
                  color: totalProjected >= 0 ? "var(--accent)" : "var(--red)",
                }}
              >
                R$ {fmt(totalProjected)}
              </p>
            </div>
          )}
        </div>

        {/* ── Métricas do Mês ── */}
        <div
          className="fade-up-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          {[
            {
              label: "Receitas",
              value: monthIncome,
              color: "var(--green)",
              icon: "↑",
            },
            {
              label: "Despesas",
              value: monthExpense,
              color: monthExpense > monthIncome ? "var(--red)" : "var(--text-1)",
              icon: "↓",
            },
            {
              label: "Balanço",
              value: monthBalance,
              color: monthBalance >= 0 ? "var(--accent)" : "var(--red)",
              icon: monthBalance >= 0 ? "+" : "",
              prefix: true,
            },
          ].map((m, i) => (
            <div
              key={i}
              className="card"
              style={{ padding: "12px 10px" }}
            >
              <p style={{
                fontSize: "9px", color: "var(--text-3)",
                fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase", marginBottom: "5px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {m.icon} {m.label}
              </p>
              <p
                className="mono"
                style={{
                  fontSize: "13px", fontWeight: 700, color: m.color,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {m.prefix && m.value > 0 ? "+" : ""}
                {Math.abs(m.value) >= 1000
                  ? `${(m.value / 1000).toFixed(1)}k`
                  : fmt(m.value)}
              </p>
            </div>
          ))}
        </div>

        {/* ── Comprometido com Cartão ── */}
        {cardCommitted > 0 && (
          <div
            className="fade-up-3"
            style={{
              background: "rgba(255,184,48,0.07)",
              border: "1px solid var(--amber-20)",
              borderRadius: "var(--r-md)",
              padding: "13px 14px",
              marginBottom: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div>
              <p style={{
                fontSize: "10px", fontWeight: 700, color: "var(--amber)",
                letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "3px",
                display: "flex", alignItems: "center", gap: "6px",
              }}>
                <CreditCard size={12} strokeWidth={1.5} /> Comprometido com Cartão
              </p>
              <p style={{ fontSize: "11px", color: "var(--text-3)" }}>
                {fullMonthLabel(selectedMonth)} · parcelas em aberto
              </p>
            </div>
            <p className="mono" style={{ fontSize: "18px", fontWeight: 700, color: "var(--amber)", flexShrink: 0 }}>
              R$ {fmt(cardCommitted)}
            </p>
          </div>
        )}

        {/* ── Alertas ── */}
        {isCurrentMonth && (
          <div className="fade-up-3">
            <AlertSection
              title="Vencidas"
              icon={<AlertTriangle size={16} strokeWidth={1.5} color="var(--red)" />}
              accentColor="var(--red)"
              bgColor="rgba(255,77,106,0.06)"
              borderColor="var(--red-20)"
              transactions={overdue}
              categories={state.categories}
              onPay={payNow}
              onOpen={tx => setSelectedTx(tx)}
            />
            <AlertSection
              title="Vence esta semana"
              icon={<Bell size={16} strokeWidth={1.5} color="var(--amber)" />}
              accentColor="var(--amber)"
              bgColor="rgba(255,184,48,0.06)"
              borderColor="var(--amber-20)"
              transactions={dueThisWeek}
              categories={state.categories}
              onPay={payNow}
              onOpen={tx => setSelectedTx(tx)}
            />
          </div>
        )}

        {/* ── Faturas de Cartão ── */}
        {cardInvoices.length > 0 && (
          <div className="card fade-up-4" style={{ overflow: "hidden", marginBottom: "12px" }}>
            <div style={{
              padding: "12px 14px 10px",
              borderBottom: "1px solid var(--border)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <p style={{
                fontSize: "11px", fontWeight: 700, color: "var(--text-3)",
                letterSpacing: "0.07em", textTransform: "uppercase",
              }}>
                Faturas de Cartão
              </p>
              <Link href="/cartoes" style={{ fontSize: "11.5px", color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                Ver →
              </Link>
            </div>
            {cardInvoices.map(({ card, invoice }, i) => (
              <div key={card.id} style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "13px 14px",
                borderBottom: i < cardInvoices.length - 1 ? "1px solid var(--border)" : "none",
                overflow: "hidden",
              }}>
                <div style={{
                  width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
                  background: `${card.color}20`,
                  border: `1px solid ${card.color}35`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <CreditCard size={16} strokeWidth={1.5} color={card.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <p style={{
                    fontSize: "13px", fontWeight: 600, color: "var(--text-1)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {card.name}
                  </p>
                  <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                    Vence {fmtDate(invoice.dueDate)} · {invoice.status === "paid" ? "Paga" : invoice.status === "closed" ? "Fechada" : "Em aberto"}
                  </p>
                </div>
                <p
                  className="mono"
                  style={{
                    fontSize: "14px", fontWeight: 700, flexShrink: 0,
                    color: invoice.status === "paid" ? "var(--green)" : "var(--text-1)",
                  }}
                >
                  R$ {fmt(invoice.totalAmount)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── Fluxo de Caixa ── */}
        {isCurrentMonth && projections.some(p => p.projectedIncome > 0 || p.projectedExpense > 0) && (
          <div className="card fade-up-5" style={{ overflow: "hidden", marginBottom: "12px" }}>
            <div style={{
              padding: "12px 14px 10px",
              borderBottom: "1px solid var(--border)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <p style={{
                fontSize: "11px", fontWeight: 700, color: "var(--text-3)",
                letterSpacing: "0.07em", textTransform: "uppercase",
              }}>
                Fluxo de Caixa
              </p>
              <Link href="/relatorios" style={{ fontSize: "11.5px", color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                Relatórios →
              </Link>
            </div>
            {projections.map((p, i) => {
              const riskColor = p.riskLevel === "danger" ? "var(--red)" : p.riskLevel === "warning" ? "var(--amber)" : "var(--green)";
              const isThisMonth = p.month === currentMonth();
              return (
                <div key={p.month} style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr 1fr 1fr",
                  alignItems: "center",
                  padding: "11px 14px",
                  borderBottom: i < projections.length - 1 ? "1px solid var(--border)" : "none",
                  background: isThisMonth ? "rgba(0,229,160,0.04)" : "transparent",
                  gap: "4px",
                }}>
                  <span style={{
                    fontSize: "12px", fontWeight: 700,
                    color: isThisMonth ? "var(--accent)" : "var(--text-2)",
                  }}>
                    {shortMonthLabel(p.month)}
                  </span>
                  <span className="mono" style={{ fontSize: "11px", fontWeight: 600, color: "var(--green)", textAlign: "right" }}>
                    +{p.projectedIncome >= 1000 ? `${(p.projectedIncome / 1000).toFixed(1)}k` : fmt(p.projectedIncome)}
                  </span>
                  <span className="mono" style={{ fontSize: "11px", fontWeight: 600, color: "var(--red)", textAlign: "right" }}>
                    -{p.projectedExpense >= 1000 ? `${(p.projectedExpense / 1000).toFixed(1)}k` : fmt(p.projectedExpense)}
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

        {/* ── Lançamentos ── */}
        <div className="card fade-up-6" style={{ overflow: "hidden" }}>
          <div style={{
            padding: "12px 14px 10px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <p style={{
              fontSize: "11px", fontWeight: 700, color: "var(--text-3)",
              letterSpacing: "0.07em", textTransform: "uppercase",
            }}>
              Lançamentos
            </p>
            <Link href="/transacoes" style={{ fontSize: "11.5px", color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
              Ver todos →
            </Link>
          </div>

          {recentTxs.length === 0 ? (
            <div style={{ padding: "40px 16px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px", color: "var(--text-3)" }}>
                <Wallet size={32} strokeWidth={1.5} />
              </div>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-2)" }}>
                Sem lançamentos
              </p>
              <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                {isCurrentMonth ? "Nenhuma transação neste mês" : `Nenhum em ${fullMonthLabel(selectedMonth)}`}
              </p>
            </div>
          ) : (
            recentTxs.map((tx, i) => {
              const cat = state.categories.find(c => c.id === tx.categoryId);
              return (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "13px 14px",
                    borderTop: "1px solid var(--border)",
                    cursor: "pointer",
                    transition: "background 0.12s",
                    minHeight: "62px",
                    overflow: "hidden",
                  }}
                  onTouchStart={e => e.stopPropagation()}
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
                      maxWidth: "100%",
                    }}>
                      {tx.description}
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                      {cat?.name ?? "—"} · {fmtDate(tx.paymentDate)}
                    </p>
                  </div>

                  <div style={{
                    display: "flex", flexDirection: "column",
                    alignItems: "flex-end", gap: "4px",
                    flexShrink: 0, marginLeft: "4px",
                  }}>
                    <p
                      className="mono"
                      style={{
                        fontSize: "14px", fontWeight: 700,
                        color: tx.type === "income" ? "var(--green)" : "var(--text-1)",
                        whiteSpace: "nowrap",
                      }}
                    >
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
