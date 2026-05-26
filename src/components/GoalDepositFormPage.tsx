"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";

interface Props {
  goalId: string;
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function GoalDepositFormPage({ goalId }: Props) {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const goal = state.goals.find(g => g.id === goalId);

  function handleSave() {
    if (!goal) return;
    const n = parseFloat(value.replace(",", "."));
    if (!value || isNaN(n) || n <= 0) return setError("Informe um valor válido.");
    const newCurrent = Math.min(goal.currentAmount + n, goal.targetAmount);
    dispatch({
      type: "UPD_GOAL",
      payload: { ...goal, currentAmount: newCurrent, completed: newCurrent >= goal.targetAmount },
    });
    router.back();
  }

  if (!goal) {
    return (
      <div style={{ padding: "40px 16px", textAlign: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "14px" }}>Meta não encontrada.</p>
      </div>
    );
  }

  const remaining = goal.targetAmount - goal.currentAmount;

  return (
    <>
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--bg)", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: "4px",
        padding: "0 8px 0 4px", height: "60px", flexShrink: 0,
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
          {goal.emoji} Adicionar valor
        </span>
      </div>

      <div style={{ padding: "20px 16px 140px" }}>
        <div style={{
          padding: "16px",
          background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
          borderRadius: "12px", marginBottom: "24px",
        }}>
          <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
            Meta: <strong style={{ color: "var(--text-1)" }}>{goal.name}</strong>
          </p>
          <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "4px" }}>
            Faltam:{" "}
            <span className="mono" style={{ color: goal.color, fontWeight: 700 }}>
              R$ {fmt(remaining)}
            </span>
          </p>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Valor a adicionar (R$)</label>
          <input
            className="form-input mono"
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            placeholder="0,00"
            value={value}
            onChange={e => setValue(e.target.value.replace(/[^0-9.,]/g, ""))}
            autoComplete="off"
            style={{ fontSize: "24px" }}
            autoFocus
          />
        </div>
      </div>

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
        background: "var(--bg)", borderTop: "1px solid var(--border)",
        padding: "12px 16px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        display: "flex", flexDirection: "column", gap: "8px",
      }}>
        {error && (
          <p style={{ color: "var(--red)", fontSize: "13px", fontWeight: 600, textAlign: "center" }}>
            {error}
          </p>
        )}
        <button
          className="btn-primary"
          onClick={handleSave}
          style={{ width: "100%", textAlign: "center", justifyContent: "center" }}
        >
          Confirmar depósito
        </button>
      </div>
    </>
  );
}
