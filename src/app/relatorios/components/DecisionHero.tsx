"use client";
import type { MonthResult, SpendingRoom } from "@/engine/reportInsightsEngine";
import { isBalanceNegative } from "@/engine/financialEngine";
import { AlertTriangle, Wallet } from "lucide-react";
import { brl, monthOnly, pct } from "./format";

export default function DecisionHero({ id, room, result, selectedMonth }: {
  id?: string;
  room: SpendingRoom | null;
  result: MonthResult;
  selectedMonth: string;
}) {
  if (!room) return <ClosedMonthHero id={id} result={result} selectedMonth={selectedMonth} />;

  const endDay = Number(room.endDate.slice(8, 10));
  const negative = isBalanceNegative(room.free);
  const afterInvoice = room.free - room.nextInvoice;
  const perDayAfterInvoice = afterInvoice > 0 ? afterInvoice / room.daysLeft : 0;

  return (
    <section
      id={id}
      className="soft-card"
      style={{
        padding: "16px 14px", marginBottom: "12px", scrollMarginTop: "12px",
        background: negative
          ? "linear-gradient(160deg, rgba(255,77,106,0.14), var(--bg-card) 70%)"
          : "linear-gradient(160deg, rgba(0,229,160,0.12), var(--bg-card) 70%)",
        borderColor: negative ? "var(--red-20)" : "var(--border-accent)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        {negative
          ? <AlertTriangle size={15} strokeWidth={1.5} color="var(--red)" />
          : <Wallet size={15} strokeWidth={1.5} color="var(--accent)" />}
        <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-2)" }}>
          {negative ? `Até dia ${endDay} as contas não fecham` : `Livre para gastar até dia ${endDay}`}
        </p>
      </div>

      {negative ? (
        <>
          <p className="mono" style={{ fontSize: "28px", fontWeight: 700, color: "var(--red)", lineHeight: 1.1 }}>
            −{brl(room.free)}
          </p>
          <p style={{ fontSize: "12.5px", color: "var(--text-2)", marginTop: "8px", lineHeight: 1.45 }}>
            Somando o saldo de hoje com o que ainda entra e sai até o fim do mês, faltam {brl(room.free)}.
            Evite gastos novos e adie o que puder.
          </p>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" }}>
            <p className="mono" style={{ fontSize: "30px", fontWeight: 700, color: "var(--accent)", lineHeight: 1.1 }}>
              {brl(room.perDay)}
            </p>
            <p style={{ fontSize: "13px", color: "var(--text-2)", fontWeight: 600 }}>por dia</p>
          </div>
          <p style={{ fontSize: "12.5px", color: "var(--text-2)", marginTop: "6px", lineHeight: 1.45 }}>
            <span className="mono" style={{ color: "var(--text-1)", fontWeight: 700 }}>{brl(room.free)}</span>
            {" "}sobram no fim do mês depois de tudo que já está agendado, em {room.daysLeft} {room.daysLeft === 1 ? "dia" : "dias"}.
          </p>
        </>
      )}

      {room.nextInvoice > 0 && (
        <div style={{
          marginTop: "12px", padding: "10px 12px", borderRadius: "10px",
          background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
        }}>
          <p style={{ fontSize: "12px", color: "var(--text-2)", lineHeight: 1.45 }}>
            Fatura que vence em {monthOnly(room.nextMonth)}:{" "}
            <span className="mono" style={{ color: "var(--amber)", fontWeight: 700 }}>{brl(room.nextInvoice)}</span>.
            {" "}
            {negative ? null : afterInvoice > 0 ? (
              <>Se quiser já deixar reservada, o livre cai para{" "}
                <span className="mono" style={{ color: "var(--text-1)", fontWeight: 700 }}>{brl(perDayAfterInvoice)}/dia</span>.
              </>
            ) : (
              <span style={{ color: "var(--amber)" }}>
                O que sobra hoje não cobre essa fatura; ela depende da receita de {monthOnly(room.nextMonth)}.
              </span>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

function ClosedMonthHero({ id, result, selectedMonth }: { id?: string; result: MonthResult; selectedMonth: string }) {
  const negative = isBalanceNegative(result.net);
  const color = negative ? "var(--red)" : "var(--accent)";
  return (
    <section id={id} className="soft-card" style={{ padding: "16px 14px", marginBottom: "12px", scrollMarginTop: "12px" }}>
      <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-2)", marginBottom: "8px" }}>
        Resultado de {monthOnly(selectedMonth)}
      </p>
      <p className="mono" style={{ fontSize: "28px", fontWeight: 700, color, lineHeight: 1.1 }}>
        {negative ? "−" : "+"}{brl(result.net)}
      </p>
      <p style={{ fontSize: "12.5px", color: "var(--text-2)", marginTop: "6px", lineHeight: 1.45 }}>
        {result.income <= 0
          ? "Sem receita registrada no mês."
          : negative
            ? `Gastou ${brl(result.net)} a mais do que recebeu.`
            : `Sobrou ${pct(result.savingsRate ?? 0)} da receita.`}
      </p>
    </section>
  );
}
