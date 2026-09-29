"use client";
import { useState } from "react";
import type { Category } from "@/types/financial";
import type { RecurringCadence, RecurringItem } from "@/engine/reportInsightsEngine";
import CategoryIcon from "@/components/CategoryIcon";
import { Repeat } from "lucide-react";
import { SectionCard } from "./CollapsibleCard";
import { brl } from "./format";

const CADENCE: Record<RecurringCadence, string> = {
  daily: "diária",
  weekly: "semanal",
  monthly: "mensal",
  yearly: "anual",
};

const VISIBLE = 6;

export default function RecurringCosts({ id, items, monthlyTotal, yearlyTotal, categories, averageIncome }: {
  id?: string;
  items: RecurringItem[];
  monthlyTotal: number;
  yearlyTotal: number;
  categories: Category[];
  averageIncome: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, VISIBLE);

  return (
    <SectionCard id={id} title="Recorrências e assinaturas" icon={<Repeat size={14} strokeWidth={1.5} color="var(--purple)" />}>
      {items.length === 0 ? (
        <p style={{ fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.5 }}>
          Nenhuma assinatura no cartão nem lançamento recorrente ativo.
        </p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", marginBottom: "12px" }}>
            <div className="metric-tile" style={{ minWidth: 0 }}>
              <p className="metric-tile-label">Por mês</p>
              <p className="metric-tile-value" style={{ fontSize: "15px", color: "var(--text-1)" }}>{brl(monthlyTotal)}</p>
              {averageIncome > 0 && (
                <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginTop: "4px" }}>
                  {Math.round((monthlyTotal / averageIncome) * 100)}% da receita média
                </p>
              )}
            </div>
            <div className="metric-tile" style={{ minWidth: 0 }}>
              <p className="metric-tile-label">Por ano</p>
              <p className="metric-tile-value" style={{ fontSize: "15px", color: "var(--purple)" }}>{brl(yearlyTotal)}</p>
              <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginTop: "4px" }}>
                {items.length} {items.length === 1 ? "item ativo" : "itens ativos"}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {visible.map(item => {
              const cat = categories.find(c => c.id === item.categoryId);
              return (
                <div key={item.key} style={{
                  display: "flex", alignItems: "center", gap: "10px", minWidth: 0,
                  padding: "8px 10px", borderRadius: "10px",
                  background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
                }}>
                  {cat?.icon
                    ? <CategoryIcon icon={cat.icon} color={cat.color} size={15} />
                    : <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat?.color ?? "var(--text-3)", flexShrink: 0 }} />}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: "block", fontSize: "12.5px", fontWeight: 600, color: "var(--text-1)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {item.description}
                    </span>
                    <span style={{ display: "block", fontSize: "10.5px", color: "var(--text-3)", marginTop: "1px" }}>
                      {item.source === "card" ? "Cartão" : "Conta"} · {CADENCE[item.cadence]}
                      {item.cadence !== "monthly" && <> · {brl(item.amount)} cada</>}
                    </span>
                  </span>
                  <span style={{ textAlign: "right", flexShrink: 0 }}>
                    <span className="mono" style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--text-1)" }}>
                      {brl(item.monthly)}
                    </span>
                    <span className="mono" style={{ display: "block", fontSize: "10px", color: "var(--text-3)" }}>
                      {brl(item.monthly * 12)}/ano
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {items.length > VISIBLE && (
            <button type="button" className="link-quiet" onClick={() => setShowAll(s => !s)} style={{ marginTop: "10px", minHeight: "32px" }}>
              {showAll ? "Mostrar menos" : `Ver todas (${items.length})`}
            </button>
          )}
        </>
      )}
    </SectionCard>
  );
}
