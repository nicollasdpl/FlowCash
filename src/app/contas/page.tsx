"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import type { Account } from "@/context/AppContext";
import {
  getCurrentBalance, getProjectedBalance, getAvailableBalance,
  fmt, isBalanceNegative, isBalancePositive,
} from "@/engine/financialEngine";
import { Landmark, Pencil } from "lucide-react";
import CategoryIcon, { isLucideIcon } from "@/components/CategoryIcon";

function balanceColor(
  v: number,
  positive: string,
  zero: string = "var(--text-1)",
): string {
  if (isBalanceNegative(v)) return "var(--red)";
  if (isBalancePositive(v)) return positive;
  return zero;
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

      <div className="page-header">
        <div>
          <h1 className="page-title">Contas</h1>
          <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "3px" }}>
            {state.accounts.length} conta{state.accounts.length !== 1 ? "s" : ""} cadastrada{state.accounts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          className="icon-btn primary"
          onClick={() => router.push("/contas/nova")}
          aria-label="Nova conta"
          style={{ fontSize: "24px", fontWeight: 500 }}
        >+</button>
      </div>

      {/* Resumo total */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
        <div className="soft-card" style={{ padding: "20px" }}>
          <p className="section-heading">
            Soma de todas as contas
          </p>
          <p className="mono" style={{ fontSize: "28px", fontWeight: 700, color: balanceColor(totalCurrent, "var(--green)"), letterSpacing: "-0.03em" }}>
            R$ {fmt(totalCurrent)}
          </p>
          <p style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "6px" }}>Não é o saldo de uma conta só — veja cada uma abaixo</p>
        </div>
        <div className="soft-card" style={{ padding: "20px" }}>
          <p className="section-heading">
            Projetado (fim do mês)
          </p>
          <p className="mono" style={{ fontSize: "28px", fontWeight: 700, color: balanceColor(totalProjected, "var(--text-1)"), letterSpacing: "-0.03em" }}>
            R$ {fmt(totalProjected)}
          </p>
          <p style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "6px" }}>Incluindo pendentes do mês</p>
        </div>
      </div>

      {/* Estado vazio */}
      {state.accounts.length === 0 && (
        <div className="soft-card" style={{ padding: "48px", textAlign: "center" }}>
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
        {state.accounts.map((acc) => {
          const current   = getCurrentBalance(acc, state.transactions);
          const projected = getProjectedBalance(acc, state.transactions, eom, state.cards, state.installments);
          const available = getAvailableBalance(acc, state.transactions, state.goals, eom, state.cards, state.installments);
          const reserved  = projected - available;
          return (
            <div key={acc.id} className="soft-card" style={{ padding: "22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div style={{
                    width: "48px", height: "48px", borderRadius: "14px", flexShrink: 0,
                    background: `${acc.color}18`, border: `1px solid ${acc.color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <CategoryIcon
                      icon={
                        isLucideIcon(acc.icon)
                          ? acc.icon
                          : acc.type === "investment"
                            ? "PiggyBank"
                            : "Landmark"
                      }
                      color={acc.color}
                      size={22}
                    />
                  </div>
                  <div>
                    <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)" }}>{acc.name}</p>
                    <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
                      {typeLabels[acc.type]}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  {acc.type === "investment" && (
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() => router.push(`/investimentos/${acc.id}`)}
                      style={{ color: "var(--accent)", borderColor: "var(--border-accent)", background: "var(--accent-10)" }}
                    >
                      Caixinha →
                    </button>
                  )}
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => router.push(
                      acc.type === "investment"
                        ? `/investimentos/${acc.id}/editar`
                        : `/contas/${acc.id}/editar`
                    )}
                  >
                    <Pencil size={13} strokeWidth={1.5} /> Editar
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
                {[
                  { label: "Saldo atual",  value: current,   color: balanceColor(current, "var(--green)"), help: "Transações pagas" },
                  { label: "Projetado",    value: projected, color: balanceColor(projected, "var(--text-1)"), help: "Com pendentes do mês" },
                  { label: "Disponível",   value: available, color: balanceColor(available, "var(--accent)"), help: `Reservado para metas: R$ ${fmt(reserved)}` },
                ].map((metric, j) => (
                  <div key={j} style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
                    borderRadius: "12px", padding: "14px 16px",
                  }}>
                    <p className="section-heading" style={{ marginBottom: "6px" }}>
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
