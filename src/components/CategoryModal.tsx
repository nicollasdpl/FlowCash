"use client";
import { useState } from "react";
import { useApp, newId } from "@/context/AppContext";
import type { Category } from "@/context/AppContext";

const EMOJI_OPTIONS = [
  "🍔","🛒","🚗","🚌","💊","🏠","📚","👕","📱","🎮","🎬","✈️",
  "☕","🍕","💪","🐾","🎁","💡","🔧","🧾","💰","💻","📈","💳",
];

const COLOR_OPTIONS = [
  "#00E5C3","#21D97A","#4B8BF5","#9B6DFF","#F59E0B",
  "#FF3D5E","#FF8C42","#6B7FA3","#22D4D4","#E040FB",
];

interface Props {
  category?: Category;
  onClose: () => void;
}

export default function CategoryModal({ category, onClose }: Props) {
  const { dispatch } = useApp();
  const [name, setName] = useState(category?.name ?? "");
  const [emoji, setEmoji] = useState(category?.icon ?? "🍔");
  const [color, setColor] = useState(category?.color ?? "#00E5C3");
  const [type, setType] = useState<"expense" | "income">(category?.type ?? "expense");
  const [error, setError] = useState("");

  function handleSave() {
    if (!name.trim()) return setError("Informe o nome da categoria.");
    setError("");
    const cat: Category = {
      id: category?.id ?? newId(),
      name: name.trim(),
      icon: emoji,
      color,
      type,
    };
    dispatch({ type: category ? "UPD_CATEGORY" : "ADD_CATEGORY", payload: cat });
    onClose();
  }

  function handleDelete() {
    if (!category) return;
    if (!confirm("Excluir esta categoria? As transações com ela não serão apagadas.")) return;
    dispatch({ type: "DEL_CATEGORY", payload: category.id });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)" }}>
            {category ? "Editar categoria" : "Nova categoria"}
          </span>
          <button className="btn-secondary" onClick={onClose} style={{ padding: "6px 12px", fontSize: "18px", minHeight: "40px" }}>×</button>
        </div>

        <div className="modal-body">
          {/* Tipo */}
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <div className="type-toggle">
              <button
                className={`type-toggle-btn${type === "expense" ? " active-expense" : ""}`}
                onClick={() => setType("expense")}
                style={{ touchAction: "manipulation" }}
              >↓ Despesa</button>
              <button
                className={`type-toggle-btn${type === "income" ? " active-income" : ""}`}
                onClick={() => setType("income")}
                style={{ touchAction: "manipulation" }}
              >↑ Receita</button>
            </div>
          </div>

          {/* Nome */}
          <div className="form-group">
            <label className="form-label">Nome</label>
            <input
              className="form-input"
              type="text"
              inputMode="text"
              placeholder="Ex: Alimentação, Salário..."
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
            />
          </div>

          {/* Preview */}
          {name.trim() && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "8px",
                padding: "8px 16px",
                background: `${color}12`,
                border: `1px solid ${color}28`,
                borderRadius: "20px",
              }}>
                <span style={{ fontSize: "16px" }}>{emoji}</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color }}>{name}</span>
              </div>
            </div>
          )}

          {/* Emoji picker */}
          <div className="form-group">
            <label className="form-label">Ícone</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  style={{
                    width: "44px", height: "44px",
                    borderRadius: "10px", fontSize: "20px",
                    border: emoji === e ? `2px solid ${color}` : "1px solid var(--border)",
                    background: emoji === e ? `${color}15` : "var(--bg-input)",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.12s",
                  }}
                >{e}</button>
              ))}
            </div>
          </div>

          {/* Cor */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cor</label>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: "36px", height: "36px", borderRadius: "50%",
                    background: c, border: "none", cursor: "pointer",
                    boxShadow: color === c ? `0 0 0 3px var(--bg), 0 0 0 5px ${c}` : "none",
                    transition: "box-shadow 0.12s",
                  }}
                />
              ))}
            </div>
          </div>

          {error && <p style={{ color: "var(--red)", fontSize: "13px", marginTop: "14px", fontWeight: 600 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          {category && (
            <button className="btn-danger" onClick={handleDelete} style={{ marginRight: "auto", padding: "0 14px" }}>
              Excluir
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>
            {category ? "Salvar" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
