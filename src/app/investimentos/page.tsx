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
      <div className="fade-up-1" style={{
        marginBottom: "20px", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
      }}>
        <div>
          <h1 style={{
            fontSize: "20px", fontWeight: 700, color: "var(--text-1)",
            letterSpacing: "-0.03em",
          }}>
            Investimentos
          </h1>
          <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
            {boxes.length} caixinha{boxes.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => router.push("/investimentos/nova")}
          style={{ fontSize: "13px", padding: "10px 16px" }}
        >
          + Nova
        </button>
      </div>

      {boxes.length > 0 && (
        <div className="card fade-up-1" style={{ padding: "20px", marginBottom: "20px" }}>
          <p style={{
            fontSize: "10px", color: "var(--text-3)", fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px",
          }}>
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
        <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
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
        {boxes.map((box, i) => {
          const bal = balances[box.id] ?? 0;
          return (
            <div
              key={box.id}
              className={`card fade-up-${Math.min(i + 2, 6)}`}
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
                  onClick={e => {
                    e.stopPropagation();
                    router.push(`/investimentos/${box.id}/editar`);
                  }}
                  style={{
                    background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
                    borderRadius: "8px", color: "var(--text-2)",
                    cursor: "pointer", padding: "8px",
                    display: "flex", alignItems: "center",
                  }}
                  aria-label="Editar"
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
                  onClick={e => {
                    e.stopPropagation();
                    router.push(`/investimentos/${box.id}/resgatar`);
                  }}
                  style={{
                    flex: 1, fontSize: "13px", padding: "10px",
                    borderRadius: "10px", fontWeight: 600, fontFamily: "inherit",
                    background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
                    color: "var(--text-1)", cursor: "pointer",
                  }}
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
