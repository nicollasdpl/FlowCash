"use client";
import { useParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import TransactionFormPage from "@/components/TransactionFormPage";

export default function EditarTransacao() {
  const { id } = useParams<{ id: string }>();
  const { state } = useApp();
  const tx = state.transactions.find(t => t.id === id);

  if (!tx) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--text-3)" }}>
        Transação não encontrada.
      </div>
    );
  }

  return <TransactionFormPage transaction={tx} />;
}
