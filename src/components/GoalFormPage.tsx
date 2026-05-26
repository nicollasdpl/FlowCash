"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, newId } from "@/context/AppContext";
import type { Goal } from "@/context/AppContext";

const GOAL_COLORS = ["#00E5C3", "#9B6DFF", "#4B8BF5", "#22D47A", "#F5A623", "#FF4D6A"];
const GOAL_EMOJIS = ["🏦", "✈️", "💻", "🚗", "🏠", "📚", "💍", "🎯", "⚽", "🏋️"];

interface Props {
  goal?: Goal;
}

export default function GoalFormPage({ goal }: Props) {
  const router = useRouter();
  const { state, dispatch } = useApp();

  const [name, setName] = useState(goal?.name ?? "");
  const [emoji, setEmoji] = useState(goal?.emoji ?? "🎯");
  const [targetAmount, setTargetAmount] = useState(goal ? String(goal.targetAmount) : "");
  const [currentAmount, setCurrentAmount] = useState(goal ? String(goal.currentAmount) : "0");
  const [deadline, setDeadline] = useState(goal?.deadline && goal.deadline !== "2099-12-31" ? goal.deadline : "");
  const [accountId, setAccountId] = useState(goal?.accountId ?? (state.accounts[0]?.id ?? ""));
  const [color, setColor] = useState(goal?.color ?? GOAL_COLORS[0]);
  const [error, setError] = useState("");

  const isEdit = !!goal;

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
    dispatch({ type: isEdit ? "UPD_GOAL" : "ADD_GOAL", payload: g });
    router.back();
  }

  function handleDelete() {
    if (!goal) return;
    if (!confirm(`Excluir a meta "${goal.name}"?`)) return;
    dispatch({ type: "DEL_GOAL", payload: goal.id });
    router.back();
  }

  return (
    <>
      {/* ── Sticky header ── */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "var(--bg)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "0 8px 0 4px",
        height: "60px",
        flexShrink: 0,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: "none", border: "none", color: "var(--text-2)",
            cursor: "pointer", fontSize: "24px",
            width: "48px", height: "48px", borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
        >‹</button>
        <span style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-1)", flex: 1 }}>
          {isEdit ? "Editar meta" : "Nova meta"}
        </span>
        {isEdit && (
          <button
            onClick={handleDelete}
            style={{
              background: "var(--red-10)", border: "1px solid var(--red-20)",
              borderRadius: "10px", color: "var(--red)",
              padding: "8px 14px", fontSize: "13px", fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", touchAction: "manipulation",
            }}
          >Excluir</button>
        )}
      </div>

      {/* ── Form ── */}
      <div style={{ padding: "20px 16px 140px" }}>

        {/* Emoji */}
        <div className="form-group">
          <label className="form-label">Emoji</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {GOAL_EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                style={{
                  width: "44px", height: "44px", borderRadius: "12px", fontSize: "20px",
                  background: emoji === e ? "var(--accent-10)" : "rgba(255,255,255,0.04)",
                  border: emoji === e ? "1px solid var(--border-accent)" : "1px solid var(--border)",
                  cursor: "pointer", touchAction: "manipulation",
                }}
              >{e}</button>
            ))}
          </div>
        </div>

        {/* Nome */}
        <div className="form-group">
          <label className="form-label">Nome da meta</label>
          <input
            className="form-input"
            type="text"
            placeholder="Ex: Reserva de emergência, Viagem..."
            value={name}
            onChange={e => setName(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
          />
        </div>

        {/* Valores */}
        <div className="form-row">
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Valor objetivo (R$)</label>
            <input
              className="form-input mono"
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              placeholder="0,00"
              value={targetAmount}
              onChange={e => setTargetAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
              autoComplete="off"
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Já guardado (R$)</label>
            <input
              className="form-input mono"
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              placeholder="0,00"
              value={currentAmount}
              onChange={e => setCurrentAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Prazo */}
        <div className="form-group">
          <label className="form-label">Prazo (opcional)</label>
          <input
            className="form-input"
            type="date"
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
          />
        </div>

        {/* Conta */}
        <div className="form-group">
          <label className="form-label">Conta vinculada</label>
          <select className="form-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
            {state.accounts.filter(a => a.active).map(a => (
              <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
            ))}
          </select>
        </div>

        {/* Cor */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Cor</label>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {GOAL_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: "36px", height: "36px", borderRadius: "10px",
                  background: c, border: "none", cursor: "pointer",
                  outline: color === c ? "3px solid white" : "none",
                  outlineOffset: "2px", transition: "outline 0.15s",
                  touchAction: "manipulation",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA fixo no fundo ── */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "var(--bg)",
        borderTop: "1px solid var(--border)",
        padding: "12px 16px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}>
        {error && (
          <p style={{ color: "var(--red)", fontSize: "13px", fontWeight: 600, textAlign: "center" }}>{error}</p>
        )}
        <button
          className="btn-primary"
          onClick={handleSave}
          style={{ width: "100%", textAlign: "center", justifyContent: "center" }}
        >
          {isEdit ? "Salvar alterações" : "Criar meta"}
        </button>
      </div>
    </>
  );
}
