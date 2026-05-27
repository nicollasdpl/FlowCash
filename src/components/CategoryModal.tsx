"use client";
import { useState } from "react";
import { useApp, newId } from "@/context/AppContext";
import type { Category } from "@/context/AppContext";
import {
  UtensilsCrossed, Coffee, Pizza, ShoppingCart,
  Car, Bus, Bike, Fuel,
  Heart, Activity, Pill, Stethoscope,
  Home, Zap, Wifi, Wrench,
  Gamepad2, Music, Film, Tv,
  CreditCard, Wallet, TrendingUp, DollarSign,
  Tag, Star, Gift, Package,
  type LucideIcon,
} from "lucide-react";

const ICON_GROUPS: { label: string; icons: [string, LucideIcon][] }[] = [
  { label: "Alimentação", icons: [["UtensilsCrossed", UtensilsCrossed], ["Coffee", Coffee], ["Pizza", Pizza], ["ShoppingCart", ShoppingCart]] },
  { label: "Transporte",  icons: [["Car", Car], ["Bus", Bus], ["Bike", Bike], ["Fuel", Fuel]] },
  { label: "Saúde",       icons: [["Heart", Heart], ["Activity", Activity], ["Pill", Pill], ["Stethoscope", Stethoscope]] },
  { label: "Moradia",     icons: [["Home", Home], ["Zap", Zap], ["Wifi", Wifi], ["Wrench", Wrench]] },
  { label: "Lazer",       icons: [["Gamepad2", Gamepad2], ["Music", Music], ["Film", Film], ["Tv", Tv]] },
  { label: "Finanças",    icons: [["CreditCard", CreditCard], ["Wallet", Wallet], ["TrendingUp", TrendingUp], ["DollarSign", DollarSign]] },
  { label: "Outros",      icons: [["Tag", Tag], ["Star", Star], ["Gift", Gift], ["Package", Package]] },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  ICON_GROUPS.flatMap(g => g.icons)
);

const COLOR_OPTIONS = [
  "#00E5A0","#4A9EFF","#FF4D6A","#FFB830","#A855F7","#FF8C42",
  "#00BCD4","#E91E63","#8BC34A","#FF5722","#607D8B","#9C27B0",
  "#03A9F4","#CDDC39","#FF9800","#795548",
];

function isLucideName(icon: string): boolean {
  return icon in ICON_MAP;
}

function IconPreview({ icon, color, size = 20 }: { icon: string; color: string; size?: number }) {
  if (isLucideName(icon)) {
    const Comp = ICON_MAP[icon];
    return <Comp size={size} strokeWidth={1.5} color={color} />;
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>;
}

interface Props {
  category?: Category;
  onClose: () => void;
}

export default function CategoryModal({ category, onClose }: Props) {
  const { dispatch } = useApp();
  const [name, setName]   = useState(category?.name ?? "");
  const [icon, setIcon]   = useState(category?.icon ?? "Tag");
  const [color, setColor] = useState(category?.color ?? "#00E5A0");
  const [hexInput, setHexInput] = useState(category?.color ?? "#00E5A0");
  const [type, setType]   = useState<"expense" | "income">(category?.type ?? "expense");
  const [error, setError] = useState("");

  function selectColor(c: string) {
    setColor(c);
    setHexInput(c);
  }

  function handleHexChange(value: string) {
    setHexInput(value);
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) setColor(value);
  }

  function handleSave() {
    if (!name.trim()) return setError("Informe o nome da categoria.");
    setError("");
    const cat: Category = {
      id: category?.id ?? newId(),
      name: name.trim(),
      icon,
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
          {/* Preview */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "10px",
              padding: "10px 20px",
              background: `${color}18`,
              border: `1px solid ${color}35`,
              borderRadius: "24px",
              minWidth: "120px", justifyContent: "center",
            }}>
              <IconPreview icon={icon} color={color} size={20} />
              <span style={{ fontSize: "14px", fontWeight: 700, color }}>
                {name.trim() || "Categoria"}
              </span>
            </div>
          </div>

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

          {/* Ícone */}
          <div className="form-group">
            <label className="form-label">Ícone</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {ICON_GROUPS.map(group => (
                <div key={group.label}>
                  <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {group.label}
                  </p>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {group.icons.map(([name, Comp]) => {
                      const selected = icon === name;
                      return (
                        <button
                          key={name}
                          onClick={() => setIcon(name)}
                          style={{
                            width: "48px", height: "48px",
                            borderRadius: "12px",
                            border: selected ? `2px solid ${color}` : "1px solid var(--border)",
                            background: selected ? `${color}18` : "var(--bg-input)",
                            cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: selected ? color : "var(--text-3)",
                            transition: "all 0.12s",
                            flexShrink: 0,
                          }}
                        >
                          <Comp size={20} strokeWidth={1.5} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cor */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cor</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c}
                  onClick={() => selectColor(c)}
                  style={{
                    width: "34px", height: "34px", borderRadius: "50%",
                    background: c, border: "none", cursor: "pointer", flexShrink: 0,
                    boxShadow: color === c ? `0 0 0 3px var(--bg), 0 0 0 5px ${c}` : "none",
                    transition: "box-shadow 0.12s",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "34px", height: "34px", borderRadius: "8px",
                background: color, flexShrink: 0,
                border: "1px solid var(--border)",
              }} />
              <input
                className="form-input mono"
                type="text"
                placeholder="#000000"
                value={hexInput}
                onChange={e => handleHexChange(e.target.value)}
                maxLength={7}
                style={{ flex: 1, fontSize: "13px", height: "34px", padding: "0 10px" }}
              />
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
