"use client";
import { useEffect, useMemo, useState } from "react";
import type { Transaction, CardInstallment, CardPurchase, Category } from "@/types/financial";
import { fmt } from "@/engine/financialEngine";
import {
  buildDailySpendingMap,
  getCalendarGrid,
  heatAlpha,
  type SpendingCalendarMode,
  type DaySpending,
  type DaySpendingItem,
} from "@/engine/spendingCalendarEngine";
import { CreditCard, Package, TrendingDown, TrendingUp } from "lucide-react";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "short", day: "numeric", month: "short",
  });
}

/** Valor curto para caber na célula (ex.: 1,2k / −80 / +500). */
function fmtCell(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : amount > 0 ? "+" : "";
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1).replace(".", ",")}k`;
  if (abs >= 100) return `${sign}${Math.round(abs)}`;
  if (abs === 0) return "0";
  return `${sign}${abs.toFixed(0)}`;
}

function cellDisplayAmount(day: DaySpending | undefined): number {
  if (!day) return 0;
  if (day.incomeTotal > 0 && day.expenseTotal > 0) return day.net;
  if (day.incomeTotal > 0) return day.incomeTotal;
  return -day.expenseTotal;
}

function heatRgb(net: number, onlyIncome: boolean, onlyExpense: boolean): string {
  if (onlyIncome || net > 0) return "16, 185, 129"; // green
  if (onlyExpense || net < 0) return "255, 77, 106"; // red
  return "255, 255, 255";
}

export default function SpendingHeatmapCalendar({
  month,
  transactions,
  installments,
  purchases,
  categories = [],
  categoryId,
  heatColor,
  compact = false,
  onDaySelect,
}: {
  month: string;
  transactions: Transaction[];
  installments: CardInstallment[];
  purchases: CardPurchase[];
  categories?: Pick<Category, "id" | "name" | "color" | "excludeFromReports">[];
  /** Filtra só despesas desta categoria (mini-calendário). */
  categoryId?: string;
  /** Cor base do calor quando filtrado por categoria (hex). */
  heatColor?: string;
  compact?: boolean;
  onDaySelect?: (date: string | null) => void;
}) {
  const [mode, setMode] = useState<SpendingCalendarMode>("competence");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDate(null);
  }, [month, categoryId]);

  const dailyMap = useMemo(
    () => buildDailySpendingMap(month, transactions, installments, purchases, mode, {
      categories,
      categoryId,
    }),
    [month, transactions, installments, purchases, mode, categories, categoryId],
  );

  const grid = useMemo(() => getCalendarGrid(month), [month]);

  const maxAbsNet = useMemo(
    () => Math.max(0, ...Object.values(dailyMap).map(d => Math.abs(d.net || d.expenseTotal || d.incomeTotal))),
    [dailyMap],
  );

  const monthExpense = useMemo(
    () => Object.values(dailyMap).reduce((s, d) => s + d.expenseTotal, 0),
    [dailyMap],
  );
  const monthIncome = useMemo(
    () => Object.values(dailyMap).reduce((s, d) => s + d.incomeTotal, 0),
    [dailyMap],
  );

  const selected: DaySpending | null = selectedDate ? dailyMap[selectedDate] ?? {
    date: selectedDate, total: 0, expenseTotal: 0, incomeTotal: 0, net: 0, items: [],
  } : null;

  const catById = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    for (const c of categories) m.set(c.id, { name: c.name, color: c.color });
    return m;
  }, [categories]);

  const today = localToday();

  function toggleDate(date: string) {
    setSelectedDate(prev => {
      const next = prev === date ? null : date;
      onDaySelect?.(next);
      return next;
    });
  }

  const categoryBreakdown = useMemo(() => {
    if (!selected) return [];
    const map = new Map<string, { catId: string; name: string; color: string; expense: number; income: number }>();
    for (const item of selected.items) {
      let entry = map.get(item.categoryId);
      if (!entry) {
        const cat = catById.get(item.categoryId);
        entry = {
          catId: item.categoryId,
          name: cat?.name ?? "Outros",
          color: cat?.color ?? "#6B7FA3",
          expense: 0,
          income: 0,
        };
        map.set(item.categoryId, entry);
      }
      if (item.flow === "expense") entry.expense += item.amount;
      else entry.income += item.amount;
    }
    return [...map.values()].sort(
      (a, b) => (b.expense + b.income) - (a.expense + a.income),
    );
  }, [selected, catById]);

  function cellBackground(day: DaySpending | undefined): string {
    if (!day || (day.expenseTotal <= 0 && day.incomeTotal <= 0)) {
      return "rgba(255,255,255,0.04)";
    }
    const magnitude = Math.abs(day.net) || day.expenseTotal || day.incomeTotal;
    const alpha = heatAlpha(magnitude, maxAbsNet);
    if (heatColor && categoryId) {
      // hex → rgba with alpha
      const hex = heatColor.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    const onlyIncome = day.incomeTotal > 0 && day.expenseTotal <= 0;
    const onlyExpense = day.expenseTotal > 0 && day.incomeTotal <= 0;
    return `rgba(${heatRgb(day.net, onlyIncome, onlyExpense)}, ${alpha})`;
  }

  return (
    <div>
      {!compact && (
        <>
          <div style={{
            display: "flex", gap: "6px", marginBottom: "14px",
            padding: "3px", background: "rgba(255,255,255,0.04)",
            borderRadius: "10px", border: "1px solid var(--border)",
          }}>
            {([
              { id: "competence" as const, label: "Competência" },
              { id: "payment" as const, label: "Pagamento" },
            ]).map(opt => (
              <button
                key={opt.id}
                onClick={() => { setMode(opt.id); setSelectedDate(null); }}
                style={{
                  flex: 1, padding: "8px 6px", borderRadius: "8px",
                  border: mode === opt.id ? "1px solid var(--border-accent)" : "1px solid transparent",
                  fontSize: "11.5px", fontWeight: 700, fontFamily: "inherit",
                  cursor: "pointer", touchAction: "manipulation",
                  background: mode === opt.id ? "var(--accent-10)" : "transparent",
                  color: mode === opt.id ? "var(--accent)" : "var(--text-3)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "12px", lineHeight: 1.4 }}>
            {mode === "competence"
              ? "Despesas e receitas por data de competência + parcelas no dia da compra."
              : "Somente lançamentos pagos (data de pagamento)."}
          </p>
        </>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px",
        marginBottom: "4px",
      }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{
            textAlign: "center", fontSize: "9px", fontWeight: 700,
            color: "var(--text-3)", letterSpacing: "0.04em",
          }}>
            {w}
          </div>
        ))}
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px",
      }}>
        {grid.map((date, i) => {
          if (!date) {
            return <div key={`empty-${i}`} style={{ aspectRatio: compact ? "1" : "1", minHeight: compact ? 28 : 36 }} />;
          }
          const dayNum = Number(date.split("-")[2]);
          const day = dailyMap[date];
          const display = cellDisplayAmount(day);
          const hasFlow = (day?.expenseTotal ?? 0) > 0 || (day?.incomeTotal ?? 0) > 0;
          const alpha = hasFlow
            ? heatAlpha(Math.abs(day!.net) || day!.expenseTotal || day!.incomeTotal, maxAbsNet)
            : 0;
          const isSelected = selectedDate === date;
          const isToday = date === today;
          const isFuture = date > today;
          const lightText = hasFlow && alpha > 0.45;

          return (
            <button
              key={date}
              type="button"
              onClick={() => toggleDate(date)}
              aria-label={`${dayNum}, R$ ${fmt(Math.abs(display))}`}
              style={{
                aspectRatio: "1",
                minHeight: compact ? "28px" : "42px",
                borderRadius: "8px",
                border: isSelected
                  ? "2px solid var(--accent)"
                  : isToday
                    ? "1px solid var(--accent-20)"
                    : "1px solid transparent",
                background: cellBackground(day),
                color: lightText ? "#fff" : "var(--text-2)",
                fontFamily: "inherit",
                cursor: "pointer",
                padding: "2px",
                opacity: isFuture ? 0.45 : 1,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "1px",
                transition: "border-color 0.15s, transform 0.1s",
              }}
            >
              <span style={{ fontSize: compact ? "9px" : "10px", fontWeight: isToday ? 800 : 600, lineHeight: 1 }}>
                {dayNum}
              </span>
              {hasFlow && (
                <span className="mono" style={{
                  fontSize: compact ? "7px" : "8px",
                  fontWeight: 700,
                  lineHeight: 1,
                  opacity: 0.95,
                }}>
                  {fmtCell(display)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!compact && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: "12px", gap: "10px", flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontSize: "9px", color: "var(--text-3)" }}>Despesa</span>
              <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: "rgba(255,77,106,0.7)" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontSize: "9px", color: "var(--text-3)" }}>Receita</span>
              <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: "rgba(16,185,129,0.7)" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <p className="mono" style={{ fontSize: "11px", color: "var(--green)", fontWeight: 600 }}>
              +R$ {fmt(monthIncome)}
            </p>
            <p className="mono" style={{ fontSize: "11px", color: "var(--red)", fontWeight: 600 }}>
              −R$ {fmt(monthExpense)}
            </p>
          </div>
        </div>
      )}

      {selectedDate && selected && !compact && (
        <DayDetail
          selectedDate={selectedDate}
          selected={selected}
          categoryBreakdown={categoryBreakdown}
        />
      )}

      {selectedDate && selected && compact && (
        <p style={{
          marginTop: "10px", fontSize: "11px", color: "var(--text-3)",
          display: "flex", justifyContent: "space-between",
        }}>
          <span style={{ textTransform: "capitalize" }}>{fmtDayLabel(selectedDate)}</span>
          <span className="mono" style={{ fontWeight: 700, color: "var(--red)" }}>
            R$ {fmt(selected.expenseTotal)}
          </span>
        </p>
      )}
    </div>
  );
}

function DayDetail({
  selectedDate,
  selected,
  categoryBreakdown,
}: {
  selectedDate: string;
  selected: DaySpending;
  categoryBreakdown: { catId: string; name: string; color: string; expense: number; income: number }[];
}) {
  return (
    <div style={{
      marginTop: "14px", paddingTop: "14px",
      borderTop: "1px solid var(--border)",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: "10px", gap: "8px",
      }}>
        <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-1)", textTransform: "capitalize" }}>
          {fmtDayLabel(selectedDate)}
        </p>
        <p className="mono" style={{
          fontSize: "13px", fontWeight: 700,
          color: selected.net >= 0 ? "var(--green)" : "var(--red)",
        }}>
          {selected.net >= 0 ? "+" : "−"}R$ {fmt(Math.abs(selected.net))}
        </p>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px",
        marginBottom: "12px",
      }}>
        <div style={{
          padding: "8px 10px", borderRadius: "8px",
          background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
            <TrendingUp size={12} color="var(--green)" />
            <span style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: 600 }}>Receitas</span>
          </div>
          <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--green)" }}>
            R$ {fmt(selected.incomeTotal)}
          </p>
        </div>
        <div style={{
          padding: "8px 10px", borderRadius: "8px",
          background: "rgba(255,77,106,0.08)", border: "1px solid rgba(255,77,106,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
            <TrendingDown size={12} color="var(--red)" />
            <span style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: 600 }}>Despesas</span>
          </div>
          <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--red)" }}>
            R$ {fmt(selected.expenseTotal)}
          </p>
        </div>
      </div>

      {categoryBreakdown.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <p style={{
            fontSize: "10px", fontWeight: 700, color: "var(--text-3)",
            letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px",
          }}>
            Por categoria
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {categoryBreakdown.map(row => (
              <div
                key={row.catId}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "6px 8px", borderRadius: "8px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{
                  width: "8px", height: "8px", borderRadius: "50%",
                  background: row.color, flexShrink: 0,
                }} />
                <span style={{
                  flex: 1, fontSize: "12px", fontWeight: 500, color: "var(--text-1)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {row.name}
                </span>
                <span className="mono" style={{ fontSize: "11px", fontWeight: 700, flexShrink: 0 }}>
                  {row.income > 0 && (
                    <span style={{ color: "var(--green)", marginRight: row.expense > 0 ? 8 : 0 }}>
                      +{fmt(row.income)}
                    </span>
                  )}
                  {row.expense > 0 && (
                    <span style={{ color: "var(--red)" }}>−{fmt(row.expense)}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selected.items.length === 0 ? (
        <p style={{ fontSize: "12px", color: "var(--text-3)" }}>Nenhum lançamento neste dia.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[...selected.items]
            .sort((a, b) => b.amount - a.amount)
            .map(item => (
              <DayItemRow key={item.id} item={item} />
            ))}
        </div>
      )}
    </div>
  );
}

function DayItemRow({ item }: { item: DaySpendingItem }) {
  const isIncome = item.flow === "income";
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 10px", borderRadius: "8px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{
        width: "28px", height: "28px", borderRadius: "7px", flexShrink: 0,
        background: "rgba(255,255,255,0.05)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {item.kind === "installment"
          ? <CreditCard size={12} strokeWidth={1.5} color="var(--amber)" />
          : isIncome
            ? <TrendingUp size={12} strokeWidth={1.5} color="var(--green)" />
            : <Package size={12} strokeWidth={1.5} color="var(--text-3)" />}
      </div>
      <p style={{
        flex: 1, fontSize: "12px", fontWeight: 500, color: "var(--text-1)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {item.description}
      </p>
      <p className="mono" style={{
        fontSize: "12px", fontWeight: 700, flexShrink: 0,
        color: isIncome ? "var(--green)" : "var(--text-1)",
      }}>
        {isIncome ? "+" : "−"}R$ {fmt(item.amount)}
      </p>
    </div>
  );
}
