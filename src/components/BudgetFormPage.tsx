"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, newId } from "@/context/AppContext";
import type { Budget } from "@/context/AppContext";

interface Props {
  budget?: Budget;
  month: string;
}

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function monthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export default function BudgetFormPage({ budget, month }: Props) {
  const router = useRouter();
  const { state, dispatch } = useApp();

  const expenseCategories = state.categories.filter(c => c.type === "expense");
  const usedCategoryIds = new Set(
    state.budgets.filter(b => b.month === month && b.id !== budget?.id).map(b => b.categoryId)
  );
  const selectableCategories = budget
    ? expenseCategories
    : expenseCategories.filter(c => !usedCategoryIds.has(c.id));

  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? selectableCategories[0]?.id ?? "");
  const [limitAmount, setLimitAmount] = useState(budget ? String(budget.limitAmount) : "");
  const [error, setError] = useState("");

  const isEdit = !!budget;
  const selectedCat = state.categories.find(c => c.id === categoryId);

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
    dispatch({ type: isEdit ? "UPD_BUDGET" : "ADD_BUDGET", payload: b });
    router.back();
  }

  function handleDelete() {
    if (!budget) return;
    if (!confirm("Excluir este orçamento? Esta ação não pode ser desfeita.")) return;
    dispatch({ type: "DEL_BUDGET", payload: budget.id });
    router.back();
  }

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
          {isEdit ? "Editar orçamento" : "Novo orçamento"}
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

      <div style={{ padding: "20px 16px 140px" }}>
        <div style={{
          padding: "10px 14px",
          background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
          borderRadius: "10px", marginBottom: "20px",
        }}>
          <p style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "2px" }}>
            Mês de referência
          </p>
          <p style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-1)" }}>{monthLabel(month)}</p>
        </div>

        <div className="form-group">
          <label className="form-label">Categoria</label>
          <select
            className="form-input"
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            disabled={isEdit}
          >
            {selectableCategories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Limite mensal (R$)</label>
          {selectedCat && (
            <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "8px" }}>
              {selectedCat.icon} Gasto máximo em{" "}
              <strong style={{ color: selectedCat.color }}>{selectedCat.name}</strong>
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
          {isEdit ? "Salvar alterações" : "Criar orçamento"}
        </button>
      </div>
    </>
  );
}
