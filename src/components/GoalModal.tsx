"use client";
import { useState, useEffect } from "react";
import { useApp, newId } from "@/context/AppContext";
import type { Goal } from "@/context/AppContext";

const GOAL_COLORS = ["#00E5C3", "#9B6DFF", "#4B8BF5", "#22D47A", "#F5A623", "#FF4D6A"];
const GOAL_EMOJIS = ["🏦", "✈️", "💻", "🚗", "🏠", "📚", "💍", "🎯", "⚽", "🏋️"];

interface Props {
  goal?: Goal;
  onClose: () => void;
}

export default function GoalModal({ goal, onClose }: Props) {
  const { state, dispatch } = useApp();

  const [name, setName] = useState(goal?.name ?? "");
  const [emoji, setEmoji] = useState(goal?.emoji ?? "🎯");
  const [targetAmount, setTargetAmount] = useState(goal ? String(goal.targetAmount) : "");
  const [currentAmount, setCurrentAmount] = useState(goal ? String(goal.currentAmount) : "0");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [accountId, setAccountId] = useState(
    goal?.accountId ?? (state.accounts[0]?.id ?? "")
  );
  const [color, setColor] = useState(goal?.color ?? GOAL_COLORS[0]);
  const [error, setError] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function handleSave() {
    if (!name.trim()) return setError("Informe o nome da meta.");
    const ta = parseFloat(targetAmount.replace(",", "."));
    if (!targetAmount || isNaN(ta) || ta <= 0) return setError("Informe o valor objetivo.");
    setError("");

    const ca = parseFloat(currentAmount.replace(",", ".")) || 0;
    const g: Goal = {
      id: goal?.id ?? newId(),
      name: name.trim(),
      emoji,
      targetAmount: ta,
      currentAmount: ca,
      deadline: deadline.trim() || "2099-12-31",
      accountId,
      color,
      completed: ca >= ta,
    };
    dispatch({ type: goal ? "UPD_GOAL" : "ADD_GOAL", payload: g });
    onClose();
  }

  function handleDelete() {
    if (!goal) return;
    if (!confirm(`Excluir a meta "${goal.name}"?`)) return;
    dispatch({ type: "DEL_GOAL", payload: goal.id });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)" }}>
            {goal ? "Editar meta" : "Nova meta"}
          </span>
          <button className="btn-secondary" onClick={onClose} style={{ padding: "6px 12px", fontSize: "16px" }}>×</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Emoji</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {GOAL_EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  style={{
                    width: "38px", height: "38px", borderRadius: "10px", fontSize: "18px",
                    background: emoji === e ? "var(--accent-10)" : "rgba(255,255,255,0.04)",
                    border: emoji === e ? "1px solid var(--border-accent)" : "1px solid var(--border)",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >{e}</button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Nome da meta</label>
            <input className="form-input" type="text" placeholder="Ex: Reserva de emergência, Viagem..." value={name} onChange={e => setName(e.target.value)} autoComplete="off" autoCorrect="off" />
          </div>

          <div className="form-row">
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Valor objetivo (R$)</label>
              <input className="form-input mono" type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" placeholder="0,00" value={targetAmount} onChange={e => setTargetAmount(e.target.value.replace(/[^0-9.,]/g, ""))} autoComplete="off" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Já guardado (R$)</label>
              <input className="form-input mono" type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" placeholder="0,00" value={currentAmount} onChange={e => setCurrentAmount(e.target.value.replace(/[^0-9.,]/g, ""))} autoComplete="off" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Prazo (AAAA-MM-DD)</label>
            <input className="form-input" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Conta vinculada</label>
            <select className="form-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
              {state.accounts.filter(a => a.active).map(a => (
                <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cor</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {GOAL_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: "32px", height: "32px", borderRadius: "8px",
                    background: c, border: "none", cursor: "pointer",
                    outline: color === c ? "3px solid white" : "none",
                    outlineOffset: "2px", transition: "outline 0.15s",
                  }}
                />
              ))}
            </div>
          </div>

          {error && <p style={{ color: "var(--red)", fontSize: "12px", marginTop: "12px" }}>{error}</p>}
        </div>

        <div className="modal-footer">
          {goal && <button className="btn-danger" onClick={handleDelete}>Excluir</button>}
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>{goal ? "Salvar" : "Criar meta"}</button>
        </div>
      </div>
    </div>
  );
}
