"use client";
import { useState } from "react";
import { CreditCard as CreditCardIcon, X } from "lucide-react";
import type { Transaction, CardInstallment, CardPurchase } from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export interface CatItem {
  id: string;
  description: string;
  date: string;           // YYYY-MM-DD
  amount: number;
  isCard: boolean;
  cardName?: string;
  cardColor?: string;
  installmentLabel?: string; // "2/12" para parceladas
}

export interface CatSlice {
  catId: string;
  name: string;
  color: string;
  totalAmount: number;
  items: CatItem[];
}

// ─── Helper puro ─────────────────────────────────────────────────────────────
// Combina transações pagas + parcelas de cartão do mês, agrupadas por categoria.

export function buildCatSlices(
  transactions: Transaction[],
  installments: CardInstallment[],
  purchases: CardPurchase[],
  categories: { id: string; name: string; color: string }[],
  cards: { id: string; name: string; color: string }[],
  month: string,
): CatSlice[] {
  const map: Record<string, CatSlice> = {};

  function ensure(catId: string): CatSlice {
    if (!map[catId]) {
      const cat = categories.find(c => c.id === catId);
      map[catId] = {
        catId,
        name:  cat?.name  ?? "Outros",
        color: cat?.color ?? "#6B7FA3",
        totalAmount: 0,
        items: [],
      };
    }
    return map[catId];
  }

  // 1. Despesas (qualquer status) com competenceDate no mês — alinhado ao
  // getSpentByCategory (Relatórios/Orçamentos): visão por competência.
  // Exclui a liquidação de fatura (categoria de sistema): o gasto do cartão já
  // entra pelas parcelas no passo 2, com as categorias reais das compras.
  transactions
    .filter(t =>
      t.type === "expense" &&
      t.competenceDate.startsWith(month) &&
      t.categoryId !== SEED_INVOICE_PAYMENT_CATEGORY_ID
    )
    .forEach(t => {
      const slice = ensure(t.categoryId || "__none__");
      slice.totalAmount += t.amount;
      slice.items.push({
        id: t.id,
        description: t.description,
        date: t.paymentDate,
        amount: t.amount,
        isCard: false,
      });
    });

  // 2. Parcelas com competenceMonth === mês (qualquer status de fatura)
  installments
    .filter(i => i.competenceMonth === month)
    .forEach(i => {
      const purchase = purchases.find(p => p.id === i.purchaseId);
      if (!purchase) return;
      const card = cards.find(c => c.id === i.cardId);
      const slice = ensure(purchase.categoryId || "__none__");
      slice.totalAmount += i.amount;
      slice.items.push({
        id: i.id,
        description: purchase.description,
        date: purchase.purchaseDate,
        amount: i.amount,
        isCard: true,
        cardName: card?.name,
        cardColor: card?.color,
        installmentLabel: i.totalInstallments > 1
          ? `${i.installmentNumber}/${i.totalInstallments}`
          : undefined,
      });
    });

  return Object.values(map)
    .filter(s => s.totalAmount > 0)
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

// ─── Helpers de formatação ───────────────────────────────────────────────────

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length < 3) return d;
  return `${parts[2]}/${parts[1]}`;
}

// ─── Painel de detalhe (reutilizado em Relatórios) ───────────────────────────

