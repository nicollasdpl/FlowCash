"use client";
import type { Category } from "@/types/financial";
import type { CategoryOutlier } from "@/engine/reportInsightsEngine";
import CategoryIcon from "@/components/CategoryIcon";
import { Scissors } from "lucide-react";
import { SectionCard } from "./CollapsibleCard";
import { brl } from "./format";

export default function CategoryOutliers({ id, outliers, categories, hasHistory }: {
  id?: string;
  outliers: CategoryOutlier[];
  categories: Category[];
  hasHistory: boolean;
}) {
  const totalExcess = outliers.reduce((s, o) => s + o.excess, 0);
  const max = Math.max(1, ...outliers.map(o => Math.max(o.current, o.average)));

  return (
    <SectionCard
      id={id}
      title="Onde cortar"
      icon={<Scissors size={14} strokeWidth={1.5} color="var(--amber)" />}
      right={totalExcess > 0 ? (
        <span className="mono" style={{ fontSize: "12px", fontWeight: 700, color: "var(--amber)" }}>
          {brl(totalExcess)}
        </span>
      ) : undefined}
      hint={totalExcess > 0
        ? "Categorias acima da sua média dos últimos 3 meses. Voltar à média economiza o valor ao lado."
        : undefined}
    >
      {!hasHistory ? (
        <p style={{ fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.5 }}>
          Ainda não há meses anteriores para comparar. A partir do próximo mês aparecem as categorias fora do padrão.
        </p>
      ) : outliers.length === 0 ? (
        <p style={{ fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.5 }}>
          Nenhuma categoria passou da média dos meses anteriores (margem de 15% e R$ 50).
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {outliers.map(o => {
            const cat = categories.find(c => c.id === o.categoryId);
            const color = cat?.color ?? "#6B7FA3";
            return (
              <div key={o.categoryId} style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  {cat?.icon
                    ? <CategoryIcon icon={cat.icon} color={color} size={15} />
                    : <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />}
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: "13px", fontWeight: 600, color: "var(--text-1)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {cat?.name ?? "Sem categoria"}
                  </span>
                  <span className="mono" style={{
                    fontSize: "11.5px", fontWeight: 700, color: "var(--amber)",
                    background: "var(--amber-10)", padding: "2px 6px", borderRadius: "6px", flexShrink: 0,
                  }}>
                    +{brl(o.excess)}
                  </span>
                </div>
                <div style={{ position: "relative", height: "6px", borderRadius: "99px", background: "rgba(255,255,255,0.06)" }}>
                  <div style={{
                    position: "absolute", inset: 0, width: `${(o.current / max) * 100}%`,
                    background: color, borderRadius: "99px",
                  }} />
                  {o.average > 0 && (
                    <div
                      title="Média"
                      style={{
                        position: "absolute", top: "-3px", bottom: "-3px", width: "2px",
                        left: `calc(${(o.average / max) * 100}% - 1px)`,
                        background: "var(--text-1)", borderRadius: "1px",
                      }}
                    />
                  )}
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "5px" }}>
                  <span className="mono" style={{ color: "var(--text-2)" }}>{brl(o.current)}</span> neste mês
                  {o.average > 0
                    ? <> · média <span className="mono" style={{ color: "var(--text-2)" }}>{brl(o.average)}</span></>
                    : " · não apareceu nos meses anteriores"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
