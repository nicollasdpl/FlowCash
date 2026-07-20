"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { currentMonth, addMonths, fmt, today, getProjectedBalance, isBalanceNegative, isBalancePositive } from "@/engine/financialEngine";
import { getSpentByCategory } from "@/engine/budgetEngine";
import { Search, TrendingUp, Package, RefreshCw, Pencil, Trash2, SlidersHorizontal, X, ArrowLeftRight } from "lucide-react";
import CategoryIcon from "@/components/CategoryIcon";
import type { Transaction, TransactionType } from "@/types/financial";

const PAGE_SIZE = 30;

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function fullMonthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function endOfMonth(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  const last = new Date(y, m, 0);
  return `${yyyymm}-${String(last.getDate()).padStart(2, "0")}`;
}

function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayGroupLabel(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return "Hoje";
  if (dateStr === addDays(todayStr, -1)) return "Ontem";
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${wd}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

type FilterKey = "Todos" | "A pagar" | "Pago" | "Vencido" | "Receitas";
const FILTERS: FilterKey[] = ["Todos", "A pagar", "Pago", "Vencido", "Receitas"];

const TYPE_OPTIONS: { value: "" | TransactionType; label: string }[] = [
  { value: "", label: "Todos os tipos" },
  { value: "income", label: "Receitas" },
  { value: "expense", label: "Despesas" },
  { value: "transfer", label: "Transferências" },
];

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

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  color: "var(--text-1)",
  fontSize: "13px",
  fontFamily: "inherit",
  fontWeight: 500,
  minHeight: "44px",
  appearance: "none",
  WebkitAppearance: "none",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  color: "var(--text-1)",
  fontSize: "13px",
  fontFamily: "inherit",
  fontWeight: 500,
  minHeight: "44px",
};

