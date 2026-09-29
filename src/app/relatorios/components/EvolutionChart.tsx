"use client";
import type { MonthResult } from "@/engine/reportInsightsEngine";
import { BarChart2 } from "lucide-react";
import { SectionCard } from "./CollapsibleCard";
import { compact, shortMonth } from "./format";

const CHART_H = 110;

export default function EvolutionChart({ results, selectedMonth }: {
  results: MonthResult[];
  selectedMonth: string;
}) {
  const max = Math.max(1, ...results.flatMap(r => [r.income, r.expense]));
  const withRate = results.filter(r => r.savingsRate !== null);
  const avgRate = withRate.length > 0
    ? withRate.reduce((s, r) => s + (r.savingsRate ?? 0), 0) / withRate.length
    : null;

  return (
    <SectionCard
      title={`Evolução · ${results.length} meses`}
      icon={<BarChart2 size={14} strokeWidth={1.5} color="var(--text-2)" />}
      right={avgRate !== null ? (
        <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
          poupança média{" "}
          <span className="mono" style={{ fontWeight: 700, color: rateColor(avgRate) }}>{Math.round(avgRate * 100)}%</span>
        </span>
      ) : undefined}
    >
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${results.length}, minmax(0, 1fr))`, gap: "4px" }}>
        {results.map(r => {
          const selected = r.month === selectedMonth;
          return (
            <div key={r.month} style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ height: `${CHART_H}px`, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "3px" }}>
                <Bar value={r.income} max={max} color="var(--green)" />
                <Bar value={r.expense} max={max} color="var(--red)" />
              </div>
              <span style={{
                marginTop: "6px", fontSize: "10.5px", fontWeight: selected ? 800 : 600,
                color: selected ? "var(--text-1)" : "var(--text-3)",
              }}>
                {shortMonth(r.month)}
              </span>
              <span className="mono" style={{ fontSize: "10px", fontWeight: 700, color: r.savingsRate === null ? "var(--text-3)" : rateColor(r.savingsRate) }}>
                {r.savingsRate === null ? "—" : `${Math.round(r.savingsRate * 100)}%`}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{
        display: "flex", gap: "14px", flexWrap: "wrap", marginTop: "12px",
        paddingTop: "10px", borderTop: "1px solid var(--border)",
      }}>
        <Legend color="var(--green)" label="Receitas" />
        <Legend color="var(--red)" label="Despesas" />
        <span style={{ fontSize: "11px", color: "var(--text-3)" }}>% = quanto sobrou da receita</span>
      </div>
    </SectionCard>
  );
}

function rateColor(rate: number): string {
  return rate < 0 ? "var(--red)" : rate < 0.1 ? "var(--amber)" : "var(--green)";
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div
      title={compact(value)}
      style={{
        width: "38%", maxWidth: "16px",
        height: `${(value / max) * 100}%`,
        minHeight: value > 0 ? "3px" : "0",
        background: color, borderRadius: "3px 3px 0 0",
        opacity: value > 0 ? 1 : 0.15,
        transition: "height 0.4s ease",
      }}
    />
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-2)" }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}
