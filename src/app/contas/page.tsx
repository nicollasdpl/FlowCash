"use client";
import { useState, useMemo } from "react";
import { useApp, newId, ACCOUNT_COLORS, ACCOUNT_ICONS } from "@/context/AppContext";
import type { Account } from "@/context/AppContext";
import {
  getCurrentBalance, getProjectedBalance, getAvailableBalance,
} from "@/engine/financialEngine";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ACCOUNT_TYPES: { key: Account["type"]; label: string }[] = [
  { key: "checking", label: "Conta Corrente" },
  { key: "savings", label: "Poupança" },
  { key: "wallet", label: "Carteira" },
  { key: "investment", label: "Investimentos" },
];

function AccountModal({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { state, dispatch } = useApp();
  const todayStr = new Date().toISOString().split("T")[0];

  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<Account["type"]>(account?.type ?? "checking");
  const [initialBalance, setInitialBalance] = useState(account ? String(account.initialBalance) : "0");
  const [initialDate, setInitialDate] = useState(account?.initialDate ?? todayStr);
  const [color, setColor] = useState(account?.color ?? ACCOUNT_COLORS[0]);
  const [icon, setIcon] = useState(account?.icon ?? ACCOUNT_ICONS[0]);
  const [error, setError] = useState("");

  function handleSave() {
    if (!name.trim()) return setError("Informe o nome da conta.");
    setError("");

    const acc: Account = {
      id: account?.id ?? newId(),
      name: name.trim(),
      type,
      initialBalance: parseFloat(initialBalance.replace(",", ".")) || 0,
      initialDate,
      color,
      icon,
      active: true,
    };
    dispatch({ type: account ? "UPD_ACCOUNT" : "ADD_ACCOUNT", payload: acc });
    onClose();
  }

  function handleDelete() {
    if (!account) return;
    if (!confirm(`Excluir a conta "${account.name}"? Esta ação não pode ser desfeita.`)) return;
    dispatch({ type: "DEL_ACCOUNT", payload: account.id });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)" }}>
            {account ? "Editar conta" : "Nova conta"}
          </span>
          <button className="btn-secondary" onClick={onClose} style={{ padding: "6px 12px", fontSize: "16px" }}>×</button>
        </div>
        <div className="modal-body">
          {/* Icon picker */}
          <div className="form-group">
            <label className="form-label">Ícone</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {ACCOUNT_ICONS.map(ic => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  style={{
                    width: "38px", height: "38px", borderRadius: "10px", fontSize: "18px",
                    background: icon === ic ? "var(--accent-10)" : "rgba(255,255,255,0.04)",
                    border: icon === ic ? "1px solid var(--border-accent)" : "1px solid var(--border)",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >{ic}</button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Nome da conta</label>
            <input className="form-input" type="text" placeholder="Ex: Nubank, Bradesco, Carteira..." value={name} onChange={e => setName(e.target.value)} autoComplete="off" autoCorrect="off" />
          </div>

          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-input" value={type} onChange={e => setType(e.target.value as Account["type"])}>
              {ACCOUNT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Saldo inicial (R$)</label>
              <input className="form-input mono" type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" placeholder="0,00" value={initialBalance} onChange={e => setInitialBalance(e.target.value.replace(/[^0-9.,]/g, ""))} autoComplete="off" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Data do saldo inicial</label>
              <input className="form-input" type="date" value={initialDate} onChange={e => setInitialDate(e.target.value)} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cor</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {ACCOUNT_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: "32px", height: "32px", borderRadius: "8px",
                    background: c, border: "none", cursor: "pointer",
                    outline: color === c ? "3px solid white" : "none",
                    outlineOffset: "2px", transition: "outline 0.15s",
                  }}
                />
              ))}
            </div>
          </div>

          {error && <p style={{ color: "var(--red)", fontSize: "12px", marginTop: "12px" }}>{error}</p>}
        </div>
        <div className="modal-footer">
          {account && <button className="btn-danger" onClick={handleDelete}>Excluir</button>}
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>{account ? "Salvar" : "Criar conta"}</button>
        </div>
      </div>
    </div>
  );
}

export default function Contas() {
  const { state } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);

  const eom = useMemo(() => {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return last.toISOString().split("T")[0];
  }, []);

  const totalCurrent = useMemo(() =>
    state.accounts.filter(a => a.active).reduce((s, a) => s + getCurrentBalance(a, state.transactions), 0),
    [state.accounts, state.transactions]
  );
  const totalProjected = useMemo(() =>
    state.accounts.filter(a => a.active).reduce((s, a) => s + getProjectedBalance(a, state.transactions, eom), 0),
    [state.accounts, state.transactions, eom]
  );

  const typeLabels: Record<Account["type"], string> = {
    checking: "Conta Corrente",
    savings: "Poupança",
    wallet: "Carteira",
    investment: "Investimentos",
  };

  return (
    <div style={{ padding: "20px 16px", maxWidth: "900px" }}>
      {showModal && <AccountModal onClose={() => setShowModal(false)} />}
      {editAccount && <AccountModal account={editAccount} onClose={() => setEditAccount(null)} />}

      <div className="fade-up-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em" }}>Contas</h1>
          <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "3px" }}>
            {state.accounts.length} conta{state.accounts.length !== 1 ? "s" : ""} cadastrada{state.accounts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Nova conta</button>
      </div>

      {/* Total summary */}
      <div className="fade-up-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
        <div className="card" style={{ padding: "20px" }}>
          <p style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
            Saldo total atual
          </p>
          <p className="mono" style={{ fontSize: "28px", fontWeight: 700, color: totalCurrent >= 0 ? "var(--green)" : "var(--red)", letterSpacing: "-0.03em" }}>
            R$ {fmt(totalCurrent)}
          </p>
          <p style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "6px" }}>Apenas transações pagas</p>
        </div>
        <div className="card" style={{ padding: "20px" }}>
          <p style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
            Projetado (fim do mês)
          </p>
          <p className="mono" style={{ fontSize: "28px", fontWeight: 700, color: totalProjected >= 0 ? "var(--text-1)" : "var(--red)", letterSpacing: "-0.03em" }}>
            R$ {fmt(totalProjected)}
          </p>
          <p style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "6px" }}>Incluindo pendentes do mês</p>
        </div>
      </div>

      {/* Account cards */}
      {state.accounts.length === 0 && (
        <div className="card" style={{ padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🏦</div>
          <p style={{ color: "var(--text-2)", fontSize: "15px", fontWeight: 600 }}>Nenhuma conta cadastrada</p>
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginTop: "6px", marginBottom: "20px" }}>
            Adicione suas contas bancárias para calcular saldos automaticamente.
          </p>
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ Adicionar conta</button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {state.accounts.map((acc, i) => {
          const current = getCurrentBalance(acc, state.transactions);
          const projected = getProjectedBalance(acc, state.transactions, eom);
          const available = getAvailableBalance(acc, state.transactions, state.goals, eom);
          const reserved = projected - available;
          return (
            <div key={acc.id} className={`card fade-up-${Math.min(i + 2, 6)}`} style={{ padding: "22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div style={{
                    width: "48px", height: "48px", borderRadius: "14px", flexShrink: 0,
                    background: `${acc.color}18`, border: `1px solid ${acc.color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px",
                  }}>{acc.icon}</div>
                  <div>
                    <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)" }}>{acc.name}</p>
                    <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
                      {typeLabels[acc.type]}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditAccount(acc)}
                  style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: "14px" }}
                >✏️ Editar</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
                {[
                  { label: "Saldo atual", value: current, color: current >= 0 ? "var(--green)" : "var(--red)", help: "Transações pagas" },
                  { label: "Projetado", value: projected, color: projected >= 0 ? "var(--text-1)" : "var(--red)", help: "Com pendentes do mês" },
                  { label: "Disponível", value: available, color: available >= 0 ? "var(--accent)" : "var(--red)", help: `Reservado para metas: R$ ${fmt(reserved)}` },
                ].map((metric, j) => (
                  <div key={j} style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
                    borderRadius: "12px", padding: "14px 16px",
                  }}>
                    <p style={{ fontSize: "10.5px", color: "var(--text-3)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "6px" }}>
                      {metric.label}
                    </p>
                    <p className="mono" style={{ fontSize: "18px", fontWeight: 700, color: metric.color, letterSpacing: "-0.02em" }}>
                      R$ {fmt(metric.value)}
                    </p>
                    <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginTop: "4px" }}>{metric.help}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
