"use client";

import type { CSSProperties } from "react";
import type { ImportDraftLine } from "@/lib/invoiceImport/types";
import { iconLabel } from "@/components/CategoryIcon";

interface CategoryOpt {
  id: string;
  name: string;
  icon: string;
}

interface Props {
  draft: ImportDraftLine;
  categories: CategoryOpt[];
  mode: "compare" | "import";
  competenceWarning?: string;
  onChange: (next: ImportDraftLine) => void;
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ImportLineEditor({
  draft,
  categories,
  mode,
  competenceWarning,
  onChange,
}: Props) {
  const editable = mode === "import" && !draft.covered;

  return (
    <div
      style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--border)",
        opacity: draft.covered ? 0.55 : 1,
        background: draft.selected && mode === "import" ? "var(--accent-10)" : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        {mode === "import" && (
          <input
            type="checkbox"
            checked={draft.selected && !draft.covered}
            disabled={draft.covered}
            onChange={e => onChange({ ...draft, selected: e.target.checked })}
            style={{ width: 18, height: 18, marginTop: 4, accentColor: "var(--accent)", cursor: "pointer" }}
            aria-label="Selecionar para adicionar"
          />
        )}

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
          {editable ? (
            <>
              <input
                value={draft.description}
                onChange={e => onChange({ ...draft, description: e.target.value })}
                style={inputStyle}
                placeholder="Descrição"
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <input
                  type="date"
                  value={draft.date}
                  onChange={e => onChange({ ...draft, date: e.target.value })}
                  style={inputStyle}
                />
                <input
                  value={fmt(draft.amount)}
                  onChange={e => {
                    const raw = e.target.value.replace(/\./g, "").replace(",", ".");
                    const n = Number(raw);
                    if (!Number.isNaN(n)) onChange({ ...draft, amount: Math.round(n * 100) / 100 });
                  }}
                  inputMode="decimal"
                  style={inputStyle}
                  aria-label="Valor"
                />
              </div>
              <select
                value={draft.categoryId}
                onChange={e => onChange({ ...draft, categoryId: e.target.value })}
                style={inputStyle}
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {iconLabel(c.icon, c.name)}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <label style={chipLabel}>
                  <input
                    type="checkbox"
                    checked={draft.isSubscription}
                    onChange={e =>
                      onChange({
                        ...draft,
                        isSubscription: e.target.checked,
                        totalInstallments: e.target.checked ? 1 : draft.totalInstallments,
                      })
                    }
                  />
                  Assinatura
                </label>
                {!draft.isSubscription && (
                  <label style={{ ...chipLabel, gap: 6 }}>
                    Parcelas
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={draft.totalInstallments}
                      onChange={e =>
                        onChange({
                          ...draft,
                          totalInstallments: Math.max(1, Math.min(60, Number(e.target.value) || 1)),
                        })
                      }
                      style={{ ...inputStyle, width: 56, padding: "4px 6px" }}
                    />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, covered: true, selected: false })}
                  style={linkBtn}
                >
                  Já coberto
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>
                  {draft.description}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>
                  R$ {fmt(draft.amount)}
                </span>
              </div>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                {draft.date.split("-").reverse().join("/")}
                {draft.isSubscription
                  ? " · Assinatura"
                  : draft.totalInstallments > 1
                    ? ` · ${draft.totalInstallments}x`
                    : " · À vista"}
              </span>
              {draft.covered && (
                <span style={{ fontSize: 11, color: "var(--amber)" }}>Marcado como já coberto</span>
              )}
            </>
          )}

          {(competenceWarning || draft.competenceWarning) && (
            <p style={{ fontSize: 11, color: "var(--amber)", margin: 0, lineHeight: 1.4 }}>
              {competenceWarning || draft.competenceWarning}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-input)",
  color: "var(--text-1)",
  fontSize: 13,
  fontFamily: "inherit",
};

const chipLabel: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: "var(--text-2)",
  cursor: "pointer",
};

const linkBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-3)",
  fontSize: 12,
  cursor: "pointer",
  textDecoration: "underline",
  fontFamily: "inherit",
  padding: 0,
};
