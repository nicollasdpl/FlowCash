"use client";
import { useState } from "react";
import { useApp, newId } from "@/context/AppContext";
import type { Budget } from "@/context/AppContext";
import { currentMonth } from "@/engine/financialEngine";

interface Props {
  budget?: Budget;
  month: string;
  onClose: () => void;
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BudgetModal({ budget, month, onClose }: Props) {
  const { state, dispatch } = useApp();
  const expenseCategories = state.categories.filter(c => c.type === "expense");

  const [categoryId, setCategoryId] = useState(
    budget?.categoryId ?? expenseCategories[0]?.id ?? ""
  );
  const [limitAmount, setLimitAmount] = useState(
    budget ? String(budget.limitAmount) : ""
  );
  const [error, setError] = useState("");

  function handleSave() {
    const amt = parseFloat(limitAmount.replace(",", "."));
    if (!limitAmount || isNaN(amt) || amt <= 0) return setError("Informe um valor válido.");
    if (!categoryId) return setError("Selecione uma categoria.");
    setError("");

    const b: Budget = {
      id: budget?.id ?? newId(),
      categoryId,
      limitAmount: amt,
      month,
    };
    dispatch({ type: budget ? "UPD_BUDGET" : "ADD_BUDGET", payload: b });
    onClose();
  }

  function handleDelete() {
    if (!budget) return;
    dispatch({ type: "DEL_BUDGET", payload: budget.id });
    onClose();
  }

  const selectedCat = state.categories.find(c => c.id === categoryId);

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)" }}>
            {budget ? "Editar orçamento" : "Novo orçamento"}
          </span>
          <button className="btn-secondary" onClick={onClose} style={{ padding: "6px 12px", fontSize: "18px", minHeight: "40px" }}>×</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Categoria</label>
            <select
              className="form-input"
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              disabled={!!budget}
            >
              {expenseCategories.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Limite mensal (R$)</label>
            {selectedCat && (
              <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "8px" }}>
                {selectedCat.icon} Gasto máximo em <strong style={{ color: selectedCat.color }}>{selectedCat.name}</strong>
              </p>
            )}
            <input
              className="form-input mono"
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              placeholder="0,00"
              value={limitAmount}
              onChange={e => setLimitAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
              autoComplete="off"
              style={{ fontSize: "22px" }}
            />
          </div>

          {error && <p style={{ color: "var(--red)", fontSize: "13px", marginTop: "14px", fontWeight: 600 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          {budget && (
            <button className="btn-danger" onClick={handleDelete} style={{ marginRight: "auto", padding: "0 14px" }}>
              Excluir
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>
            {budget ? "Salvar" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
