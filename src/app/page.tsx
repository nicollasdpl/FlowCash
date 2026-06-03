"use client";
import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TransactionDrawer from "@/components/TransactionDrawer";
import { useApp } from "@/context/AppContext";
import type { Transaction } from "@/context/AppContext";
import {
  getCurrentBalance, getProjectedBalance,
  currentMonth, addMonths, fmt, today,
} from "@/engine/financialEngine";
import { computeInvoice } from "@/engine/invoiceEngine";
import { getSpentByCategory } from "@/engine/budgetEngine";
import {
  AlertTriangle, CreditCard, Wallet, TrendingUp, Package, RefreshCw,
  ArrowDown, ArrowUp, ChevronDown, ChevronUp,
} from "lucide-react";
import CategoryIcon from "@/components/CategoryIcon";
import { CategoryDonutSection, buildCatSlices } from "@/components/CategoryDonutSection";

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

function getStatusLabel(type: string, status: string): string {
  if (status === "paid") return type === "income" ? "Recebido" : "Pago";
  if (status === "pending") return type === "income" ? "A receber" : "A pagar";
  return "Vencido";
}

function getStatusStyle(type: string, status: string) {
  if (status === "overdue") return { color: "var(--red)", bg: "var(--red-10)", border: "var(--red-20)" };
  if (status === "paid" && type === "income") return { color: "var(--accent)", bg: "var(--accent-10)", border: "var(--border-accent)" };
  if (status === "paid") return { color: "var(--text-2)", bg: "rgba(255,255,255,0.04)", border: "var(--border)" };
  if (status === "pending" && type === "income") return { color: "#4A9EFF", bg: "rgba(74,158,255,0.1)", border: "rgba(74,158,255,0.2)" };
  return { color: "var(--amber)", bg: "var(--amber-10)", border: "var(--amber-20)" };
}

