"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import type { Account } from "@/context/AppContext";
import {
  getCurrentBalance, getProjectedBalance, getAvailableBalance,
} from "@/engine/financialEngine";
import { Landmark, Pencil } from "lucide-react";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const typeLabels: Record<Account["type"], string> = {
  checking:   "Conta Corrente",
  savings:    "Poupança",
  wallet:     "Carteira",
  investment: "Investimentos",
};

export default function Contas() {
  const router = useRouter();
  const { state } = useApp();

  const eom = useMemo(() => {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return last.toISOString().split("T")[0];
  }, []);

  const totalCurrent = useMemo(() =>
    state.accounts.filter(a => a.active).reduce((s, a) => s + getCurrentBalance(a, state.transactions), 0),
    [state.accounts, state.transactions]
  );
  const totalProjected = useMemo(() =>
    state.accounts.filter(a => a.active).reduce((s, a) => s + getProjectedBalance(a, state.transactions, eom, state.cards, state.installments), 0),
    [state.accounts, state.transactions, state.cards, state.installments, eom]
  );

  return (
    <div style={{ padding: "20px 16px", maxWidth: "900px" }}>

      <div className="fade-up-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em" }}>Contas</h1>
          <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "3px" }}>
            {state.accounts.length} conta{state.accounts.length !== 1 ? "s" : ""} cadastrada{state.accounts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => router.push("/contas/nova")}
        >
          + Nova conta
        </button>
      </div>

      {/* Resumo total */}
      <div className="fade-up-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
        <div className="card" style={{ padding: "20px" }}>
          <p style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
            Saldo total atual
          </p>
          <p className="mono" style={{ fontSize: "28px", fontWeight: 700, color: totalCurrent >= 0 ? "var(--green)" : "var(--red)", letterSpacing: "-0.03em" }}>
            R$ {fmt(totalCurrent)}
          </p>
          <p style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "6px" }}>Apenas transações pagas</p>
        </div>
        <div className="card" style={{ padding: "20px" }}>
          <p style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
            Projetado (fim do mês)
          </p>
          <p className="mono" style={{ fontSize: "28px", fontWeight: 700, color: totalProjected >= 0 ? "var(--text-1)" : "var(--red)", letterSpacing: "-0.03em" }}>
            R$ {fmt(totalProjected)}
          </p>
          <p style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "6px" }}>Incluindo pendentes do mês</p>
        </div>
      </div>

      {/* Estado vazio */}
      {state.accounts.length === 0 && (
        <div className="card" style={{ padding: "48px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px", color: "var(--text-3)" }}>
            <Landmark size={48} strokeWidth={1.5} />
          </div>
          <p style={{ color: "var(--text-2)", fontSize: "15px", fontWeight: 600 }}>Nenhuma conta cadastrada</p>
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginTop: "6px", marginBottom: "20px" }}>
            Adicione suas contas bancárias para calcular saldos automaticamente.
          </p>
          <button className="btn-primary" onClick={() => router.push("/contas/nova")}>+ Adicionar conta</button>
        </div>
      )}

      {/* Lista de contas */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {state.accounts.map((acc, i) => {
          const current   = getCurrentBalance(acc, state.transactions);
          const projected = getProjectedBalance(acc, state.transactions, eom, state.cards, state.installments);
          const available = getAvailableBalance(acc, state.transactions, state.goals, eom, state.cards, state.installments);
          const reserved  = projected - available;
          return (
            <div key={acc.id} className={`card fade-up-${Math.min(i + 2, 6)}`} style={{ padding: "22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div style={{
                    width: "48px", height: "48px", borderRadius: "14px", flexShrink: 0,
                    background: `${acc.color}18`, border: `1px solid ${acc.color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px",
                  }}>{acc.icon}</div>
                  <div>
                    <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)" }}>{acc.name}</p>
                    <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
                      {typeLabels[acc.type]}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/contas/${acc.id}/editar`)}
                  style={{
                    background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
                    borderRadius: "8px", color: "var(--text-2)",
                    cursor: "pointer", fontSize: "13px", fontWeight: 600,
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "8px 12px", minHeight: "36px", fontFamily: "inherit",
                  }}
                >
                  <Pencil size={13} strokeWidth={1.5} /> Editar
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
                {[
                  { label: "Saldo atual",  value: current,   color: current >= 0   ? "var(--green)"  : "var(--red)", help: "Transações pagas" },
                  { label: "Projetado",    value: projected, color: projected >= 0  ? "var(--text-1)" : "var(--red)", help: "Com pendentes do mês" },
                  { label: "Disponível",   value: available, color: available >= 0  ? "var(--accent)" : "var(--red)", help: `Reservado para metas: R$ ${fmt(reserved)}` },
                ].map((metric, j) => (
                  <div key={j} style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
                    borderRadius: "12px", padding: "14px 16px",
                  }}>
                    <p style={{ fontSize: "10.5px", color: "var(--text-3)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "6px" }}>
                      {metric.label}
                    </p>
                    <p className="mono" style={{ fontSize: "18px", fontWeight: 700, color: metric.color, letterSpacing: "-0.02em" }}>
                      R$ {fmt(metric.value)}
                    </p>
                    <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginTop: "4px" }}>{metric.help}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
