"use client";
import { useParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import GoalFormPage from "@/components/GoalFormPage";

export default function EditarMeta() {
  const { id } = useParams<{ id: string }>();
  const { state } = useApp();
  const goal = state.goals.find(g => g.id === id);

  if (!goal) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--text-3)" }}>
        Meta não encontrada.
      </div>
    );
  }

  return <GoalFormPage goal={goal} />;
}
