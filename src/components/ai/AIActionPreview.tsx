"use client";
import type { AIActionItem } from "@/lib/ai/types";
import { AlertTriangle } from "lucide-react";
import { fmt } from "./shared";

type AIActionPreviewProps = {
  actions: AIActionItem[];
  onConfirm: () => void;
  onDiscard: () => void;
};

const ACTION_LABELS: Record<AIActionItem["action"], string> = {
  delete_tx: "Apagar lançamento",
  update_tx: "Editar lançamento",
  delete_purchase: "Apagar compra no cartão",
};

export function AIActionPreview({ actions, onConfirm, onDiscard }: AIActionPreviewProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", animation: "fadeIn 0.25s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 4px" }}>
        <AlertTriangle size={14} strokeWidth={1.5} color="var(--amber)" />
        <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Confirme a ação
        </p>
      </div>

      {actions.map((action, i) => (
        <div
          key={`${action.targetId}-${i}`}
          style={{
            padding: "16px 18px",
            background: "var(--bg-card)",
            border: "1px solid var(--amber-20)",
            borderRadius: "14px",
          }}
        >
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--amber)", marginBottom: "8px" }}>
            {ACTION_LABELS[action.action]}
          </p>
          <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)", marginBottom: "4px" }}>
            {action.targetDescription}
          </p>
          {action.targetAmount !== undefined && (
            <p className="mono" style={{ fontSize: "14px", color: "var(--text-2)" }}>
              R$ {fmt(action.targetAmount)}
              {action.targetDate ? ` · ${action.targetDate}` : ""}
            </p>
          )}
          {action.action === "update_tx" && action.patch && (
            <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "8px", lineHeight: 1.5 }}>
              Alterações:{" "}
              {[
                action.patch.amount !== undefined ? `valor → R$ ${fmt(action.patch.amount)}` : null,
                action.patch.description ? `descrição → ${action.patch.description}` : null,
                action.patch.paymentDate ? `data → ${action.patch.paymentDate}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      ))}

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={onConfirm}
          style={{
            flex: 1,
            padding: "14px",
            background: "var(--amber)",
            border: "none",
            borderRadius: "12px",
            color: "#1a1000",
            fontSize: "14px",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Confirmar
        </button>
        <button
          onClick={onDiscard}
          style={{
            flex: 1,
            padding: "14px",
            background: "var(--bg-input)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            color: "var(--text-2)",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
