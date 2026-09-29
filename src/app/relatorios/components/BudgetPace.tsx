"use client";
import Link from "next/link";
import type { Category } from "@/types/financial";
import type { BudgetPace as BudgetPaceRow } from "@/engine/reportInsightsEngine";
import CategoryIcon from "@/components/CategoryIcon";
import { Gauge } from "lucide-react";
import { SectionCard } from "./CollapsibleCard";
import { brl } from "./format";

export default function BudgetPace({ id, paces, categories }: {
  id?: string;
  paces: BudgetPaceRow[];
  categories: Category[];
}) {
  const atRisk = paces.filter(p => p.status !== "ok").length;
  return (
    <SectionCard
      id={id}
      title="Orçamentos"
      icon={<Gauge size={14} strokeWidth={1.5} color="var(--blue)" />}
      right={paces.length > 0 ? (
        <span style={{ fontSize: "11px", fontWeight: 700, color: atRisk > 0 ? "var(--amber)" : "var(--green)" }}>
          {atRisk > 0 ? `${atRisk} em risco` : "todos no limite"}
        </span>
      ) : undefined}
      hint={paces.some(p => p.isCurrentMonth)
        ? "Projeção pelo ritmo de gasto até hoje. O traço branco marca onde o mês deve fechar."
        : undefined}
    >
      {paces.length === 0 ? (
        <p style={{ fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.5 }}>
          Sem orçamento neste mês.{" "}
          <Link href="/orcamentos" className="link-quiet">Criar orçamentos</Link>{" "}
          para ver quanto ainda cabe por dia em cada categoria.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {paces.map(p => {
            const cat = categories.find(c => c.id === p.categoryId);
            const scale = Math.max(p.limit, p.projected, p.spent, 1);
            const statusColor = p.status === "over" ? "var(--red)" : p.status === "risk" ? "var(--amber)" : "var(--green)";
            const barColor = p.status === "ok" ? (cat?.color ?? "var(--accent)") : statusColor;
            return (
              <div key={p.budgetId} style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  {cat?.icon
                    ? <CategoryIcon icon={cat.icon} color={cat.color} size={15} />
                    : <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat?.color ?? "var(--text-3)", flexShrink: 0 }} />}
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: "13px", fontWeight: 600, color: "var(--text-1)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {cat?.name ?? "—"}
                  </span>
                  <span className="mono" style={{ fontSize: "12px", fontWeight: 700, color: p.status === "over" ? "var(--red)" : "var(--text-1)", flexShrink: 0 }}>
                    {brl(p.spent)}
                  </span>
                  <span className="mono" style={{ fontSize: "11px", color: "var(--text-3)", flexShrink: 0 }}>
                    / {brl(p.limit)}
                  </span>
                </div>
                <div style={{ position: "relative", height: "6px", borderRadius: "99px", background: "rgba(255,255,255,0.06)" }}>
                  <div style={{
                    position: "absolute", top: 0, bottom: 0, left: 0,
                    width: `${Math.min(100, (p.spent / scale) * 100)}%`,
                    background: barColor, borderRadius: "99px",
                  }} />
                  <div style={{
                    position: "absolute", top: "-3px", bottom: "-3px", width: "2px",
                    left: `calc(${(p.limit / scale) * 100}% - 1px)`,
                    background: "var(--text-3)",
                  }} />
                  {p.isCurrentMonth && p.projected > p.spent && (
                    <div style={{
                      position: "absolute", top: "-3px", bottom: "-3px", width: "2px",
                      left: `calc(${Math.min(100, (p.projected / scale) * 100)}% - 1px)`,
                      background: "var(--text-1)",
                    }} />
                  )}
                </div>
                <p style={{ fontSize: "11px", color: statusColor, marginTop: "5px", fontWeight: 600, lineHeight: 1.4 }}>
                  {statusText(p)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function statusText(p: BudgetPaceRow): string {
  if (p.status === "over") return `Estourou em ${brl(p.spent - p.limit)}`;
  if (!p.isCurrentMonth) return `Sobrou ${brl(p.remaining)} do limite`;
  if (p.status === "risk") {
    return `No ritmo atual fecha em ${brl(p.projected)}${p.overDay ? `, estoura por volta do dia ${p.overDay}` : ""}. Máximo de ${brl(p.perDayLeft)}/dia para caber.`;
  }
  return `Cabem ${brl(p.perDayLeft)}/dia até o fim do mês (restam ${brl(p.remaining)}).`;
}
