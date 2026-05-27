"use client";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import CategoryFormPage from "@/components/CategoryFormPage";

export default function EditarCategoriaPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useApp();
  const router = useRouter();

  const category = state.categories.find(c => c.id === id);

  if (!category) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "14px", marginBottom: "16px" }}>
          Categoria não encontrada.
        </p>
        <button
          onClick={() => router.push("/configuracoes")}
          style={{
            background: "none", border: "none", color: "var(--accent)",
            cursor: "pointer", fontSize: "14px", fontFamily: "inherit",
          }}
        >
          ← Voltar
        </button>
      </div>
    );
  }

  return <CategoryFormPage category={category} />;
}
