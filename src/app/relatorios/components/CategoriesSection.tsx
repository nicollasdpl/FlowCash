"use client";
import { useMemo, useState } from "react";
import type { CardInstallment, CardPurchase, Category, CreditCard, Transaction } from "@/types/financial";
import { addMonths, fmt } from "@/engine/financialEngine";
import { getSpentByCategory } from "@/engine/budgetEngine";
import { getConsumptionByCategory, buildConsumptionCatSlices } from "@/app/relatorios/consumptionByCategory";
import DonutChart, { type Segment } from "@/components/DonutChart";
import { buildCatSlices, CategoryExpenseDetailPanel } from "@/components/CategoryDonutSection";
import CategoryIcon from "@/components/CategoryIcon";
import { TrendingDown, TrendingUp } from "lucide-react";
import { compact, fullMonth } from "./format";

type CategoryViewMode = "invoice" | "consumption";

export default function CategoriesSection({ month, transactions, installments, purchases, categories, cards }: {
  month: string;
  transactions: Transaction[];
  installments: CardInstallment[];
  purchases: CardPurchase[];
  categories: Category[];
  cards: CreditCard[];
}) {
  const [view, setView] = useState<CategoryViewMode>("invoice");
  const selectionKey = `${month}|${view}`;
  const [selection, setSelection] = useState<{ key: string; id: string } | null>(null);
  const selectedId = selection?.key === selectionKey ? selection.id : null;
  const prevMonth = addMonths(month, -1);

  function setSelectedId(id: string | null) {
    setSelection(id ? { key: selectionKey, id } : null);
  }

  const spent = useMemo(
    () => view === "invoice"
      ? getSpentByCategory(month, transactions, installments, purchases)
      : getConsumptionByCategory(month, transactions, installments, purchases, cards),
    [view, month, transactions, installments, purchases, cards],
  );
  const spentPrev = useMemo(
    () => view === "invoice"
      ? getSpentByCategory(prevMonth, transactions, installments, purchases)
      : getConsumptionByCategory(prevMonth, transactions, installments, purchases, cards),
    [view, prevMonth, transactions, installments, purchases, cards],
  );

  const rows = useMemo(() => {
    const total = Object.values(spent).reduce((s, v) => s + v, 0);
    return Object.entries(spent)
      .map(([id, amount]) => {
        const cat = categories.find(c => c.id === id);
        const prev = spentPrev[id] ?? 0;
        return {
          id,
          name: cat?.name ?? "—",
          color: cat?.color ?? "#6B7FA3",
          icon: cat?.icon ?? "",
          spent: amount,
          pct: total > 0 ? (amount / total) * 100 : 0,
          variation: prev > 0 ? ((amount - prev) / prev) * 100 : null,
        };
      })
      .sort((a, b) => b.spent - a.spent);
  }, [spent, spentPrev, categories]);

  const total = rows.reduce((s, r) => s + r.spent, 0);

  const segments: Segment[] = useMemo(() => {
    if (rows.length === 0 || total === 0) return [];
    const rounded = rows.map(r => ({
      name: r.name, color: r.color, amount: r.spent,
      percentage: Math.round((r.spent / total) * 100),
    }));
    const drift = 100 - rounded.reduce((s, r) => s + r.percentage, 0);
    if (drift !== 0) rounded[0].percentage += drift;
    return rounded;
  }, [rows, total]);

  const slices = useMemo(
    () => view === "invoice"
      ? buildCatSlices(transactions, installments, purchases, categories, cards, month)
      : buildConsumptionCatSlices(month, transactions, installments, purchases, categories, cards),
    [view, month, transactions, installments, purchases, categories, cards],
  );
  const selectedSlice = slices.find(s => s.catId === selectedId) ?? null;

  function toggle(id: string) {
    setSelectedId(selectedId === id ? null : id);
  }

  return (
    <div>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          {([
            { id: "invoice" as const, label: "Por fatura" },
            { id: "consumption" as const, label: "Gasto real" },
          ]).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setView(opt.id)}
              className={`chip-btn grow${view === opt.id ? " active" : ""}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "8px", lineHeight: 1.4 }}>
          {view === "invoice"
            ? "Pelo mês da fatura (competência). É a mesma base de Despesas no resumo. A % compara com o mês anterior."
            : "Pela data da compra no cartão, mesmo que a fatura seja outro mês. Parcelado conta só a parcela do mês."}
        </p>
      </div>

      {segments.length === 0 ? (
        <p style={{ padding: "20px 14px 24px", textAlign: "center", fontSize: "13px", color: "var(--text-3)" }}>
          Sem despesas em {fullMonth(month)}.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "center", padding: "4px 14px 8px" }}>
            <DonutChart
              segments={segments}
              totalLabel="Total"
              total={`R$ ${compact(total)}`}
              activeSegment={selectedSlice?.name ?? null}
              onSegmentClick={seg => {
                if (!seg) { setSelectedId(null); return; }
                const slice = slices.find(s => s.name === seg.name);
                if (slice) toggle(slice.catId);
              }}
            />
          </div>

          <div style={{ padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {rows.map(row => {
              const active = selectedId === row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => toggle(row.id)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", fontFamily: "inherit",
                    cursor: "pointer", padding: "6px 8px", borderRadius: "10px", minWidth: 0,
                    background: active ? `${row.color}14` : "transparent",
                    border: `1px solid ${active ? `${row.color}35` : "transparent"}`,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    {row.icon
                      ? <CategoryIcon icon={row.icon} color={row.color} size={15} />
                      : <span style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, flexShrink: 0 }} />}
                    <span style={{
                      flex: 1, minWidth: 0, fontSize: "13px", fontWeight: active ? 700 : 600, color: "var(--text-1)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {row.name}
                    </span>
                    <VariationBadge variation={row.variation} />
                    <span className="mono" style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-1)", flexShrink: 0 }}>
                      R$ {fmt(row.spent)}
                    </span>
                  </span>
                  <span className="progress-bar-bg" style={{ display: "block" }}>
                    <span className="progress-bar-fill" style={{ display: "block", width: `${Math.min(row.pct, 100)}%`, background: row.color }} />
                  </span>
                </button>
              );
            })}
          </div>

          {selectedSlice && (
            <CategoryExpenseDetailPanel
              slice={selectedSlice}
              onClose={() => setSelectedId(null)}
              month={month}
              transactions={transactions}
              installments={installments}
              purchases={purchases}
              categories={categories}
            />
          )}
        </>
      )}
    </div>
  );
}

function VariationBadge({ variation }: { variation: number | null }) {
  if (variation === null || !isFinite(variation) || Math.abs(variation) < 1) return null;
  const up = variation > 0;
  const Arrow = up ? TrendingUp : TrendingDown;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "3px", flexShrink: 0,
      padding: "2px 6px", borderRadius: "6px",
      background: up ? "var(--red-10)" : "var(--green-10)",
      color: up ? "var(--red)" : "var(--green)",
      fontSize: "10.5px", fontWeight: 700,
    }}>
      <Arrow size={10} strokeWidth={1.5} />
      {up ? "+" : ""}{Math.round(variation)}%
    </span>
  );
}
