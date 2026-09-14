"use client";
import { useEffect, useMemo, useState } from "react";
import type { Transaction, CardInstallment, CardPurchase } from "@/types/financial";
import { fmt } from "@/engine/financialEngine";
import {
  buildDailySpendingMap,
  getCalendarGrid,
  heatAlpha,
  type SpendingCalendarMode,
  type DaySpending,
} from "@/engine/spendingCalendarEngine";
import { CreditCard, Package } from "lucide-react";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function fmtDayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "short", day: "numeric", month: "short",
  });
}

export default function SpendingHeatmapCalendar({
  month,
  transactions,
  installments,
  purchases,
}: {
  month: string;
  transactions: Transaction[];
  installments: CardInstallment[];
  purchases: CardPurchase[];
}) {
  const [mode, setMode] = useState<SpendingCalendarMode>("competence");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDate(null);
  }, [month]);

  const dailyMap = useMemo(
    () => buildDailySpendingMap(month, transactions, installments, purchases, mode),
    [month, transactions, installments, purchases, mode],
  );

  const grid = useMemo(() => getCalendarGrid(month), [month]);

  const maxDay = useMemo(
    () => Math.max(0, ...Object.values(dailyMap).map(d => d.total)),
    [dailyMap],
  );

  const monthTotal = useMemo(
    () => Object.values(dailyMap).reduce((s, d) => s + d.total, 0),
    [dailyMap],
  );

  const selected: DaySpending | null = selectedDate ? dailyMap[selectedDate] ?? {
    date: selectedDate, total: 0, items: [],
  } : null;

  const today = new Date().toISOString().split("T")[0];

  function toggleDate(date: string) {
    setSelectedDate(prev => (prev === date ? null : date));
  }

  return (
    <div>
      {/* Modo */}
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
          ? "Despesas por data de competência + parcelas no dia da compra."
          : "Somente despesas pagas (data de pagamento)."}
      </p>

      {/* Cabeçalho dias da semana */}
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

      {/* Grade */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px",
      }}>
        {grid.map((date, i) => {
          if (!date) {
            return <div key={`empty-${i}`} style={{ aspectRatio: "1" }} />;
          }
          const dayNum = Number(date.split("-")[2]);
          const spending = dailyMap[date]?.total ?? 0;
          const alpha = heatAlpha(spending, maxDay);
          const isSelected = selectedDate === date;
          const isToday = date === today;
          const isFuture = date > today;

          return (
            <button
              key={date}
              type="button"
              onClick={() => toggleDate(date)}
              aria-label={`${dayNum}, R$ ${fmt(spending)}`}
              style={{
                aspectRatio: "1",
                minHeight: "36px",
                borderRadius: "8px",
                border: isSelected
                  ? "2px solid var(--accent)"
                  : isToday
                    ? "1px solid var(--accent-20)"
                    : "1px solid transparent",
                background: spending > 0
                  ? `rgba(255, 77, 106, ${alpha})`
                  : "rgba(255,255,255,0.04)",
                color: spending > 0 && alpha > 0.45 ? "#fff" : "var(--text-2)",
                fontSize: "11px",
                fontWeight: isToday ? 800 : 600,
                fontFamily: "inherit",
                cursor: "pointer",
                padding: 0,
                opacity: isFuture ? 0.45 : 1,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "border-color 0.15s, transform 0.1s",
              }}
            >
              {dayNum}
            </button>
          );
        })}
      </div>

      {/* Legenda */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginTop: "12px", gap: "10px", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ fontSize: "9px", color: "var(--text-3)", marginRight: "4px" }}>Menos</span>
          {[0.14, 0.35, 0.55, 0.86].map(a => (
            <div key={a} style={{
              width: "14px", height: "14px", borderRadius: "4px",
              background: `rgba(255, 77, 106, ${a})`,
            }} />
          ))}
          <span style={{ fontSize: "9px", color: "var(--text-3)", marginLeft: "4px" }}>Mais</span>
        </div>
        <p className="mono" style={{ fontSize: "11px", color: "var(--text-2)", fontWeight: 600 }}>
          Total: R$ {fmt(monthTotal)}
        </p>
      </div>

      {/* Detalhe do dia */}
      {selectedDate && selected && (
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
            <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--red)" }}>
              R$ {fmt(selected.total)}
            </p>
          </div>

          {selected.items.length === 0 ? (
            <p style={{ fontSize: "12px", color: "var(--text-3)" }}>Nenhum gasto neste dia.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[...selected.items]
                .sort((a, b) => b.amount - a.amount)
                .map(item => (
                <div
                  key={item.id}
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
                      : <Package size={12} strokeWidth={1.5} color="var(--text-3)" />}
                  </div>
                  <p style={{
                    flex: 1, fontSize: "12px", fontWeight: 500, color: "var(--text-1)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {item.description}
                  </p>
                  <p className="mono" style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-1)", flexShrink: 0 }}>
                    R$ {fmt(item.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
