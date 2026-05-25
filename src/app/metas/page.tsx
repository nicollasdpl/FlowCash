"use client";
import { useState } from "react";
import { useApp, newId } from "@/context/AppContext";
import type { Goal } from "@/context/AppContext";
import GoalModal from "@/components/GoalModal";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string) {
  if (!d || d === "2099-12-31") return "Sem prazo";
  const [y, m] = d.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[parseInt(m) - 1]} ${y}`;
}

function DepositModal({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { dispatch } = useApp();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function handleSave() {
    const n = parseFloat(value);
    if (!value || isNaN(n) || n <= 0) return setError("Informe um valor válido.");
    const newCurrent = Math.min(goal.currentAmount + n, goal.targetAmount);
    dispatch({
      type: "UPD_GOAL",
      payload: { ...goal, currentAmount: newCurrent, completed: newCurrent >= goal.targetAmount },
    });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: "360px" }}>
        <div className="modal-header">
          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)" }}>Adicionar valor</span>
          <button className="btn-secondary" onClick={onClose} style={{ padding: "6px 12px", fontSize: "16px" }}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: "13px", color: "var(--text-2)", marginBottom: "16px" }}>
            Meta: <strong style={{ color: "var(--text-1)" }}>{goal.name}</strong><br />
            Faltam: <span className="mono" style={{ color: goal.color, fontWeight: 700 }}>R$ {fmt(goal.targetAmount - goal.currentAmount)}</span>
          </p>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Valor a adicionar (R$)</label>
            <input className="form-input mono" type="number" placeholder="0,00" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} autoFocus />
          </div>
          {error && <p style={{ color: "var(--red)", fontSize: "12px", marginTop: "10px" }}>{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

export default function Metas() {
  const { state } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [depositGoal, setDepositGoal] = useState<Goal | null>(null);

  const totalReserved = state.goals
    .filter(g => !g.completed)
    .reduce((s, g) => s + g.currentAmount, 0);

  const totalTarget = state.goals.reduce((s, g) => s + g.targetAmount, 0);

  return (
    <div style={{ padding: "28px", maxWidth: "900px" }}>
      {showModal && <GoalModal onClose={() => setShowModal(false)} />}
      {editGoal && <GoalModal goal={editGoal} onClose={() => setEditGoal(null)} />}
      {depositGoal && <DepositModal goal={depositGoal} onClose={() => setDepositGoal(null)} />}

      <div className="fade-up-1" style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em" }}>Metas</h1>
          <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "3px" }}>
            {state.goals.length} meta{state.goals.length !== 1 ? "s" : ""} cadastrada{state.goals.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Nova meta</button>
      </div>

      {/* Summary */}
      {state.goals.length > 0 && (
        <div className="fade-up-1" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "24px" }}>
          {[
            { label: "Total reservado", value: totalReserved, color: "var(--green)" },
            { label: "Total objetivo", value: totalTarget, color: "var(--text-1)" },
            { label: "Faltando", value: Math.max(totalTarget - totalReserved, 0), color: "var(--amber)" },
          ].map((s, i) => (
            <div key={i} className="card" style={{ padding: "16px 18px" }}>
              <p style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "5px" }}>{s.label}</p>
              <p className="mono" style={{ fontSize: "17px", fontWeight: 700, color: s.color }}>R$ {fmt(s.value)}</p>
            </div>
          ))}
        </div>
      )}

      {state.goals.length === 0 && (
        <div className="card" style={{ padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎯</div>
          <p style={{ color: "var(--text-2)", fontSize: "15px", fontWeight: 600 }}>Nenhuma meta cadastrada</p>
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginTop: "6px", marginBottom: "20px" }}>Defina objetivos financeiros e acompanhe o progresso.</p>
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ Criar primeira meta</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {state.goals.map((goal, i) => {
          const pct = Math.min(Math.round((goal.currentAmount / goal.targetAmount) * 100), 100);
          const done = goal.completed || pct >= 100;
          const account = state.accounts.find(a => a.id === goal.accountId);
          return (
            <div key={goal.id} className={`card fade-up-${Math.min(i + 2, 6)}`} style={{ padding: "22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
                <div style={{
                  width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0,
                  background: `${goal.color}18`, border: `1px solid ${goal.color}30`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px",
                }}>{goal.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-1)" }}>{goal.name}</div>
                  <div style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "2px" }}>
                    Prazo: {formatDate(goal.deadline)}
                    {account && <span style={{ marginLeft: "8px" }}>· {account.icon} {account.name}</span>}
                  </div>
                </div>
                <button
                  onClick={() => setEditGoal(goal)}
                  style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: "14px" }}
                >✏️</button>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-3)" }}>Progresso</span>
                <span className="mono" style={{ fontSize: "14px", fontWeight: 700, color: done ? "#22D47A" : goal.color }}>{pct}%</span>
              </div>

              <div className="progress-bar-bg" style={{ marginBottom: "12px" }}>
                <div className="progress-bar-fill" style={{ width: `${pct}%`, background: done ? "#22D47A" : goal.color, boxShadow: `0 0 10px ${goal.color}55` }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px" }}>
                <div>
                  <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginBottom: "2px" }}>Acumulado</p>
                  <p className="mono" style={{ fontSize: "15px", fontWeight: 700, color: goal.color }}>R$ {fmt(goal.currentAmount)}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginBottom: "2px" }}>Objetivo</p>
                  <p className="mono" style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-2)" }}>R$ {fmt(goal.targetAmount)}</p>
                </div>
              </div>

              {!done && (
                <div style={{ paddingTop: "12px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ fontSize: "11.5px", color: "var(--text-3)" }}>
                    Faltam <span className="mono" style={{ color: "var(--text-1)", fontWeight: 700 }}>R$ {fmt(goal.targetAmount - goal.currentAmount)}</span>
                  </p>
                  <button
                    onClick={() => setDepositGoal(goal)}
                    style={{ fontSize: "12px", padding: "5px 12px", background: `${goal.color}15`, border: `1px solid ${goal.color}30`, borderRadius: "8px", color: goal.color, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  >+ Depositar</button>
                </div>
              )}
              {done && (
                <div style={{ paddingTop: "12px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
                  <span style={{ fontSize: "13px", color: "#22D47A", fontWeight: 700 }}>🎉 Meta concluída!</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
