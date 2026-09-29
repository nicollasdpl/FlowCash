"use client";
import type { CommitmentMonth, ReleaseEvent } from "@/engine/reportInsightsEngine";
import { CalendarClock } from "lucide-react";
import { SectionCard } from "./CollapsibleCard";
import { brl, monthOnly, shortMonth } from "./format";

export default function FutureCommitments({ id, months, releases, averageIncome }: {
  id?: string;
  months: CommitmentMonth[];
  releases: ReleaseEvent[];
  averageIncome: number;
}) {
  const max = Math.max(1, ...months.map(m => m.total));
  const hasAny = months.some(m => m.total > 0);

  return (
    <SectionCard
      id={id}
      title="Próximos meses já comprometidos"
      icon={<CalendarClock size={14} strokeWidth={1.5} color="var(--purple)" />}
      hint={hasAny
        ? averageIncome > 0
          ? "Parcelas e assinaturas no cartão ainda não pagas. A % compara com sua receita média."
          : "Parcelas e assinaturas no cartão ainda não pagas."
        : undefined}
    >
      {!hasAny ? (
        <p style={{ fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.5 }}>
          Nenhuma parcela ou assinatura pendente nos próximos meses. Toda a receita futura está livre.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {months.map(m => {
              const share = averageIncome > 0 ? m.total / averageIncome : null;
              return (
                <div key={m.month} style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  <span style={{ width: "30px", fontSize: "11px", fontWeight: 600, color: "var(--text-3)", flexShrink: 0 }}>
                    {shortMonth(m.month)}
                  </span>
                  <div style={{
                    flex: 1, minWidth: 0, height: "12px", borderRadius: "4px",
                    background: "rgba(255,255,255,0.04)", display: "flex", overflow: "hidden",
                  }}>
                    <div style={{ width: `${(m.installments / max) * 100}%`, background: "var(--amber)" }} />
                    <div style={{ width: `${(m.subscriptions / max) * 100}%`, background: "var(--purple)" }} />
                  </div>
                  <span className="mono" style={{ width: "86px", textAlign: "right", fontSize: "11.5px", fontWeight: 700, color: "var(--text-1)", flexShrink: 0 }}>
                    {brl(m.total)}
                  </span>
                  {share !== null && (
                    <span className="mono" style={{
                      width: "34px", textAlign: "right", fontSize: "10.5px", flexShrink: 0,
                      color: share >= 0.5 ? "var(--red)" : share >= 0.3 ? "var(--amber)" : "var(--text-3)",
                    }}>
                      {Math.round(share * 100)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "14px", marginTop: "10px" }}>
            <LegendDot color="var(--amber)" label="Parcelas" />
            <LegendDot color="var(--purple)" label="Assinaturas" />
          </div>

          {releases.length > 0 && (
            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "8px" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Quando sobra mais
              </p>
              {releases.map(r => (
                <div key={r.month} style={{ minWidth: 0 }}>
                  <p style={{ fontSize: "12.5px", color: "var(--text-1)", fontWeight: 600 }}>
                    Em {monthOnly(r.month)}:{" "}
                    <span className="mono" style={{ color: "var(--green)" }}>{brl(r.amount)}/mês</span> a menos
                  </p>
                  <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Terminam: {r.items.map(i => i.description).join(", ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-2)" }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      {label}
    </span>
  );
}