export default function Transacoes() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const todayStr = today();

  const [filter, setFilter] = useState<FilterKey>("Todos");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | TransactionType>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const hasCustomPeriod = Boolean(dateFrom || dateTo);
  const advancedFilterCount = [categoryId, accountId, typeFilter, dateFrom, dateTo].filter(Boolean).length;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, filter, selectedMonth, categoryId, accountId, typeFilter, dateFrom, dateTo]);

  const summaryBase = useMemo(() =>
    state.transactions.filter(t => t.competenceDate.startsWith(selectedMonth)),
    [state.transactions, selectedMonth]
  );

  // Mesma regra do dashboard: receita por caixa (pago + paymentDate),
  // sem Empréstimo/Reembolso (excludeFromReports).
  const excludedReportCatIds = useMemo(
    () => new Set(state.categories.filter(c => c.excludeFromReports).map(c => c.id)),
    [state.categories],
  );

  const income = useMemo(
    () =>
      state.transactions
        .filter(
          t =>
            t.type === "income" &&
            t.status === "paid" &&
            t.paymentDate.startsWith(selectedMonth) &&
            !excludedReportCatIds.has(t.categoryId),
        )
        .reduce((s, t) => s + t.amount, 0),
    [state.transactions, selectedMonth, excludedReportCatIds],
  );

  // Mesma base do dashboard/donut: competência + parcelas de cartão.
  const expense = useMemo(
    () =>
      Object.values(
        getSpentByCategory(
          selectedMonth,
          state.transactions,
          state.installments,
          state.purchases,
        ),
      ).reduce((s, v) => s + v, 0),
    [selectedMonth, state.transactions, state.installments, state.purchases],
  );

  const monthBalance = income - expense;

  const totalProjected = useMemo(() => {
    const eom = endOfMonth(selectedMonth);
    return state.accounts
      .filter(a => a.active)
      .reduce(
        (s, a) => s + getProjectedBalance(a, state.transactions, eom, state.cards, state.installments),
        0,
      );
  }, [state.accounts, state.transactions, state.cards, state.installments, selectedMonth]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of state.categories) map.set(c.id, c.name);
    return map;
  }, [state.categories]);

  const filtered = useMemo(() => {
    let txs = hasCustomPeriod
      ? [...state.transactions]
      : [...summaryBase];

    if (hasCustomPeriod) {
      if (dateFrom) txs = txs.filter(t => t.paymentDate >= dateFrom);
      if (dateTo) txs = txs.filter(t => t.paymentDate <= dateTo);
    }

    if (filter === "A pagar") txs = txs.filter(t => t.status === "pending");
    else if (filter === "Pago") txs = txs.filter(t => t.status === "paid");
    else if (filter === "Vencido") txs = txs.filter(t => t.status === "overdue");
    else if (filter === "Receitas") txs = txs.filter(t => t.type === "income");

    if (categoryId) txs = txs.filter(t => t.categoryId === categoryId);
    if (accountId) txs = txs.filter(t => t.accountId === accountId || t.transferToAccountId === accountId);
    if (typeFilter) txs = txs.filter(t => t.type === typeFilter);

    const q = search.trim().toLowerCase();
    if (q) {
      txs = txs.filter(t => {
        const catName = categoryMap.get(t.categoryId) ?? "";
        const accountName = state.accounts.find(a => a.id === t.accountId)?.name ?? "";
        const haystack = [t.description, catName, accountName, t.notes ?? ""].join(" ").toLowerCase();
        return haystack.includes(q);
      });
    }

    return txs.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [
    summaryBase, state.transactions, state.accounts, categoryMap,
    filter, search, categoryId, accountId, typeFilter, dateFrom, dateTo, hasCustomPeriod,
  ]);

  const visibleTxs = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const grouped = useMemo(() => {
    const groups: { date: string; txs: Transaction[] }[] = [];
    const seen = new Set<string>();
    for (const tx of visibleTxs) {
      if (!seen.has(tx.paymentDate)) {
        seen.add(tx.paymentDate);
        groups.push({ date: tx.paymentDate, txs: [] });
      }
      groups.find(g => g.date === tx.paymentDate)!.txs.push(tx);
    }
    return groups;
  }, [visibleTxs]);

  const hasMore = visibleCount < filtered.length;

  function clearAdvancedFilters() {
    setCategoryId("");
    setAccountId("");
    setTypeFilter("");
    setDateFrom("");
    setDateTo("");
  }

  function daySubtotal(txs: Transaction[]) {
    let net = 0;
    for (const t of txs) {
      if (t.type === "income") net += t.amount;
      else if (t.type === "expense") net -= t.amount;
    }
    return net;
  }

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

      {/* ── Busca ── */}
      <div className="fade-up-1" style={{ marginBottom: "12px", position: "relative" }}>
        <Search
          size={16} strokeWidth={1.5}
          style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }}
        />
        <input
          type="search"
          placeholder="Buscar por descrição, categoria ou nota..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            ...inputStyle,
            paddingLeft: "40px",
            paddingRight: search ? "40px" : "12px",
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{
              position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "var(--text-3)",
              cursor: "pointer", padding: "6px", display: "flex", alignItems: "center",
            }}
            aria-label="Limpar busca"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* ── Seletor de Mês ── */}
      <div className="fade-up-1" style={{ marginBottom: "14px" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", padding: "4px",
          opacity: hasCustomPeriod ? 0.5 : 1,
        }}>
          <button
            onClick={() => setSelectedMonth(m => addMonths(m, -1))}
            disabled={hasCustomPeriod}
            style={{
              background: "none", border: "none", color: "var(--text-2)",
              cursor: hasCustomPeriod ? "default" : "pointer", fontSize: "20px",
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
            disabled={hasCustomPeriod}
            style={{
              background: "none", border: "none", color: "var(--text-2)",
              cursor: hasCustomPeriod ? "default" : "pointer", fontSize: "20px",
              padding: "8px 16px", minHeight: "44px", minWidth: "48px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >›</button>
        </div>
        {hasCustomPeriod && (
          <p style={{ fontSize: "11px", color: "var(--text-3)", textAlign: "center", marginTop: "6px" }}>
            Período customizado ativo — resumo permanece no mês selecionado
          </p>
        )}
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
        <div
          className="card"
          style={{
            padding: "13px 14px",
            background: isBalanceNegative(monthBalance) ? "var(--red-10)" : "var(--accent-10)",
            borderColor: isBalanceNegative(monthBalance) ? "var(--red-20)" : "var(--border-accent)",
          }}
        >
          <p style={{
            fontSize: "10px",
            color: isBalanceNegative(monthBalance) ? "var(--red)" : isBalancePositive(monthBalance) ? "var(--accent)" : "var(--text-2)",
            fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            marginBottom: "4px",
          }}>
            Balanço
          </p>
          <p className="mono" style={{
            fontSize: "17px", fontWeight: 700,
            color: isBalanceNegative(monthBalance) ? "var(--red)" : isBalancePositive(monthBalance) ? "var(--green)" : "var(--text-2)",
          }}>
            {isBalanceNegative(monthBalance) ? "−" : ""}R$ {fmt(Math.abs(monthBalance))}
          </p>
        </div>
        <div
          className="card"
          style={{
            padding: "13px 14px",
            background: isBalanceNegative(totalProjected) ? "var(--red-10)" : "var(--accent-10)",
            borderColor: isBalanceNegative(totalProjected) ? "var(--red-20)" : "var(--border-accent)",
          }}
        >
          <p style={{
            fontSize: "10px",
            color: isBalanceNegative(totalProjected) ? "var(--red)" : isBalancePositive(totalProjected) ? "var(--accent)" : "var(--text-2)",
            fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            marginBottom: "4px",
          }}>
            Projetado
          </p>
          <p className="mono" style={{
            fontSize: "17px", fontWeight: 700,
            color: isBalanceNegative(totalProjected) ? "var(--red)" : isBalancePositive(totalProjected) ? "var(--green)" : "var(--text-2)",
          }}>
            {isBalanceNegative(totalProjected) ? "−" : ""}R$ {fmt(Math.abs(totalProjected))}
          </p>
        </div>
      </div>

      {/* ── Filtros de status + avançados ── */}
      <div className="fade-up-3" style={{ marginBottom: "12px" }}>
        <div style={{
          display: "flex", gap: "7px", alignItems: "center",
          overflowX: "auto", paddingBottom: "4px",
          WebkitOverflowScrolling: "touch",
          msOverflowStyle: "none",
          scrollbarWidth: "none",
          touchAction: "pan-x",
        }}>
          {FILTERS.map(f => (
            <button
              key={f}
              className={`filter-btn${filter === f ? " active" : ""}`}
              onClick={() => setFilter(f)}
            >{f}</button>
          ))}
          <button
            className={`filter-btn${filtersOpen || advancedFilterCount > 0 ? " active" : ""}`}
            onClick={() => setFiltersOpen(o => !o)}
            style={{ display: "flex", alignItems: "center", gap: "5px" }}
          >
            <SlidersHorizontal size={13} strokeWidth={1.5} />
            Filtros
            {advancedFilterCount > 0 && (
              <span style={{
                background: "var(--accent)", color: "var(--bg)",
                borderRadius: "10px", fontSize: "10px", fontWeight: 700,
                minWidth: "16px", height: "16px", display: "flex",
                alignItems: "center", justifyContent: "center", padding: "0 4px",
              }}>
                {advancedFilterCount}
              </span>
            )}
          </button>
        </div>

        {filtersOpen && (
          <div className="card" style={{ marginTop: "10px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "5px" }}>
                  Categoria
                </label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={selectStyle}>
                  <option value="">Todas</option>
                  {state.categories.filter(c => !c.isSystem).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "5px" }}>
                  Conta
                </label>
                <select value={accountId} onChange={e => setAccountId(e.target.value)} style={selectStyle}>
                  <option value="">Todas</option>
                  {state.accounts.filter(a => a.active).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "5px" }}>
                Tipo
              </label>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as "" | TransactionType)}
                style={selectStyle}
              >
                {TYPE_OPTIONS.map(o => (
                  <option key={o.value || "all"} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "5px" }}>
                  De
                </label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "5px" }}>
                  Até
                </label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
              </div>
            </div>

            {advancedFilterCount > 0 && (
              <button
                onClick={clearAdvancedFilters}
                style={{
                  background: "none", border: "none", color: "var(--accent)",
                  fontSize: "12px", fontWeight: 600, cursor: "pointer",
                  fontFamily: "inherit", padding: "4px 0", textAlign: "left",
                }}
              >
                Limpar filtros avançados
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Lista agrupada por dia ── */}
      <div className="fade-up-4">
        {filtered.length === 0 ? (
          <div className="card" style={{ padding: "48px 16px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px", color: "var(--text-3)" }}>
              <Search size={32} strokeWidth={1.5} />
            </div>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-2)" }}>
              Nenhuma transação
            </p>
            <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
              {search || filter !== "Todos" || advancedFilterCount > 0
                ? "Tente ajustar a busca ou os filtros"
                : `Sem lançamentos em ${fullMonthLabel(selectedMonth)}`}
            </p>
          </div>
        ) : (
          <>
            <div style={{ padding: "0 2px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 600 }}>
                {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
              </span>
              {visibleTxs.length < filtered.length && (
                <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
                  Exibindo {visibleTxs.length}
                </span>
              )}
            </div>

            {grouped.map(group => {
              const net = daySubtotal(group.txs);
              return (
                <div key={group.date} style={{ marginBottom: "12px" }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "6px 4px 8px",
                  }}>
                    <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-2)", letterSpacing: "0.02em" }}>
                      {dayGroupLabel(group.date, todayStr)}
                    </p>
                    <p className="mono" style={{
                      fontSize: "11px", fontWeight: 600,
                      color: isBalanceNegative(net) ? "var(--red)" : isBalancePositive(net) ? "var(--green)" : "var(--text-2)",
                    }}>
                      {isBalancePositive(net) ? "+" : isBalanceNegative(net) ? "−" : ""}R$ {fmt(Math.abs(net))}
                    </p>
                  </div>

                  <div className="card" style={{ overflow: "hidden" }}>
                    {group.txs.map((tx, idx) => {
                      const cat = state.categories.find(c => c.id === tx.categoryId);
                      const account = state.accounts.find(a => a.id === tx.accountId);
                      const sStyle = getStatusStyle(tx.type, tx.status);
                      const menuOpen = openMenuId === tx.id;
                      return (
                        <div key={tx.id} style={{ borderTop: idx > 0 ? "1px solid var(--border)" : "none" }}>
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
                            }}>
                              {cat?.icon
                                ? <CategoryIcon icon={cat.icon} color={cat.color} size={17} />
                                : tx.type === "income"
                                  ? <TrendingUp size={17} strokeWidth={1.5} color="var(--green)" />
                                  : tx.type === "transfer"
                                    ? <ArrowLeftRight size={17} strokeWidth={1.5} color="var(--blue)" />
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
                                {cat?.name ?? "—"} · {account?.name ?? "—"}
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
                                color: tx.type === "income" ? "var(--green)" : tx.type === "transfer" ? "var(--blue)" : "var(--text-1)",
                              }}>
                                {tx.type === "income" ? "+" : tx.type === "transfer" ? "" : "−"}R$ {fmt(tx.amount)}
                              </p>
                              <span className="badge" style={{ color: sStyle.color, background: sStyle.bg, border: `1px solid ${sStyle.border}` }}>
                                {getStatusLabel(tx.type, tx.status)}
                              </span>
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
                  </div>
                </div>
              );
            })}

            {hasMore && (
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                style={{
                  width: "100%", padding: "14px", marginTop: "4px",
                  borderRadius: "var(--r-lg)", border: "1px solid var(--border)",
                  background: "var(--bg-card)", color: "var(--text-1)",
                  fontSize: "13px", fontWeight: 600, cursor: "pointer",
                  fontFamily: "inherit", minHeight: "48px",
                  touchAction: "manipulation",
                }}
              >
                Carregar mais ({Math.min(PAGE_SIZE, filtered.length - visibleCount)} de {filtered.length - visibleCount} restantes)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
