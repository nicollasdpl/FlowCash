"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, newId, ACCOUNT_COLORS, ACCOUNT_ICONS } from "@/context/AppContext";
import type { Account } from "@/context/AppContext";
import { getCurrentBalance } from "@/engine/financialEngine";
import { buildTransferTransaction, validateTransferAmount } from "@/lib/createTransfer";

interface Props {
  account?: Account;
}

export default function InvestmentBoxFormPage({ account }: Props) {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const todayStr = new Date().toISOString().split("T")[0];
  const isEdit = !!account;

  const liquidAccounts = state.accounts.filter(
    a => a.active && a.type !== "investment" && (!account || a.id !== account.id)
  );
  const defaultFrom =
    liquidAccounts.find(a => a.type === "checking")?.id
    ?? liquidAccounts[0]?.id
    ?? "";

  const [name, setName] = useState(account?.name ?? "");
  const [icon, setIcon] = useState(account?.icon ?? "📈");
  const [color, setColor] = useState(account?.color ?? ACCOUNT_COLORS[2]);
  const [initialAmount, setInitialAmount] = useState(
    account ? String(account.initialBalance) : ""
  );
  const [fundingMode, setFundingMode] = useState<"already_separated" | "from_account">(
    "already_separated"
  );
  const [fromAccountId, setFromAccountId] = useState(defaultFrom);
  const [error, setError] = useState("");

  function handleSave() {
    if (!name.trim()) return setError("Informe o nome da caixinha.");
    const amt = parseFloat((initialAmount || "0").replace(",", ".")) || 0;
    if (amt < 0) return setError("Informe um valor válido.");

    if (!isEdit && fundingMode === "from_account" && amt > 0) {
      if (!fromAccountId) return setError("Selecione a conta de origem.");
      const fromAcc = state.accounts.find(a => a.id === fromAccountId);
      if (!fromAcc) return setError("Conta de origem não encontrada.");
      const balanceErr = validateTransferAmount(amt, fromAcc, state.transactions);
      if (balanceErr) return setError(balanceErr);
    }

    setError("");

    const id = account?.id ?? newId();
    const useInitial = isEdit || fundingMode === "already_separated";

    const acc: Account = {
      id,
      name: name.trim(),
      type: "investment",
      initialBalance: isEdit
        ? account!.initialBalance
        : useInitial
          ? amt
          : 0,
      initialDate: account?.initialDate ?? todayStr,
      color,
      icon,
      active: true,
    };

    dispatch({ type: isEdit ? "UPD_ACCOUNT" : "ADD_ACCOUNT", payload: acc });

    if (!isEdit && fundingMode === "from_account" && amt > 0) {
      const fromAcc = state.accounts.find(a => a.id === fromAccountId)!;
      const tx = buildTransferTransaction({
        id: newId(),
        fromAccountId: fromAcc.id,
        toAccountId: id,
        amount: amt,
        date: todayStr,
        description: `Guardar em ${acc.name}`,
      });
      dispatch({ type: "ADD_TX", payload: tx });
    }

    router.replace(isEdit ? `/investimentos/${id}` : `/investimentos/${id}`);
  }

  function handleDelete() {
    if (!account) return;
    const bal = getCurrentBalance(account, state.transactions);
    if (Math.abs(bal) > 0.009) {
      return setError(
        `Resgate o saldo (R$ ${bal.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}) antes de excluir.`
      );
    }
    if (!confirm(`Excluir a caixinha "${account.name}"?`)) return;
    dispatch({ type: "DEL_ACCOUNT", payload: account.id });
    router.push("/investimentos");
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
          {isEdit ? "Editar caixinha" : "Nova caixinha"}
        </span>
        {isEdit && (
          <button
            onClick={handleDelete}
            style={{
              background: "var(--red-10)", border: "1px solid var(--red-20)",
              borderRadius: "10px", color: "var(--red)",
              padding: "8px 14px", fontSize: "13px", fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", touchAction: "manipulation",
            }}
          >Excluir</button>
        )}
      </div>

      <div style={{ padding: "20px 16px 140px" }}>
        <div className="form-group">
          <label className="form-label">Ícone</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {ACCOUNT_ICONS.map(ic => {
              const selected = icon === ic;
              return (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  style={{
                    width: "44px", height: "44px", borderRadius: "12px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "20px",
                    background: selected ? "var(--accent-10)" : "rgba(255,255,255,0.04)",
                    border: selected ? "1px solid var(--border-accent)" : "1px solid var(--border)",
                    cursor: "pointer", touchAction: "manipulation",
                  }}
                >{ic}</button>
              );
            })}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Nome da caixinha</label>
          <input
            className="form-input"
            type="text"
            placeholder="Ex: Reserva, Viagem, Emergência..."
            value={name}
            onChange={e => setName(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
          />
        </div>

        {!isEdit && (
          <>
            <div className="form-group">
              <label className="form-label">Valor inicial (R$)</label>
              <input
                className="form-input mono"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                placeholder="0,00"
                value={initialAmount}
                onChange={e => setInitialAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                autoComplete="off"
              />
            </div>

            <div className="form-group">
              <label className="form-label">De onde vem esse valor?</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[
                  {
                    key: "already_separated" as const,
                    title: "Já está separado",
                    desc: "Não está no saldo da conta corrente no app",
                  },
                  {
                    key: "from_account" as const,
                    title: "Sair da conta agora",
                    desc: "Transferir da conta corrente / outra conta",
                  },
                ].map(opt => {
                  const selected = fundingMode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setFundingMode(opt.key)}
                      style={{
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: "12px",
                        background: selected ? "var(--accent-10)" : "rgba(255,255,255,0.04)",
                        border: selected ? "1px solid var(--border-accent)" : "1px solid var(--border)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        touchAction: "manipulation",
                      }}
                    >
                      <p style={{
                        fontSize: "14px", fontWeight: 600,
                        color: selected ? "var(--accent)" : "var(--text-1)",
                      }}>{opt.title}</p>
                      <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
                        {opt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {fundingMode === "from_account" && (
              <div className="form-group">
                <label className="form-label">Conta de origem</label>
                <select
                  className="form-input"
                  value={fromAccountId}
                  onChange={e => setFromAccountId(e.target.value)}
                >
                  {liquidAccounts.length === 0 && (
                    <option value="">Nenhuma conta disponível</option>
                  )}
                  {liquidAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Cor</label>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {ACCOUNT_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{
                  width: "36px", height: "36px", borderRadius: "10px",
                  background: c, border: "none", cursor: "pointer",
                  outline: color === c ? "3px solid white" : "none",
                  outlineOffset: "2px", transition: "outline 0.15s",
                  touchAction: "manipulation",
                }}
              />
            ))}
          </div>
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
          {isEdit ? "Salvar alterações" : "Criar caixinha"}
        </button>
      </div>
    </>
  );
}
