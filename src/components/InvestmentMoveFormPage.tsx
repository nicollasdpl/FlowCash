"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, newId } from "@/context/AppContext";
import { getCurrentBalance, fmt } from "@/engine/financialEngine";
import { buildTransferTransaction, validateTransferAmount } from "@/lib/createTransfer";

interface Props {
  boxId: string;
  mode: "guardar" | "resgatar";
}

export default function InvestmentMoveFormPage({ boxId, mode }: Props) {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const todayStr = new Date().toISOString().split("T")[0];

  const box = state.accounts.find(a => a.id === boxId && a.type === "investment");
  const liquidAccounts = state.accounts.filter(a => a.active && a.type !== "investment");
  const defaultLiquid =
    liquidAccounts.find(a => a.type === "checking")?.id
    ?? liquidAccounts[0]?.id
    ?? "";

  const [amount, setAmount] = useState("");
  const [liquidAccountId, setLiquidAccountId] = useState(defaultLiquid);
  const [date, setDate] = useState(todayStr);
  const [error, setError] = useState("");

  if (!box) {
    return (
      <div style={{ padding: "40px 16px", textAlign: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "14px" }}>Caixinha não encontrada.</p>
      </div>
    );
  }

  const liquid = state.accounts.find(a => a.id === liquidAccountId);
  const boxBalance = getCurrentBalance(box, state.transactions);
  const liquidBalance = liquid ? getCurrentBalance(liquid, state.transactions) : 0;
  const sourceBalance = mode === "guardar" ? liquidBalance : boxBalance;
  const isGuardar = mode === "guardar";

  function handleSave() {
    if (!box) return;
    if (!liquid) return setError("Selecione a conta.");
    const n = parseFloat(amount.replace(",", "."));
    const from = isGuardar ? liquid : box;
    const to = isGuardar ? box : liquid;
    const balanceErr = validateTransferAmount(n, from, state.transactions);
    if (balanceErr) return setError(balanceErr);
    if (!date) return setError("Informe a data.");
    setError("");

    const tx = buildTransferTransaction({
      id: newId(),
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: n,
      date,
      description: isGuardar
        ? `Guardar em ${box.name}`
        : `Resgate de ${box.name}`,
    });
    dispatch({ type: "ADD_TX", payload: tx });
    router.replace(`/investimentos/${box.id}`);
  }

  return (
    <>
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--bg)", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: "4px",
        padding: "0 8px 0 4px", height: "60px", flexShrink: 0,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: "none", border: "none", color: "var(--text-2)",
            cursor: "pointer", fontSize: "24px",
            width: "48px", height: "48px", borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
        >‹</button>
        <span style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-1)", flex: 1 }}>
          {isGuardar ? "Guardar" : "Resgatar"}
        </span>
      </div>

      <div style={{ padding: "20px 16px 140px" }}>
        <div style={{
          padding: "16px",
          background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
          borderRadius: "12px", marginBottom: "24px",
        }}>
          <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
            Caixinha: <strong style={{ color: "var(--text-1)" }}>{box.name}</strong>
          </p>
          <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "4px" }}>
            Saldo na caixinha:{" "}
            <span className="mono" style={{ color: box.color, fontWeight: 700 }}>
              R$ {fmt(boxBalance)}
            </span>
          </p>
          {liquid && (
            <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "4px" }}>
              Disponível em {liquid.name}:{" "}
              <span className="mono" style={{ fontWeight: 700, color: "var(--text-1)" }}>
                R$ {fmt(liquidBalance)}
              </span>
            </p>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">
            {isGuardar ? "Conta de origem" : "Conta de destino"}
          </label>
          <select
            className="form-input"
            value={liquidAccountId}
            onChange={e => setLiquidAccountId(e.target.value)}
          >
            {liquidAccounts.length === 0 && (
              <option value="">Nenhuma conta disponível</option>
            )}
            {liquidAccounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Valor (R$)</label>
          <input
            className="form-input mono"
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            placeholder="0,00"
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
            autoComplete="off"
            style={{ fontSize: "24px" }}
            autoFocus
          />
          <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "6px" }}>
            Máximo: R$ {fmt(sourceBalance)}
          </p>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Data</label>
          <input
            className="form-input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
      </div>

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
        background: "var(--bg)", borderTop: "1px solid var(--border)",
        padding: "12px 16px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        display: "flex", flexDirection: "column", gap: "8px",
      }}>
        {error && (
          <p style={{ color: "var(--red)", fontSize: "13px", fontWeight: 600, textAlign: "center" }}>
            {error}
          </p>
        )}
        <button
          className="btn-primary"
          onClick={handleSave}
          style={{ width: "100%", textAlign: "center", justifyContent: "center" }}
        >
          {isGuardar ? "Confirmar guardar" : "Confirmar resgate"}
        </button>
      </div>
    </>
  );
}
