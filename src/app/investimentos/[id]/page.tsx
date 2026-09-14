"use client";
import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { getCurrentBalance, fmt, isBalancePositive } from "@/engine/financialEngine";
import { Pencil, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

function fmtDate(d: string) {
  if (!d) return "—";
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

export default function CaixinhaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { state } = useApp();

  const box = state.accounts.find(a => a.id === id && a.type === "investment");

  const balance = useMemo(
    () => (box ? getCurrentBalance(box, state.transactions) : 0),
    [box, state.transactions]
  );

  const history = useMemo(() => {
    if (!box) return [];
    return state.transactions
      .filter(t =>
        t.type === "transfer" &&
        (t.accountId === box.id || t.transferToAccountId === box.id)
      )
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.createdAt.localeCompare(a.createdAt));
  }, [box, state.transactions]);

  if (!box) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--text-3)" }}>
        Caixinha não encontrada.
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 16px", maxWidth: "900px", margin: "0 auto" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px",
      }}>
        <button
          onClick={() => router.push("/investimentos")}
          style={{
            background: "none", border: "none", color: "var(--text-2)",
            cursor: "pointer", fontSize: "24px",
            width: "40px", height: "40px", borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >‹</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            fontSize: "20px", fontWeight: 700, color: "var(--text-1)",
            letterSpacing: "-0.03em",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {box.icon} {box.name}
          </h1>
        </div>
        <button
          onClick={() => router.push(`/investimentos/${box.id}/editar`)}
          style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
            borderRadius: "8px", color: "var(--text-2)",
            cursor: "pointer", padding: "8px 12px",
            display: "flex", alignItems: "center", gap: "6px",
            fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
          }}
        >
          <Pencil size={13} strokeWidth={1.5} /> Editar
        </button>
      </div>

      <div className="card fade-up-1" style={{ padding: "22px", marginBottom: "16px" }}>
        <p style={{
          fontSize: "10px", color: "var(--text-3)", fontWeight: 700,
          letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px",
        }}>
          Saldo guardado
        </p>
        <p className="mono" style={{
          fontSize: "32px", fontWeight: 700, letterSpacing: "-0.03em",
          color: isBalancePositive(balance) ? box.color : "var(--text-1)",
        }}>
          R$ {fmt(balance)}
        </p>

        <div style={{ display: "flex", gap: "8px", marginTop: "18px" }}>
          <button
            className="btn-primary"
            onClick={() => router.push(`/investimentos/${box.id}/guardar`)}
            style={{
              flex: 1, justifyContent: "center", gap: "8px",
              display: "flex", alignItems: "center",
            }}
          >
            <ArrowDownToLine size={16} strokeWidth={1.5} /> Guardar
          </button>
          <button
            onClick={() => router.push(`/investimentos/${box.id}/resgatar`)}
            style={{
              flex: 1, justifyContent: "center", gap: "8px",
              display: "flex", alignItems: "center",
              borderRadius: "10px", fontWeight: 600, fontFamily: "inherit",
              background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
              color: "var(--text-1)", cursor: "pointer", padding: "12px",
              fontSize: "14px",
            }}
          >
            <ArrowUpFromLine size={16} strokeWidth={1.5} /> Resgatar
          </button>
        </div>
      </div>

      <div className="card fade-up-2" style={{ overflow: "hidden" }}>
        <div style={{
          padding: "14px 16px", borderBottom: "1px solid var(--border)",
        }}>
          <p style={{
            fontSize: "11px", fontWeight: 700, color: "var(--text-3)",
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            Histórico
          </p>
        </div>

        {history.length === 0 && (
          <div style={{ padding: "32px 16px", textAlign: "center" }}>
            <p style={{ color: "var(--text-3)", fontSize: "13px" }}>
              Nenhuma movimentação ainda. Guarde ou resgate para começar.
            </p>
          </div>
        )}

        {history.map((tx, i) => {
          const isIn = tx.transferToAccountId === box.id;
          const otherId = isIn ? tx.accountId : tx.transferToAccountId;
          const other = state.accounts.find(a => a.id === otherId);
          return (
            <div
              key={tx.id}
              style={{
                padding: "14px 16px",
                borderBottom: i < history.length - 1 ? "1px solid var(--border)" : "none",
                display: "flex", alignItems: "center", gap: "12px",
              }}
            >
              <div style={{
                width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
                background: isIn ? "var(--accent-10)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${isIn ? "var(--border-accent)" : "var(--border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: isIn ? "var(--accent)" : "var(--text-2)",
              }}>
                {isIn
                  ? <ArrowDownToLine size={16} strokeWidth={1.5} />
                  : <ArrowUpFromLine size={16} strokeWidth={1.5} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: "14px", fontWeight: 600, color: "var(--text-1)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {isIn ? "Guardou" : "Resgatou"}
                  {other ? ` · ${other.name}` : ""}
                </p>
                <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
                  {fmtDate(tx.paymentDate)}
                </p>
              </div>
              <p className="mono" style={{
                fontSize: "15px", fontWeight: 700,
                color: isIn ? "var(--green)" : "var(--text-1)",
              }}>
                {isIn ? "+" : "−"}R$ {fmt(tx.amount)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
