"use client";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Target, Pencil, Trash2, CheckCircle } from "lucide-react";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string) {
  if (!d || d === "2099-12-31") return "Sem prazo";
  const [y, m] = d.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[parseInt(m) - 1]} ${y}`;
}

export default function Metas() {
  const router = useRouter();
  const { state, dispatch } = useApp();

  const totalReserved = state.goals
    .filter(g => !g.completed)
    .reduce((s, g) => s + g.currentAmount, 0);

  const totalTarget = state.goals.reduce((s, g) => s + g.targetAmount, 0);

  return (
    <div style={{ padding: "20px 16px", maxWidth: "900px", margin: "0 auto" }}>

      <div className="fade-up-1" style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em" }}>Metas</h1>
          <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
            {state.goals.length} meta{state.goals.length !== 1 ? "s" : ""} cadastrada{state.goals.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button className="btn-primary" onClick={() => router.push("/metas/nova")} style={{ fontSize: "13px", padding: "10px 16px" }}>
          + Nova
        </button>
      </div>

      {/* Summary */}
      {state.goals.length > 0 && (
        <div className="fade-up-1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "8px", marginBottom: "20px" }}>
          {[
            { label: "Reservado", value: totalReserved, color: "var(--green)" },
            { label: "Objetivo", value: totalTarget, color: "var(--text-1)" },
            { label: "Faltando", value: Math.max(totalTarget - totalReserved, 0), color: "var(--amber)" },
          ].map((s, i) => (
            <div key={i} className="card" style={{ padding: "12px 14px" }}>
              <p style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "4px" }}>
                {s.label}
              </p>
              <p className="mono" style={{ fontSize: "15px", fontWeight: 700, color: s.color }}>R$ {fmt(s.value)}</p>
            </div>
          ))}
        </div>
      )}

      {state.goals.length === 0 && (
        <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px", color: "var(--text-3)" }}>
            <Target size={44} strokeWidth={1.5} />
          </div>
          <p style={{ color: "var(--text-2)", fontSize: "15px", fontWeight: 600 }}>Nenhuma meta cadastrada</p>
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginTop: "6px", marginBottom: "20px" }}>
            Defina objetivos financeiros e acompanhe o progresso.
          </p>
          <button className="btn-primary" onClick={() => router.push("/metas/nova")}>+ Criar primeira meta</button>
        </div>
      )}

      {/* Goals */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
        {state.goals.map((goal, i) => {
          const pct = Math.min(Math.round((goal.currentAmount / goal.targetAmount) * 100), 100);
          const done = goal.completed || pct >= 100;
          const account = state.accounts.find(a => a.id === goal.accountId);
          return (
            <div key={goal.id} className={`card fade-up-${Math.min(i + 2, 6)}`} style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
                <div style={{
                  width: "42px", height: "42px", borderRadius: "12px", flexShrink: 0,
                  background: `${goal.color}18`, border: `1px solid ${goal.color}30`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px",
                }}>{goal.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {goal.name}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                    {formatDate(goal.deadline)}
                    {account && <span style={{ marginLeft: "8px" }}>· {account.icon} {account.name}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                  <button
                    onClick={() => router.push(`/metas/${goal.id}/editar`)}
                    style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: "4px 6px", minHeight: "36px", minWidth: "36px", display: "flex", alignItems: "center", justifyContent: "center" }}
                    title="Editar"
                  >
                    <Pencil size={14} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Excluir a meta "${goal.name}"?`)) {
                        dispatch({ type: "DEL_GOAL", payload: goal.id });
                      }
                    }}
                    style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: "4px 6px", minHeight: "36px", minWidth: "36px", display: "flex", alignItems: "center", justifyContent: "center" }}
                    title="Excluir"
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "11.5px", color: "var(--text-3)" }}>Progresso</span>
                <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: done ? "var(--green)" : goal.color }}>
                  {pct}%
                </span>
              </div>

              <div className="progress-bar-bg" style={{ marginBottom: "12px" }}>
                <div
                  className="progress-bar-fill"
                  style={{ width: `${pct}%`, background: done ? "var(--green)" : goal.color, boxShadow: `0 0 8px ${goal.color}55` }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <div>
                  <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "2px" }}>Acumulado</p>
                  <p className="mono" style={{ fontSize: "14px", fontWeight: 700, color: goal.color }}>
                    R$ {fmt(goal.currentAmount)}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "2px" }}>Objetivo</p>
                  <p className="mono" style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-2)" }}>
                    R$ {fmt(goal.targetAmount)}
                  </p>
                </div>
              </div>

              {!done && (
                <div style={{ paddingTop: "12px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ fontSize: "11.5px", color: "var(--text-3)" }}>
                    Faltam <span className="mono" style={{ color: "var(--text-1)", fontWeight: 700 }}>
                      R$ {fmt(goal.targetAmount - goal.currentAmount)}
                    </span>
                  </p>
                  <button
                    onClick={() => router.push(`/metas/${goal.id}/depositar`)}
                    style={{
                      fontSize: "12px", padding: "7px 14px",
                      background: `${goal.color}15`, border: `1px solid ${goal.color}30`,
                      borderRadius: "8px", color: goal.color, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", minHeight: "36px",
                    }}
                  >+ Depositar</button>
                </div>
              )}
              {done && (
                <div style={{ paddingTop: "12px", borderTop: "1px solid var(--border)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <CheckCircle size={14} strokeWidth={1.5} color="var(--green)" />
                  <span style={{ fontSize: "13px", color: "var(--green)", fontWeight: 700 }}>Meta concluída!</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
