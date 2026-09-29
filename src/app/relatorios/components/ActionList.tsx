"use client";
import type { ActionTarget, ActionTone, ReportAction } from "@/engine/reportInsightsEngine";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, TrendingUp, ListChecks } from "lucide-react";
import { SectionCard } from "./CollapsibleCard";

const TONE: Record<ActionTone, { color: string; bg: string; border: string; Icon: typeof Info }> = {
  danger:  { color: "var(--red)",   bg: "var(--red-10)",   border: "var(--red-20)",   Icon: AlertTriangle },
  warning: { color: "var(--amber)", bg: "var(--amber-10)", border: "var(--amber-20)", Icon: TrendingUp },
  info:    { color: "var(--blue)",  bg: "var(--blue-10)",  border: "var(--blue-20)",  Icon: Info },
  good:    { color: "var(--green)", bg: "var(--green-10)", border: "var(--green-20)", Icon: CheckCircle2 },
};

export default function ActionList({ actions, onGo }: {
  actions: ReportAction[];
  onGo: (target: ActionTarget) => void;
}) {
  return (
    <SectionCard title="O que fazer agora" icon={<ListChecks size={14} strokeWidth={1.5} color="var(--accent)" />}>
      {actions.length === 0 ? (
        <p style={{ fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.5 }}>
          Nada fora do padrão neste mês. Nenhuma categoria acima da média nem orçamento em risco.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {actions.map(a => {
            const t = TONE[a.tone];
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onGo(a.target)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: "10px",
                  width: "100%", padding: "10px 10px 10px 12px", textAlign: "left",
                  borderRadius: "12px", border: `1px solid ${t.border}`,
                  background: t.bg, cursor: "pointer", fontFamily: "inherit",
                  touchAction: "manipulation", minWidth: 0,
                }}
              >
                <t.Icon size={15} strokeWidth={1.75} color={t.color} style={{ flexShrink: 0, marginTop: "2px" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-1)", lineHeight: 1.35 }}>
                    {a.title}
                  </span>
                  <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-2)", lineHeight: 1.45, marginTop: "3px" }}>
                    {a.detail}
                  </span>
                </span>
                <ChevronRight size={14} strokeWidth={1.5} color="var(--text-3)" style={{ flexShrink: 0, marginTop: "2px" }} />
              </button>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
