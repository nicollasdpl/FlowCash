"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { getCardLimitSummary } from "@/engine/financialEngine";
import { CreditCard as CreditCardIcon } from "lucide-react";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Cartoes() {
  const router = useRouter();
  const { state } = useApp();

  return (
    <div style={{ padding: "20px 16px", maxWidth: "600px", margin: "0 auto" }}>

      {/* Header */}
      <div className="fade-up-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em" }}>
            Cartões de Crédito
          </h1>
          <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
            {state.cards.length} cartão{state.cards.length !== 1 ? "ões" : ""} cadastrado{state.cards.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => router.push("/cartoes/nova")}
          style={{ fontSize: "13px", padding: "10px 16px" }}
        >
          + Novo
        </button>
      </div>

      {/* Empty state */}
      {state.cards.length === 0 && (
        <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px", color: "var(--text-3)" }}>
            <CreditCardIcon size={44} strokeWidth={1.5} />
          </div>
          <p style={{ color: "var(--text-2)", fontSize: "15px", fontWeight: 600 }}>Nenhum cartão cadastrado</p>
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginTop: "6px", marginBottom: "20px" }}>
            Adicione seu cartão para controlar faturas e parcelamentos.
          </p>
          <button className="btn-primary" onClick={() => router.push("/cartoes/nova")}>
            + Adicionar cartão
          </button>
        </div>
      )}

      {/* Card list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {state.cards.map((card, i) => {
          const summary = getCardLimitSummary(card, state.installments, state.purchases);
          const usedPct = summary.totalLimit > 0
            ? Math.min((summary.usedLimit / summary.totalLimit) * 100, 100)
            : 0;
          const overLimit = usedPct > 80;

          return (
            <Link
              key={card.id}
              href={`/cartoes/${card.id}`}
              className={`card fade-up-${Math.min(i + 2, 5)}`}
              style={{ padding: "18px", cursor: "pointer", transition: "opacity 0.15s", display: "block", textDecoration: "none" }}
            >
              {/* Nome + fatura atual */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "10px", flexShrink: 0,
                    background: `${card.color}22`, border: `1px solid ${card.color}44`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: card.color,
                  }}>
                    <CreditCardIcon size={20} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)" }}>{card.name}</p>
                    <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                      {card.brand} •••• {card.lastDigits}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px" }}>Fatura atual</p>
                  <p className="mono" style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)" }}>
                    R$ {fmt(summary.currentInvoiceAmount)}
                  </p>
                </div>
              </div>

              {/* Limit bar */}
              <div style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "10px", color: "var(--text-3)" }}>Limite usado</span>
                  <span className="mono" style={{ fontSize: "10px", fontWeight: 700, color: overLimit ? "var(--red)" : card.color }}>
                    {Math.round(usedPct)}%
                  </span>
                </div>
                <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${usedPct}%`,
                    background: overLimit ? "var(--red)" : card.color,
                    borderRadius: "2px", transition: "width 0.3s",
                  }} />
                </div>
              </div>

              {/* Disponível / Usado / Limite */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                <div>
                  <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px" }}>Disponível</p>
                  <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--green)" }}>
                    R$ {fmt(summary.availableLimit)}
                  </p>
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px" }}>Usado</p>
                  <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--red)" }}>
                    R$ {fmt(summary.usedLimit)}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px" }}>Limite</p>
                  <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-2)" }}>
                    R$ {fmt(summary.totalLimit)}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