function StatusBadge({ status, type }: { status: Transaction["status"]; type: Transaction["type"] }) {
  const s = getStatusStyle(type, status);
  return (
    <span className="badge" style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      {getStatusLabel(type, status)}
    </span>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [pendingExpanded, setPendingExpanded] = useState(false);

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

  const todayStr = today();
  const eom = endOfMonth(selectedMonth);
  const isCurrentMonth = selectedMonth === currentMonth();

  const totalBalance = useMemo(() =>
    state.accounts.filter(a => a.active).reduce((s, a) => s + getCurrentBalance(a, state.transactions), 0),
    [state.accounts, state.transactions]
  );

  const totalProjected = useMemo(() =>
    state.accounts.filter(a => a.active).reduce((s, a) => s + getProjectedBalance(a, state.transactions, eom, state.cards, state.installments), 0),
    [state.accounts, state.transactions, state.cards, state.installments, eom]
  );

  const monthTxs = useMemo(() =>
    state.transactions.filter(t => t.paymentDate.startsWith(selectedMonth)),
    [state.transactions, selectedMonth]
  );

  // Receita por CAIXA (estilo Mobills): só conta quando entrou de fato
  // (status "paid" + paymentDate no mês).
  const monthIncome = useMemo(() =>
    state.transactions
      .filter(t => t.type === "income" && t.status === "paid" && t.paymentDate.startsWith(selectedMonth))
      .reduce((s, t) => s + t.amount, 0),
    [state.transactions, selectedMonth]
  );
  // Despesa = MESMA base do donut: getSpentByCategory (competência + parcelas de
  // cartão, exclui "Pagamento de Fatura"). Assim "Despesas" bate com o Total do relatório.
  const monthExpense = useMemo(() =>
    Object.values(
      getSpentByCategory(selectedMonth, state.transactions, state.installments, state.purchases)
    ).reduce((s, v) => s + v, 0),
    [selectedMonth, state.transactions, state.installments, state.purchases]
  );
  const monthBalance = monthIncome - monthExpense;

  // Vencidas: não pagas com data passada (mostradas acima do card Pendentes)
  const overduePending = useMemo(() =>
    state.transactions
      .filter(t =>
        t.status !== "paid" &&
        t.paymentDate < todayStr &&
        t.paymentDate.startsWith(selectedMonth)
      )
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate)),
    [state.transactions, todayStr, selectedMonth]
  );

  // Pendentes: status=pending, data futura/hoje, mês selecionado (inside collapsible)
  const pendingTxs = useMemo(() =>
    state.transactions
      .filter(t =>
        t.status === "pending" &&
        t.paymentDate >= todayStr &&
        t.paymentDate.startsWith(selectedMonth)
      )
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate)),
    [state.transactions, todayStr, selectedMonth]
  );

  const expensePending = useMemo(() => pendingTxs.filter(t => t.type === "expense"), [pendingTxs]);
  const incomePending  = useMemo(() => pendingTxs.filter(t => t.type === "income"), [pendingTxs]);
  const totalExpensePending = useMemo(() => expensePending.reduce((s, t) => s + t.amount, 0), [expensePending]);
  const totalIncomePending  = useMemo(() => incomePending.reduce((s, t) => s + t.amount, 0), [incomePending]);

  // Exibição por cartão, em função do mês selecionado:
  //   1) Sempre a fatura cujo VENCIMENTO cai no selectedMonth (open→"open"; closed/overdue→"due").
  //   2) Só no mês atual: TAMBÉM faturas closed/overdue de meses anteriores (alerta de atraso) → "due".
  //   3) Em outros meses: apenas a do item 1.
  // "paid" nunca entra (computeInvoice só devolve "paid" com tudo pago).
  const cardInvoices = useMemo(() => {
    const cm = currentMonth();
    return state.cards.filter(c => c.active).flatMap(card => {
      const months = [...new Set(
        state.installments
          .filter(i => i.cardId === card.id)
          .map(i => i.competenceMonth),
      )].sort(); // crescente (YYYY-MM)
      const invoices = months.map(m => computeInvoice(card, state.installments, m));

      // 1. Fatura que vence no mês selecionado (ignora paga).
      const ofMonth = invoices.find(
        inv => inv.dueDate.substring(0, 7) === selectedMonth && inv.status !== "paid",
      );

      // 2. No mês atual: atrasos (closed/overdue) de meses anteriores, fora a do item 1.
      const overdueAlerts = selectedMonth === cm
        ? invoices.filter(inv =>
            (inv.status === "closed" || inv.status === "overdue") &&
            inv.dueDate.substring(0, 7) < cm &&
            inv.competenceMonth !== ofMonth?.competenceMonth)
        : [];

      return [
        ...(ofMonth
          ? [{ card, invoice: ofMonth, kind: (ofMonth.status === "open" ? "open" : "due") as "due" | "open" }]
          : []),
        ...overdueAlerts.map(inv => ({ card, invoice: inv, kind: "due" as const })),
      ];
    });
  }, [state.cards, state.installments, selectedMonth]);

  // Donut: despesas pagas + parcelas do mês selecionado
  const catSlices = useMemo(() =>
    buildCatSlices(
      state.transactions,
      state.installments,
      state.purchases,
      state.categories,
      selectedMonth,
    ),
    [state.transactions, state.installments, state.purchases, state.categories, selectedMonth]
  );

  // Máximo 3 lançamentos recentes
  const recentTxs = useMemo(() =>
    [...monthTxs]
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
      .slice(0, 3),
    [monthTxs]
  );

  function payNow(tx: Transaction) {
    dispatch({ type: "UPD_TX", payload: { ...tx, status: "paid", paymentDate: todayStr } });
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

  // Linha de item pendente (usado no card expandido e nos vencidos)
  function PendingRow({ tx, isFirst, accentColor }: { tx: Transaction; isFirst: boolean; accentColor?: string }) {
    const cat = state.categories.find(c => c.id === tx.categoryId);
    const isExpense = tx.type === "expense";
    return (
      <div
        style={{
          display: "flex", alignItems: "center", gap: "12px",
          padding: "12px 14px",
          borderTop: isFirst ? "none" : "1px solid var(--border)",
        }}
      >
        <div
          onClick={() => setSelectedTx(tx)}
          style={{
            width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
            background: cat ? `${cat.color}18` : "rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          {cat?.icon
            ? <CategoryIcon icon={cat.icon} color={cat.color} size={15} />
            : <Package size={15} strokeWidth={1.5} color="var(--text-3)" />}
        </div>

        <div
          onClick={() => setSelectedTx(tx)}
          style={{ flex: 1, minWidth: 0, overflow: "hidden", cursor: "pointer" }}
        >
          <p style={{
            fontSize: "13px", fontWeight: 600, color: "var(--text-1)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {tx.description}
          </p>
          <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
            {fmtDate(tx.paymentDate)}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0 }}>
          <p className="mono" style={{
            fontSize: "13px", fontWeight: 700,
            color: accentColor ?? "var(--text-1)",
          }}>
            R$ {fmt(tx.amount)}
          </p>
          <button
            onClick={() => payNow(tx)}
            style={{
              padding: "5px 10px", minHeight: "28px", minWidth: "60px",
              background: isExpense ? "rgba(255,77,106,0.1)" : "var(--accent-10)",
              color: isExpense ? "var(--red)" : "var(--accent)",
              border: `1px solid ${isExpense ? "var(--red-20)" : "var(--border-accent)"}`,
              borderRadius: "8px", fontSize: "11px", fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              touchAction: "manipulation",
            }}
          >
            {isExpense ? "Pagar" : "Receber"}
          </button>
        </div>
      </div>
    );
  }

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

        {/* ── 1. Saudação + data ── */}
        <div className="fade-up-1" style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: "16px",
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
          <button
            className="btn-primary"
            onClick={() => router.push("/transacoes/nova")}
            style={{
              fontSize: "24px", padding: "0",
              width: "44px", height: "44px",
              borderRadius: "13px", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >+</button>
        </div>

        {/* ── 2. Navegação de mês ── */}
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

        {/* ── 3. Saldo Real ── */}
        <div
          className="card fade-up-2"
          onClick={() => router.push("/contas")}
          style={{
            padding: "20px", marginBottom: "12px",
            background: "linear-gradient(135deg, #0F1923 0%, #0D1E34 100%)",
            borderColor: "rgba(0,229,160,0.1)",
            cursor: "pointer",
          }}
        >
          <p style={{
            fontSize: "10px", fontWeight: 700, color: "var(--text-3)",
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px",
          }}>
            Saldo Real
          </p>
          <p className="mono" style={{
            fontSize: "34px", fontWeight: 700, letterSpacing: "-0.03em",
            color: totalBalance >= 0 ? "var(--text-1)" : "var(--red)",
            lineHeight: 1,
          }}>
            R$ {fmt(totalBalance)}
          </p>

          {totalProjected !== totalBalance && (
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              marginTop: "12px", paddingTop: "12px",
              borderTop: "1px solid var(--border)",
            }}>
              <p style={{ fontSize: "11px", color: "var(--text-3)" }}>Projetado:</p>
              <p className="mono" style={{
                fontSize: "15px", fontWeight: 700,
                color: totalProjected >= 0 ? "var(--accent)" : "var(--red)",
              }}>
                R$ {fmt(totalProjected)}
              </p>
            </div>
          )}
        </div>

        {/* ── 4. Receitas / Despesas / Balanço ── */}
        <div className="fade-up-2" style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: "8px", marginBottom: "14px",
        }}>
          {[
            { label: "Receitas", value: monthIncome, color: "var(--green)", icon: "↑", href: "/transacoes?tipo=income" },
            { label: "Despesas", value: monthExpense, color: monthExpense > monthIncome ? "var(--red)" : "var(--text-1)", icon: "↓", href: "/transacoes?tipo=expense" },
            { label: "Balanço", value: monthBalance, color: monthBalance >= 0 ? "var(--accent)" : "var(--red)", icon: monthBalance >= 0 ? "+" : "", prefix: true, href: null },
          ].map((m, i) => (
            <div
              key={i}
              className="card"
              onClick={m.href ? () => router.push(m.href!) : undefined}
              style={{ padding: "12px 10px", cursor: m.href ? "pointer" : "default" }}
            >
              <p style={{
                fontSize: "9px", color: "var(--text-3)",
                fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase", marginBottom: "5px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {m.icon} {m.label}
              </p>
              <p className="mono" style={{
                fontSize: "13px", fontWeight: 700, color: m.color,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {m.prefix && m.value > 0 ? "+" : ""}
                {Math.abs(m.value) >= 1000
                  ? `${(m.value / 1000).toFixed(1)}k`
                  : fmt(m.value)}
              </p>
            </div>
          ))}
        </div>

        {/* ── 5. Vencidas — acima do card Pendentes ── */}
        {overduePending.length > 0 && (
          <div className="fade-up-3" style={{
            background: "rgba(255,77,106,0.06)",
            border: "1px solid var(--red-20)",
            borderRadius: "var(--r-lg)",
            overflow: "hidden",
            marginBottom: "10px",
          }}>
            <div style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--red-20)",
              display: "flex", alignItems: "center", gap: "8px",
            }}>
              <AlertTriangle size={13} strokeWidth={1.5} color="var(--red)" />
              <p style={{
                fontSize: "11px", fontWeight: 700, color: "var(--red)",
                letterSpacing: "0.07em", textTransform: "uppercase",
              }}>
                Vencidas
              </p>
              <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--red)", opacity: 0.7 }}>
                {overduePending.length} item{overduePending.length > 1 ? "s" : ""}
              </span>
            </div>
            {overduePending.map((tx, i) => {
              const cat = state.categories.find(c => c.id === tx.categoryId);
              return (
                <div
                  key={tx.id}
                  style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "12px 14px",
                    borderTop: i > 0 ? "1px solid var(--red-20)" : "none",
                  }}
                >
                  <div
                    onClick={() => setSelectedTx(tx)}
                    style={{
                      width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
                      background: cat ? `${cat.color}18` : "rgba(255,77,106,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    {cat?.icon
                      ? <CategoryIcon icon={cat.icon} color={cat.color} size={15} />
                      : <Package size={15} strokeWidth={1.5} color="var(--red)" />}
                  </div>

                  <div
                    onClick={() => setSelectedTx(tx)}
                    style={{ flex: 1, minWidth: 0, overflow: "hidden", cursor: "pointer" }}
                  >
                    <p style={{
                      fontSize: "13px", fontWeight: 600, color: "var(--text-1)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {tx.description}
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--red)", marginTop: "2px" }}>
                      Venceu {fmtDate(tx.paymentDate)}
                    </p>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0 }}>
                    <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--red)" }}>
                      R$ {fmt(tx.amount)}
                    </p>
                    <button
                      onClick={() => payNow(tx)}
                      style={{
                        padding: "5px 10px", minHeight: "28px", minWidth: "60px",
                        background: "rgba(255,77,106,0.12)",
                        color: "var(--red)",
                        border: "1px solid var(--red-20)",
                        borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                        touchAction: "manipulation",
                      }}
                    >
                      Pagar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── 6. Pendentes (collapsível) ── */}
        {pendingTxs.length > 0 && (
          <div className="card fade-up-3" style={{ overflow: "hidden", marginBottom: "12px" }}>

            {/* Header — clicável */}
            <div
              onClick={() => setPendingExpanded(e => !e)}
              style={{
                padding: "12px 14px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                cursor: "pointer",
                borderBottom: pendingExpanded ? "1px solid var(--border)" : "none",
              }}
            >
              <p style={{
                fontSize: "11px", fontWeight: 700, color: "var(--text-3)",
                letterSpacing: "0.07em", textTransform: "uppercase",
              }}>
                Pendentes
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
                  {pendingTxs.length} item{pendingTxs.length > 1 ? "s" : ""}
                </span>
                {pendingExpanded
                  ? <ChevronUp size={15} strokeWidth={1.5} color="var(--text-3)" />
                  : <ChevronDown size={15} strokeWidth={1.5} color="var(--text-3)" />
                }
              </div>
            </div>

            {/* Resumo colapsado */}
            {!pendingExpanded && (
              <div
                onClick={() => setPendingExpanded(true)}
                style={{ padding: "10px 14px", cursor: "pointer" }}
              >
                {expensePending.length > 0 && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: "7px",
                    marginBottom: incomePending.length > 0 ? "7px" : "0",
                  }}>
                    <ArrowDown size={12} strokeWidth={1.5} color="var(--red)" />
                    <span style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 500 }}>
                      {expensePending.length} a pagar
                    </span>
                    <span className="mono" style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 700, color: "var(--red)" }}>
                      R$ {fmt(totalExpensePending)}
                    </span>
                  </div>
                )}
                {incomePending.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                    <ArrowUp size={12} strokeWidth={1.5} color="var(--accent)" />
                    <span style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 500 }}>
                      {incomePending.length} a receber
                    </span>
                    <span className="mono" style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 700, color: "var(--accent)" }}>
                      R$ {fmt(totalIncomePending)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Lista expandida */}
            {pendingExpanded && (
              <>
                {expensePending.length > 0 && (
                  <>
                    <div style={{
                      padding: "7px 14px",
                      background: "rgba(255,77,106,0.04)",
                      borderBottom: "1px solid var(--border)",
                      display: "flex", alignItems: "center", gap: "6px",
                    }}>
                      <ArrowDown size={11} strokeWidth={1.5} color="var(--red)" />
                      <span style={{
                        fontSize: "10px", fontWeight: 700, color: "var(--red)",
                        letterSpacing: "0.07em", textTransform: "uppercase",
                      }}>
                        A pagar
                      </span>
                      <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-3)" }}>
                        R$ {fmt(totalExpensePending)}
                      </span>
                    </div>
                    {expensePending.map((tx, i) => (
                      <PendingRow key={tx.id} tx={tx} isFirst={i === 0} accentColor="var(--text-1)" />
                    ))}
                  </>
                )}

                {incomePending.length > 0 && (
                  <>
                    <div style={{
                      padding: "7px 14px",
                      background: "rgba(0,229,160,0.04)",
                      borderBottom: "1px solid var(--border)",
                      borderTop: expensePending.length > 0 ? "1px solid var(--border)" : "none",
                      display: "flex", alignItems: "center", gap: "6px",
                    }}>
                      <ArrowUp size={11} strokeWidth={1.5} color="var(--accent)" />
                      <span style={{
                        fontSize: "10px", fontWeight: 700, color: "var(--accent)",
                        letterSpacing: "0.07em", textTransform: "uppercase",
                      }}>
                        A receber
                      </span>
                      <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-3)" }}>
                        R$ {fmt(totalIncomePending)}
                      </span>
                    </div>
                    {incomePending.map((tx, i) => (
                      <PendingRow key={tx.id} tx={tx} isFirst={i === 0} accentColor="var(--accent)" />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 7. Faturas de Cartão ── */}
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
            {cardInvoices.map(({ card, invoice, kind }, i) => {
              const isDue = kind === "due";
              const labelText   = isDue ? "A pagar" : "Em andamento";
              const labelColor  = isDue ? (invoice.status === "overdue" ? "var(--red)" : "var(--amber)") : "var(--text-3)";
              const labelBg     = isDue ? (invoice.status === "overdue" ? "var(--red-10)" : "var(--amber-10)") : "rgba(255,255,255,0.04)";
              const labelBorder = isDue ? (invoice.status === "overdue" ? "var(--red-20)" : "var(--amber-20)") : "var(--border)";
              return (
                <div
                  key={`${card.id}-${invoice.competenceMonth}`}
                  onClick={() => router.push(`/cartoes/${card.id}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "13px 14px",
                    borderBottom: i < cardInvoices.length - 1 ? "1px solid var(--border)" : "none",
                    cursor: "pointer",
                    overflow: "hidden",
                  }}
                >
                  <div style={{
                    width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
                    background: `${card.color}20`,
                    border: `1px solid ${card.color}35`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <CreditCard size={16} strokeWidth={1.5} color={card.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
                      <p style={{
                        fontSize: "13px", fontWeight: 600, color: "var(--text-1)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {card.name}
                      </p>
                      <span style={{
                        flexShrink: 0,
                        fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.04em",
                        textTransform: "uppercase", padding: "2px 6px", borderRadius: "5px",
                        color: labelColor, background: labelBg, border: `1px solid ${labelBorder}`,
                      }}>
                        {labelText}
                      </span>
                    </div>
                    <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                      {`Fatura ${fullMonthLabel(invoice.dueDate.substring(0, 7))} · Vence ${fmtDate(invoice.dueDate)}`}
                    </p>
                  </div>
                  <p className="mono" style={{
                    fontSize: "14px", fontWeight: 700, flexShrink: 0,
                    color: isDue && invoice.status === "overdue" ? "var(--red)" : "var(--text-1)",
                  }}>
                    R$ {fmt(invoice.totalAmount)}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* ── 8. Gastos por Categoria (donut) ── */}
        {catSlices.length > 0 && (
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
                Gastos por Categoria
              </p>
              <Link href="/relatorios" style={{ fontSize: "11.5px", color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                Relatórios →
              </Link>
            </div>
            <CategoryDonutSection key={selectedMonth} slices={catSlices} />
          </div>
        )}

        {/* ── 9. Lançamentos recentes (máx 3) ── */}
        <div className="card fade-up-6" style={{ overflow: "hidden", marginBottom: "16px" }}>
          <div style={{
            padding: "12px 14px 10px",
            borderBottom: "1px solid var(--border)",
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
            <>
              {recentTxs.map(tx => {
                const cat = state.categories.find(c => c.id === tx.categoryId);
                return (
                  <div
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "13px 14px",
                      borderTop: "1px solid var(--border)",
                      cursor: "pointer",
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
                      <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px", display: "flex", alignItems: "center", gap: "3px" }}>
                        {cat?.name ?? "—"} · {fmtDate(tx.paymentDate)}
                        {tx.isRecurring && <RefreshCw size={9} strokeWidth={1.5} />}
                      </p>
                    </div>

                    <div style={{
                      display: "flex", flexDirection: "column",
                      alignItems: "flex-end", gap: "4px",
                      flexShrink: 0, marginLeft: "4px",
                    }}>
                      <p className="mono" style={{
                        fontSize: "14px", fontWeight: 700,
                        color: tx.type === "income" ? "var(--green)" : "var(--text-1)",
                        whiteSpace: "nowrap",
                      }}>
                        {tx.type === "income" ? "+" : "-"}R$ {fmt(tx.amount)}
                      </p>
                      <StatusBadge status={tx.status} type={tx.type} />
                    </div>
                  </div>
                );
              })}

              {monthTxs.length > 3 && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "12px 14px" }}>
                  <button
                    onClick={() => router.push("/transacoes")}
                    style={{
                      width: "100%", padding: "10px",
                      background: "transparent", border: "1px solid var(--border)",
                      borderRadius: "var(--r-sm)", color: "var(--text-2)",
                      fontSize: "12px", fontWeight: 600, cursor: "pointer",
                      fontFamily: "inherit", minHeight: "40px",
                    }}
                  >
                    Ver todos os lançamentos ({monthTxs.length})
                  </button>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </>
  );
}
