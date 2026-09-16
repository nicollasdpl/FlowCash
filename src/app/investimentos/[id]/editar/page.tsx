"use client";
import { useParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import InvestmentBoxFormPage from "@/components/InvestmentBoxFormPage";

export default function EditarCaixinhaPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useApp();
  const account = state.accounts.find(a => a.id === id && a.type === "investment");

  if (!account) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--text-3)" }}>
        Caixinha não encontrada.
      </div>
    );
  }

  return <InvestmentBoxFormPage account={account} />;
}
