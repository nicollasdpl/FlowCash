"use client";
import { useParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import BudgetFormPage from "@/components/BudgetFormPage";

export default function EditarOrcamentoPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useApp();
  const budget = state.budgets.find(b => b.id === id);

  if (!budget) {
    return (
      <div style={{ padding: "40px 16px", textAlign: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "14px" }}>Orçamento não encontrado.</p>
      </div>
    );
  }

  return <BudgetFormPage budget={budget} month={budget.month} />;
}
