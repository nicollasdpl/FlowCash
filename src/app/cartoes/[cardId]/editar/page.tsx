"use client";
import { useParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import CardFormPage from "@/components/CardFormPage";

export default function EditarCartaoPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const { state } = useApp();
  const card = state.cards.find(c => c.id === cardId);

  if (!card) {
    return (
      <div style={{ padding: "40px 16px", textAlign: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "14px" }}>Cartão não encontrado.</p>
      </div>
    );
  }

  return <CardFormPage card={card} />;
}
