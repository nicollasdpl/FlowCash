"use client";
import { useEffect } from "react";
import type { Transaction, Category } from "@/context/AppContext";
import { TrendingUp, Package, Pencil, Trash2 } from "lucide-react";
import CategoryIcon from "@/components/CategoryIcon";

interface Props {
  tx: Transaction | null;
  categories: Category[];
  onClose: () => void;
  onStatusChange: (id: string, status: Transaction["status"]) => void;
  onDelete: (id: string) => void;
  onEdit?: (tx: Transaction) => void;
}

function getStatusLabel(type: string, status: string): string {
  if (status === "paid") return type === "income" ? "Recebido" : "Pago";
  if (status === "pending") return type === "income" ? "A receber" : "A pagar";
  return "Vencido";
}

function getStatusStyle(type: string, status: string) {
  if (status === "overdue") return { color: "var(--red)", bg: "var(--red-10)", border: "var(--red-20)" };
  if (status === "paid" && type === "income") return { color: "var(--accent)", bg: "var(--accent-10)", border: "var(--border-accent)" };
  if (status === "paid") return { color: "var(--text-2)", bg: "rgba(255,255,255,0.04)", border: "var(--border)" };
  if (status === "pending" && type === "income") return { color: "#4A9EFF", bg: "rgba(74,158,255,0.1)", border: "rgba(74,158,255,0.2)" };
  return { color: "var(--amber)", bg: "var(--amber-10)", border: "var(--amber-20)" };
}

const STATUS_KEYS: Transaction["status"][] = ["paid", "pending", "overdue"];

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export default function TransactionDrawer({ tx, categories, onClose, onStatusChange, onDelete, onEdit }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!tx) return null;

  const cat = categories.find(c => c.id === tx.categoryId);
  const currentStatusStyle = getStatusStyle(tx.type, tx.status);
  const isIncome = tx.type === "income";

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 40,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
        }}
      />

      <div
        style={{
          position: "fixed", right: 0, top: 0, bottom: 0,
          width: "380px", zIndex: 50,
          background: "var(--bg-sidebar)",
          borderLeft: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          animation: "slideInRight 0.25s ease",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "22px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
            Detalhes
          </span>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
              borderRadius: "8px", width: "32px", height: "32px",
              color: "var(--text-2)", fontSize: "18px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >×</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {/* Identity */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
            <div style={{
              width: "56px", height: "56px", borderRadius: "16px", flexShrink: 0,
              background: isIncome ? "var(--green-10)" : "rgba(255,255,255,0.06)",
              border: isIncome ? "1px solid var(--green-20)" : "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px",
            }}>
              {cat?.icon
                ? <CategoryIcon icon={cat.icon} color={cat?.color} size={24} />
                : isIncome
                  ? <TrendingUp size={24} strokeWidth={1.5} color="var(--green)" />
                  : <Package size={24} strokeWidth={1.5} color="var(--text-3)" />
              }
            </div>
            <div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
                {tx.description}
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
                {cat?.name ?? "Sem categoria"}
              </div>
            </div>
          </div>

          {/* Amount */}
          <div style={{
            background: isIncome ? "var(--green-10)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${isIncome ? "var(--green-20)" : "var(--border)"}`,
            borderRadius: "14px", padding: "20px 22px", marginBottom: "20px", textAlign: "center",
          }}>
            <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "6px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {isIncome ? "Receita" : tx.type === "transfer" ? "Transferência" : "Despesa"}
            </p>
            <p className="mono" style={{
              fontSize: "32px", fontWeight: 700, letterSpacing: "-0.03em",
              color: isIncome ? "var(--green)" : "var(--text-1)",
            }}>
              {isIncome ? "+" : "-"}R$ {fmt(tx.amount)}
            </p>
          </div>

          {/* Info grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "24px" }}>
            {[
              { label: "Competência", value: formatDate(tx.competenceDate) },
              { label: "Pagamento", value: formatDate(tx.paymentDate) },
              { label: "Categoria", value: cat?.name ?? "—" },
              { label: "Status", value: getStatusLabel(tx.type, tx.status), color: currentStatusStyle.color },
            ].map((info, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
                borderRadius: "10px", padding: "12px 14px",
              }}>
                <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginBottom: "4px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {info.label}
                </p>
                <p style={{ fontSize: "13.5px", fontWeight: 600, color: info.color ?? "var(--text-1)" }}>
                  {info.value}
                </p>
              </div>
            ))}
          </div>

          {tx.notes && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: "10px", padding: "14px", marginBottom: "20px" }}>
              <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginBottom: "6px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Observação</p>
              <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5 }}>{tx.notes}</p>
            </div>
          )}

          {/* Change status */}
          <div style={{ marginBottom: "24px" }}>
            <p style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "10px" }}>
              Alterar status
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              {STATUS_KEYS.map(key => {
                const active = tx.status === key;
                const s = getStatusStyle(tx.type, key);
                return (
                  <button
                    key={key}
                    onClick={() => onStatusChange(tx.id, key)}
                    style={{
                      flex: 1, padding: "9px 6px", borderRadius: "10px", cursor: "pointer",
                      fontSize: "12px", fontWeight: 700, transition: "all 0.15s ease",
                      background: active ? s.bg : "transparent",
                      color: active ? s.color : "var(--text-3)",
                      border: active ? `1px solid ${s.border}` : "1px solid var(--border)",
                    }}
                  >
                    {getStatusLabel(tx.type, key)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: "10px" }}>
          <button
            onClick={() => onEdit?.(tx)}
            style={{
              flex: 1, padding: "11px", borderRadius: "10px",
              background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
              color: "var(--text-2)", fontSize: "13px", fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            }}
          >
            <Pencil size={13} strokeWidth={1.5} /> Editar
          </button>
          <button
            onClick={() => { onDelete(tx.id); onClose(); }}
            style={{
              padding: "11px 18px", borderRadius: "10px",
              background: "var(--red-10)", border: "1px solid var(--red-20)",
              color: "var(--red)", fontSize: "13px", fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            }}
          >
            <Trash2 size={13} strokeWidth={1.5} /> Excluir
          </button>
        </div>
      </div>
    </>
  );
}
