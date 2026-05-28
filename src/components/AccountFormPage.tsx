"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, newId, ACCOUNT_COLORS, ACCOUNT_ICONS } from "@/context/AppContext";
import type { Account } from "@/context/AppContext";

const ACCOUNT_TYPES: { key: Account["type"]; label: string }[] = [
  { key: "checking",   label: "Conta Corrente" },
  { key: "savings",    label: "Poupança"        },
  { key: "wallet",     label: "Carteira"         },
  { key: "investment", label: "Investimentos"    },
];

interface Props {
  account?: Account;
}

export default function AccountFormPage({ account }: Props) {
  const router = useRouter();
  const { dispatch } = useApp();
  const todayStr = new Date().toISOString().split("T")[0];

  const [name, setName]                   = useState(account?.name ?? "");
  const [type, setType]                   = useState<Account["type"]>(account?.type ?? "checking");
  const [initialBalance, setBalance]      = useState(account ? String(account.initialBalance) : "0");
  const [initialDate, setDate]            = useState(account?.initialDate ?? todayStr);
  const [color, setColor]                 = useState(account?.color ?? ACCOUNT_COLORS[0]);
  const [icon, setIcon]                   = useState(account?.icon ?? ACCOUNT_ICONS[0]);
  const [error, setError]                 = useState("");

  const isEdit = !!account;

  function handleSave() {
    if (!name.trim()) return setError("Informe o nome da conta.");
    setError("");

    const acc: Account = {
      id:             account?.id ?? newId(),
      name:           name.trim(),
      type,
      initialBalance: parseFloat(initialBalance.replace(",", ".")) || 0,
      initialDate,
      color,
      icon,
      active:         true,
    };
    dispatch({ type: isEdit ? "UPD_ACCOUNT" : "ADD_ACCOUNT", payload: acc });
    router.back();
  }

  function handleDelete() {
    if (!account) return;
    if (!confirm(`Excluir a conta "${account.name}"? Esta ação não pode ser desfeita.`)) return;
    dispatch({ type: "DEL_ACCOUNT", payload: account.id });
    router.push("/contas");
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
          {isEdit ? "Editar conta" : "Nova conta"}
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

      {/* ── Form ── */}
      <div style={{ padding: "20px 16px 140px" }}>

        {/* Ícone */}
        <div className="form-group">
          <label className="form-label">Ícone</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {ACCOUNT_ICONS.map(ic => (
              <button
                key={ic}
                onClick={() => setIcon(ic)}
                style={{
                  width: "48px", height: "48px", borderRadius: "12px", fontSize: "22px",
                  background: icon === ic ? "var(--accent-10)" : "rgba(255,255,255,0.04)",
                  border: icon === ic ? "1px solid var(--border-accent)" : "1px solid var(--border)",
                  cursor: "pointer", transition: "all 0.15s",
                  touchAction: "manipulation",
                }}
              >{ic}</button>
            ))}
          </div>
        </div>

        {/* Nome */}
        <div className="form-group">
          <label className="form-label">Nome da conta</label>
          <input
            className="form-input"
            type="text"
            placeholder="Ex: Nubank, Bradesco, Carteira..."
            value={name}
            onChange={e => setName(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
          />
        </div>

        {/* Tipo */}
        <div className="form-group">
          <label className="form-label">Tipo</label>
          <select className="form-input" value={type} onChange={e => setType(e.target.value as Account["type"])}>
            {ACCOUNT_TYPES.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Saldo inicial + data */}
        <div className="form-row">
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Saldo inicial (R$)</label>
            <input
              className="form-input mono"
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              placeholder="0,00"
              value={initialBalance}
              onChange={e => setBalance(e.target.value.replace(/[^0-9.,]/g, ""))}
              autoComplete="off"
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Data do saldo</label>
            <input
              className="form-input"
              type="date"
              value={initialDate}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        </div>

        {/* Cor */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Cor</label>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {ACCOUNT_COLORS.map(c => (
              <button
                key={c}
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

      {/* ── CTA fixo ── */}
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
          {isEdit ? "Salvar alterações" : "Criar conta"}
        </button>
      </div>
    </>
  );
}
