"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, newId, SEED_CATEGORY_IDS } from "@/context/AppContext";
import type { Category } from "@/context/AppContext";
import CategoryIcon from "@/components/CategoryIcon";

const COLORS = [
  "#00E5A0","#4A9EFF","#FF4D6A","#FFB830","#A855F7",
  "#FF8C42","#00BCD4","#E91E63","#8BC34A","#FF5722",
  "#607D8B","#9C27B0","#03A9F4","#CDDC39","#FF9800",
  "#795548","#F06292","#4DB6AC","#FFD54F","#90A4AE",
];

const ICON_GROUPS = [
  { label: "Alimentação & Casa",  icons: ["UtensilsCrossed","Coffee","Pizza","ShoppingCart","ShoppingBag","Home","Refrigerator","ChefHat"] },
  { label: "Transporte",          icons: ["Car","Bus","Bike","Fuel","Plane","Train","Ship","Navigation"] },
  { label: "Saúde & Bem-estar",   icons: ["Heart","Activity","Pill","Stethoscope","Dumbbell","Smile","Brain","Thermometer"] },
  { label: "Finanças",            icons: ["Wallet","CreditCard","TrendingUp","DollarSign","PiggyBank","Receipt","BarChart2","Landmark"] },
  { label: "Lazer & Cultura",     icons: ["Gamepad2","Music","Film","Tv","BookOpen","Camera","Headphones","Trophy"] },
  { label: "Outros",              icons: ["Tag","Star","Gift","Package","Zap","Globe","Briefcase","PawPrint"] },
];

interface Props {
  category?: Category;
}

export default function CategoryFormPage({ category }: Props) {
  const router = useRouter();
  const { dispatch } = useApp();
  const isSeed = category ? SEED_CATEGORY_IDS.has(category.id) : false;

  const [catName, setCatName]   = useState(category?.name ?? "");
  const [icon, setIcon]         = useState(category?.icon ?? "Tag");
  const [color, setColor]       = useState(category?.color ?? "#00E5A0");
  const [hexInput, setHexInput] = useState(category?.color ?? "#00E5A0");
  const [type, setType]         = useState<"expense" | "income">(category?.type ?? "expense");
  const [error, setError]       = useState("");

  function selectColor(c: string) {
    setColor(c);
    setHexInput(c);
  }

  function handleHexChange(val: string) {
    setHexInput(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) setColor(val);
  }

  function handleSave() {
    if (!catName.trim()) return setError("Informe o nome da categoria.");
    setError("");
    const cat: Category = {
      id: category?.id ?? newId(),
      name: catName.trim(),
      icon,
      color,
      type: isSeed ? (category?.type ?? type) : type,
    };
    dispatch({ type: category ? "UPD_CATEGORY" : "ADD_CATEGORY", payload: cat });
    router.push("/configuracoes");
  }

  function handleDelete() {
    if (!category || isSeed) return;
    if (!confirm("Excluir esta categoria? As transações com ela não serão apagadas.")) return;
    dispatch({ type: "DEL_CATEGORY", payload: category.id });
    router.push("/configuracoes");
  }

  return (
    <>
      {/* ── Sticky header ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--bg)", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: "4px",
        padding: "0 8px 0 4px", height: "60px", flexShrink: 0,
      }}>
        <button
          onClick={() => router.push("/configuracoes")}
          style={{
            background: "none", border: "none", color: "var(--text-2)",
            cursor: "pointer", fontSize: "24px",
            width: "48px", height: "48px", borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
        >‹</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-1)" }}>
            {category ? "Editar categoria" : "Nova categoria"}
          </span>
          {isSeed && (
            <span style={{ fontSize: "11px", color: "var(--text-3)", marginLeft: "8px" }}>
              padrão
            </span>
          )}
        </div>
      </div>

      {/* ── Form body ── */}
      <div style={{ padding: "20px 16px 140px" }}>

        {/* Preview */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "12px",
            padding: "12px 24px",
            background: `${color}18`, border: `1px solid ${color}35`,
            borderRadius: "16px",
          }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "12px",
              background: `${color}25`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <CategoryIcon icon={icon} color={color} size={20} />
            </div>
            <span style={{ fontSize: "15px", fontWeight: 700, color }}>
              {catName.trim() || "Categoria"}
            </span>
          </div>
        </div>

        {/* Tipo — oculto para seeds */}
        {!isSeed && (
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
        )}

        {/* Nome */}
        <div className="form-group">
          <label className="form-label">Nome</label>
          <input
            className="form-input"
            type="text"
            inputMode="text"
            placeholder="Ex: Alimentação, Salário..."
            value={catName}
            onChange={e => setCatName(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
          />
        </div>

        {/* Ícone */}
        <div className="form-group">
          <label className="form-label">Ícone</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {ICON_GROUPS.map(group => (
              <div key={group.label}>
                <p style={{
                  fontSize: "11px", color: "var(--text-3)", marginBottom: "8px",
                  fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  {group.label}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                  {group.icons.map(iconKey => {
                    const selected = icon === iconKey;
                    return (
                      <button
                        key={iconKey}
                        onClick={() => setIcon(iconKey)}
                        style={{
                          height: "52px",
                          borderRadius: "12px",
                          border: selected ? "none" : "1px solid var(--border)",
                          background: selected ? "var(--accent)" : "var(--bg-input)",
                          cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.12s",
                          touchAction: "manipulation",
                          WebkitTapHighlightColor: "transparent",
                        }}
                      >
                        <CategoryIcon
                          icon={iconKey}
                          color={selected ? "#080F17" : "var(--text-3)"}
                          size={20}
                        />
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
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
            gap: "10px", marginBottom: "14px",
          }}>
            {COLORS.map(c => {
              const selected = color === c;
              return (
                <button
                  key={c}
                  onClick={() => selectColor(c)}
                  style={{
                    height: "40px", borderRadius: "10px",
                    background: c, border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: selected ? `0 0 0 3px var(--bg), 0 0 0 5px ${c}` : "none",
                    transition: "box-shadow 0.12s",
                    touchAction: "manipulation",
                  }}
                >
                  {selected && (
                    <span style={{ color: "#080F17", fontSize: "16px", fontWeight: 900, lineHeight: 1 }}>
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px",
              background: color, flexShrink: 0, border: "1px solid var(--border)",
            }} />
            <input
              className="form-input mono"
              type="text"
              placeholder="#000000"
              value={hexInput}
              onChange={e => handleHexChange(e.target.value)}
              maxLength={7}
              style={{ flex: 1, fontSize: "14px", height: "40px", padding: "0 12px" }}
            />
          </div>
        </div>

        {error && (
          <p style={{ color: "var(--red)", fontSize: "13px", marginTop: "14px", fontWeight: 600 }}>
            {error}
          </p>
        )}
      </div>

      {/* ── CTA fixo no fundo ── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
        background: "var(--bg)", borderTop: "1px solid var(--border)",
        padding: "12px 16px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        display: "flex", gap: "8px",
      }}>
        {category && !isSeed && (
          <button
            className="btn-danger"
            onClick={handleDelete}
            style={{ padding: "0 18px", flexShrink: 0 }}
          >
            Excluir
          </button>
        )}
        <button
          className="btn-primary"
          onClick={handleSave}
          style={{ flex: 1, textAlign: "center", justifyContent: "center" }}
        >
          {category ? "Salvar alterações" : "Criar categoria"}
        </button>
      </div>
    </>
  );
}
