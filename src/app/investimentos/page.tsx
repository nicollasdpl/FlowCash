"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { getCurrentBalance, fmt, isBalancePositive } from "@/engine/financialEngine";
import { PiggyBank, Pencil } from "lucide-react";
import CategoryIcon, { isLucideIcon } from "@/components/CategoryIcon";

export default function InvestimentosPage() {
  const router = useRouter();
  const { state } = useApp();

  const boxes = useMemo(
    () => state.accounts.filter(a => a.active && a.type === "investment"),
    [state.accounts]
  );

  const balances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of boxes) {
      map[b.id] = getCurrentBalance(b, state.transactions);
    }
    return map;
  }, [boxes, state.transactions]);

  const total = useMemo(
    () => boxes.reduce((s, b) => s + (balances[b.id] ?? 0), 0),
    [boxes, balances]
  );

  return (
    <div style={{ padding: "20px 16px", maxWidth: "900px", margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ fontSize: "20px" }}>
            Investimentos
          </h1>
          <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
            {boxes.length} caixinha{boxes.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          className="icon-btn primary"
          onClick={() => router.push("/investimentos/nova")}
          aria-label="Nova caixinha"
          style={{ fontSize: "24px", fontWeight: 500 }}
        >+</button>
      </div>

      {boxes.length > 0 && (
        <div className="soft-card" style={{ padding: "20px", marginBottom: "20px" }}>
          <p className="section-heading">
            Dinheiro guardado
          </p>
          <p className="mono" style={{
            fontSize: "28px", fontWeight: 700, letterSpacing: "-0.03em",
            color: isBalancePositive(total) ? "var(--green)" : "var(--text-1)",
          }}>
            R$ {fmt(total)}
          </p>
          <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "6px" }}>
            Separado da conta corrente — guarde ou resgate a qualquer momento
          </p>
        </div>
      )}

      {boxes.length === 0 && (
        <div className="soft-card" style={{ padding: "48px 24px", textAlign: "center" }}>
          <div style={{
            display: "flex", justifyContent: "center", marginBottom: "14px",
            color: "var(--text-3)",
          }}>
            <PiggyBank size={44} strokeWidth={1.5} />
          </div>
          <p style={{ color: "var(--text-2)", fontSize: "15px", fontWeight: 600 }}>
            Nenhuma caixinha ainda
          </p>
          <p style={{
            color: "var(--text-3)", fontSize: "13px",
            marginTop: "6px", marginBottom: "20px",
          }}>
            Crie caixinhas para guardar dinheiro separado da conta corrente.
          </p>
          <button
            className="btn-primary"
            onClick={() => router.push("/investimentos/nova")}
          >
            + Criar primeira caixinha
          </button>
        </div>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "12px",
      }}>
        {boxes.map((box) => {
          const bal = balances[box.id] ?? 0;
          return (
            <div
              key={box.id}
              className="soft-card"
              onClick={() => router.push(`/investimentos/${box.id}`)}
              style={{ padding: "18px", cursor: "pointer" }}
            >
              <div style={{
                display: "flex", alignItems: "flex-start",
                justifyContent: "space-between", gap: "10px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                  <div style={{
                    width: "44px", height: "44px", borderRadius: "14px", flexShrink: 0,
                    background: `${box.color}18`, border: `1px solid ${box.color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <CategoryIcon
                      icon={isLucideIcon(box.icon) ? box.icon : "PiggyBank"}
                      color={box.color}
                      size={20}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{
                      fontSize: "15px", fontWeight: 700, color: "var(--text-1)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {box.name}
                    </p>
                    <p className="mono" style={{
                      fontSize: "18px", fontWeight: 700, marginTop: "4px",
                      color: box.color, letterSpacing: "-0.02em",
                    }}>
                      R$ {fmt(bal)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={e => {
                    e.stopPropagation();
                    router.push(`/investimentos/${box.id}/editar`);
                  }}
                  aria-label="Editar"
                  style={{ width: "36px", height: "36px" }}
                >
                  <Pencil size={14} strokeWidth={1.5} />
                </button>
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={e => {
                    e.stopPropagation();
                    router.push(`/investimentos/${box.id}/guardar`);
                  }}
                  style={{ flex: 1, fontSize: "13px", padding: "10px", justifyContent: "center" }}
                >
                  Guardar
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={e => {
                    e.stopPropagation();
                    router.push(`/investimentos/${box.id}/resgatar`);
                  }}
                  style={{ flex: 1, fontSize: "13px", padding: "10px", justifyContent: "center" }}
                >
                  Resgatar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