export function CategoryExpenseDetailPanel({
  slice,
  onClose,
}: {
  slice: CatSlice;
  onClose: () => void;
}) {
  const sorted = [...slice.items].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "rgba(255,255,255,0.012)" }}>
      <div style={{
        padding: "10px 18px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: "10px",
      }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: slice.color, flexShrink: 0 }} />
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)", flex: 1 }}>
          {slice.name}
        </span>
        <span className="mono" style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-2)", marginRight: "4px" }}>
          R$ {fmt(slice.totalAmount)}
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none", border: "1px solid var(--border)",
            borderRadius: "6px", color: "var(--text-3)",
            cursor: "pointer", padding: "4px",
            display: "flex", alignItems: "center", touchAction: "manipulation",
          }}
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>

      {sorted.length === 0 ? (
        <div style={{ padding: "16px 18px" }}>
          <p style={{ fontSize: "12px", color: "var(--text-3)" }}>Nenhum item.</p>
        </div>
      ) : sorted.map((item, j) => {
        const accent = item.cardColor ?? "#FFB830";
        return (
          <div
            key={item.id}
            style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "11px 18px",
              borderBottom: j < sorted.length - 1 ? "1px solid var(--border)" : "none",
            }}
          >
            {item.isCard && (
              <div style={{
                width: "30px", height: "30px", borderRadius: "8px", flexShrink: 0,
                background: `${accent}22`,
                border: `1px solid ${accent}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: accent,
              }}>
                <CreditCardIcon size={13} strokeWidth={1.5} />
              </div>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: "13px", fontWeight: 500, color: "var(--text-1)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {item.description}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-3)", flexShrink: 0 }}>
                  {fmtDate(item.date)}
                </span>
                {item.isCard && (
                  <span style={{
                    fontSize: "9px", fontWeight: 700,
                    padding: "1px 5px", borderRadius: "4px",
                    background: `${accent}18`,
                    color: accent, border: `1px solid ${accent}40`,
                    letterSpacing: "0.04em",
                    maxWidth: "140px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {item.cardName
                      ? item.installmentLabel
                        ? `${item.cardName} · ${item.installmentLabel}`
                        : item.cardName
                      : item.installmentLabel
                        ? `PARCELA ${item.installmentLabel}`
                        : "CARTÃO"}
                  </span>
                )}
              </div>
            </div>

            <p className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)", flexShrink: 0 }}>
              R$ {fmt(item.amount)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function CategoryDonutSection({
  slices,
  emptyMessage = "Sem despesas neste mês",
}: {
  slices: CatSlice[];
  emptyMessage?: string;
}) {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const total = slices.reduce((s, e) => s + e.totalAmount, 0);

  if (total === 0 || slices.length === 0) {
    return (
      <div style={{ padding: "36px 18px", textAlign: "center" }}>
        <p style={{ fontSize: "13px", color: "var(--text-3)" }}>{emptyMessage}</p>
      </div>
    );
  }

  function toggle(catId: string) {
    setSelectedCat(prev => (prev === catId ? null : catId));
  }

  // SVG donut
  const cx = 80, cy = 80, r = 68, inner = r * 0.5;
  let ang = -Math.PI / 2;
  const svgSlices = slices.map(e => {
    const sweep = (e.totalAmount / total) * 2 * Math.PI;
    const start = ang;
    ang += sweep;
    return {
      ...e,
      x1: cx + r * Math.cos(start), y1: cy + r * Math.sin(start),
      x2: cx + r * Math.cos(ang),   y2: cy + r * Math.sin(ang),
      largeArc: sweep > Math.PI ? 1 : 0,
    };
  });

  const sel = slices.find(s => s.catId === selectedCat) ?? null;

  return (
    <>
      {/* ── Donut + legenda ── */}
      <div style={{
        display: "flex", gap: "20px", alignItems: "center",
        padding: "16px 18px", flexWrap: "wrap",
      }}>

        {/* SVG */}
        <div style={{ flexShrink: 0 }}>
          <svg width="160" height="160" viewBox="0 0 160 160">
            {slices.length === 1 ? (
              <circle
                cx={cx} cy={cy} r={r}
                fill={slices[0].color}
                onClick={() => toggle(slices[0].catId)}
                style={{ cursor: "pointer" }}
              />
            ) : svgSlices.map(s => (
              <path
                key={s.catId}
                d={`M ${cx} ${cy} L ${s.x1.toFixed(2)} ${s.y1.toFixed(2)} A ${r} ${r} 0 ${s.largeArc} 1 ${s.x2.toFixed(2)} ${s.y2.toFixed(2)} Z`}
                fill={s.color}
                stroke="var(--bg-card)"
                strokeWidth="2.5"
                opacity={selectedCat && selectedCat !== s.catId ? 0.2 : 1}
                onClick={() => toggle(s.catId)}
                style={{ cursor: "pointer", transition: "opacity 0.2s" }}
              />
            ))}
            <circle cx={cx} cy={cy} r={inner} fill="var(--bg-card)" />

            {sel ? (
              <>
                <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fontWeight="700"
                  fill="var(--text-3)" fontFamily="inherit" letterSpacing="0.05em">
                  {sel.name.length > 10 ? sel.name.slice(0, 9) + "…" : sel.name}
                </text>
                <text x={cx} y={cy + 12} textAnchor="middle" fontSize="12" fontWeight="700"
                  fill="var(--text-1)" fontFamily="inherit">
                  {sel.totalAmount >= 1000 ? `${(sel.totalAmount / 1000).toFixed(1)}k` : fmt(sel.totalAmount)}
                </text>
              </>
            ) : (
              <>
                <text x={cx} y={cy - 4} textAnchor="middle" fontSize="8" fontWeight="700"
                  fill="var(--text-3)" fontFamily="inherit" letterSpacing="0.08em">
                  DESPESAS
                </text>
                <text x={cx} y={cy + 12} textAnchor="middle" fontSize="13" fontWeight="700"
                  fill="var(--text-1)" fontFamily="inherit">
                  {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : fmt(total)}
                </text>
              </>
            )}
          </svg>
        </div>

        {/* Legenda clicável */}
        <div style={{ flex: 1, minWidth: "130px", display: "flex", flexDirection: "column", gap: "5px" }}>
          {svgSlices.map(s => {
            const pct  = ((s.totalAmount / total) * 100).toFixed(1);
            const active = selectedCat === s.catId;
            return (
              <div
                key={s.catId}
                onClick={() => toggle(s.catId)}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  cursor: "pointer", padding: "4px 7px", borderRadius: "8px",
                  background: active ? `${s.color}18` : "transparent",
                  border: `1px solid ${active ? `${s.color}40` : "transparent"}`,
                  transition: "all 0.15s",
                }}
              >
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                <span style={{
                  fontSize: "12px", flex: 1,
                  color: active ? "var(--text-1)" : "var(--text-2)",
                  fontWeight: active ? 700 : 400,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {s.name}
                </span>
                <span className="mono" style={{
                  fontSize: "11px", flexShrink: 0,
                  color: active ? "var(--text-2)" : "var(--text-3)",
                }}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {sel && <CategoryExpenseDetailPanel slice={sel} onClose={() => setSelectedCat(null)} />}
    </>
  );
}
