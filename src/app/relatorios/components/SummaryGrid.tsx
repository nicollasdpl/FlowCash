"use client";
import type { MonthResult } from "@/engine/reportInsightsEngine";
import { isBalanceNegative } from "@/engine/financialEngine";
import { brl, pct } from "./format";

type Better = "up" | "down";

export default function SummaryGrid({ id, result, average, inProgress }: {
  id?: string;
  result: MonthResult;
  average: MonthResult | null;
  inProgress: boolean;
}) {
  const netNegative = isBalanceNegative(result.net);
  return (
    <section id={id} style={{ marginBottom: "12px", scrollMarginTop: "12px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
        <Tile
          label="Receitas"
          value={brl(result.income)}
          color="var(--green)"
          delta={average ? relDelta(result.income, average.income) : null}
          better="up"
        />
        <Tile
          label="Despesas"
          value={brl(result.expense)}
          color="var(--red)"
          delta={average ? relDelta(result.expense, average.expense) : null}
          better="down"
        />
        <Tile
          label={netNegative ? "Faltou" : "Sobrou"}
          value={`${netNegative ? "−" : ""}${brl(result.net)}`}
          color={netNegative ? "var(--red)" : "var(--accent)"}
          delta={average ? { text: `média ${average.net < 0 ? "−" : ""}${brl(average.net)}`, dir: 0 } : null}
          better="up"
        />
        <Tile
          label="Taxa de poupança"
          value={result.savingsRate === null ? "—" : pct(result.savingsRate)}
          color={result.savingsRate === null ? "var(--text-3)" : result.savingsRate < 0 ? "var(--red)" : result.savingsRate < 0.1 ? "var(--amber)" : "var(--accent)"}
          delta={average?.savingsRate != null && result.savingsRate !== null
            ? pointsDelta(result.savingsRate, average.savingsRate)
            : null}
          better="up"
        />
      </div>
      <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginTop: "6px", lineHeight: 1.4 }}>
        {inProgress ? "Mês em andamento. " : ""}
        Despesas por competência (conta + cartão, sem pagamento de fatura). Comparação com a média dos 3 meses anteriores.
      </p>
    </section>
  );
}

function relDelta(value: number, avg: number): { text: string; dir: number } | null {
  if (avg <= 0) return null;
  const d = (value - avg) / avg;
  if (Math.abs(d) < 0.01) return { text: "na média", dir: 0 };
  return { text: `${d > 0 ? "+" : "−"}${Math.round(Math.abs(d) * 100)}% vs média`, dir: Math.sign(d) };
}

function pointsDelta(value: number, avg: number): { text: string; dir: number } {
  const d = Math.round((value - avg) * 100);
  if (d === 0) return { text: "na média", dir: 0 };
  return { text: `${d > 0 ? "+" : "−"}${Math.abs(d)} p.p. vs média`, dir: Math.sign(d) };
}

function Tile({ label, value, color, delta, better }: {
  label: string;
  value: string;
  color: string;
  delta: { text: string; dir: number } | null;
  better: Better;
}) {
  const good = delta && delta.dir !== 0 && ((better === "up" && delta.dir > 0) || (better === "down" && delta.dir < 0));
  const deltaColor = !delta || delta.dir === 0 ? "var(--text-3)" : good ? "var(--green)" : "var(--red)";
  return (
    <div className="metric-tile" style={{ minWidth: 0 }}>
      <p className="metric-tile-label">{label}</p>
      <p className="metric-tile-value" style={{ color, fontSize: "15px" }}>{value}</p>
      <p style={{
        fontSize: "10.5px", color: deltaColor, marginTop: "4px", fontWeight: 600,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {delta?.text ?? "sem histórico"}
      </p>
    </div>
  );
}
