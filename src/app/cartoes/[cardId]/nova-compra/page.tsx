"use client";
import { useParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import PurchaseFormPage from "@/components/PurchaseFormPage";

export default function NovaCompra() {
  const { cardId } = useParams<{ cardId: string }>();
  const { state } = useApp();
  const card = state.cards.find(c => c.id === cardId);

  if (!card) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--text-3)" }}>
        Cartão não encontrado.
      </div>
    );
  }

  return <PurchaseFormPage card={card} />;
}
