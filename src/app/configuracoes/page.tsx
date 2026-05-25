"use client";
import { useState, useRef } from "react";
import { useApp } from "@/context/AppContext";

export default function Configuracoes() {
  const { state, dispatch, user, signOut } = useApp();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(state.userName ?? "");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function saveName() {
    dispatch({ type: "SET_USER_NAME", payload: nameInput.trim() });
    setEditingName(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function startEdit() {
    setNameInput(state.userName ?? "");
    setEditingName(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function clearAllData() {
    localStorage.removeItem("flowcash_v2");
    window.location.reload();
  }

  const stats = {
    accounts: state.accounts.length,
    transactions: state.transactions.length,
    cards: state.cards.length,
    goals: state.goals.length,
  };

  return (
    <div style={{ padding: "20px 16px", maxWidth: "640px", margin: "0 auto" }}>

      {/* Header */}
      <div className="fade-up-1" style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em" }}>Configurações</h1>
        <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "3px" }}>Personalize o FlowCash</p>
      </div>

      {/* Perfil */}
      <div className="card fade-up-2" style={{ overflow: "hidden", marginBottom: "16px" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Perfil</p>
        </div>

        <div style={{ padding: "18px" }}>
          {/* Avatar placeholder */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
            {user?.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" width={60} height={60} style={{ borderRadius: "18px", flexShrink: 0 }} />
            ) : (
              <div style={{ width: "60px", height: "60px", borderRadius: "18px", flexShrink: 0, background: "var(--accent-10)", border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", color: "var(--accent)", fontWeight: 700 }}>
                {(state.userName || user?.displayName || "?")[0].toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {state.userName || user?.displayName || "Sem nome"}
              </p>
              <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
                {user?.email ?? ""}
              </p>
              <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "1px" }}>
                {stats.transactions} transaç{stats.transactions === 1 ? "ão" : "ões"} · {stats.accounts} conta{stats.accounts !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* Nome */}
          <div className="form-group">
            <label className="form-label">Seu nome</label>
            {editingName ? (
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  ref={inputRef}
                  className="form-input"
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                  placeholder="Como quer ser chamado?"
                  autoComplete="off"
                  style={{ flex: 1 }}
                />
                <button
                  className="btn-primary"
                  onClick={saveName}
                  disabled={!nameInput.trim()}
                  style={{ padding: "0 18px", flexShrink: 0 }}
                >
                  Salvar
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setEditingName(false)}
                  style={{ padding: "0 14px", flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                onClick={startEdit}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "13px 14px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: "16px", color: state.userName ? "var(--text-1)" : "var(--text-3)" }}>
                  {state.userName || "Toque para definir"}
                </span>
                <span style={{ fontSize: "13px", color: "var(--accent)", fontWeight: 600 }}>Editar</span>
              </div>
            )}
            {saved && (
              <p style={{ fontSize: "12px", color: "var(--green)", marginTop: "6px", fontWeight: 600 }}>
                ✓ Nome salvo com sucesso
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Dados */}
      <div className="card fade-up-3" style={{ overflow: "hidden", marginBottom: "16px" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Dados do App</p>
        </div>

        <div style={{ padding: "16px 18px 4px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
            {[
              { label: "Contas", value: stats.accounts, icon: "🏦" },
              { label: "Transações", value: stats.transactions, icon: "💸" },
              { label: "Cartões", value: stats.cards, icon: "💳" },
              { label: "Metas", value: stats.goals, icon: "🎯" },
            ].map(({ label, value, icon }) => (
              <div key={label} style={{
                padding: "12px 14px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
              }}>
                <p style={{ fontSize: "18px", marginBottom: "4px" }}>{icon}</p>
                <p style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", lineHeight: 1 }}>{value}</p>
                <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "4px 18px 16px" }}>
          <button
            className="btn-secondary"
            onClick={() => {
              const data = JSON.stringify(
                JSON.parse(localStorage.getItem("flowcash_v2") ?? "{}"),
                null, 2
              );
              const blob = new Blob([data], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `flowcash_backup_${new Date().toISOString().split("T")[0]}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            style={{ width: "100%", textAlign: "center" }}
          >
            Exportar dados (JSON)
          </button>
        </div>
      </div>

      {/* Categorias */}
      <div className="card fade-up-4" style={{ overflow: "hidden", marginBottom: "16px" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Categorias ({state.categories.length})
          </p>
        </div>
        <div style={{ padding: "12px 18px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {state.categories.map(cat => (
            <div key={cat.id} style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "6px 10px",
              background: `${cat.color}15`,
              border: `1px solid ${cat.color}30`,
              borderRadius: "20px",
            }}>
              <span style={{ fontSize: "13px" }}>{cat.icon}</span>
              <span style={{ fontSize: "12px", fontWeight: 600, color: cat.color }}>{cat.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Zona de perigo */}
      <div className="card fade-up-5" style={{ overflow: "hidden", marginBottom: "24px" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--red)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Zona de Perigo</p>
        </div>
        <div style={{ padding: "16px 18px" }}>
          <p style={{ fontSize: "13px", color: "var(--text-2)", marginBottom: "14px" }}>
            Apagar todos os dados do app. Esta ação não pode ser desfeita.
          </p>
          {!showClearConfirm ? (
            <button
              className="btn-danger"
              onClick={() => setShowClearConfirm(true)}
              style={{ width: "100%", textAlign: "center" }}
            >
              Apagar todos os dados
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--red)", textAlign: "center" }}>
                Tem certeza? Todos os dados serão apagados.
              </p>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  className="btn-danger"
                  onClick={clearAllData}
                  style={{ flex: 1, textAlign: "center" }}
                >
                  Sim, apagar tudo
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setShowClearConfirm(false)}
                  style={{ flex: 1, textAlign: "center" }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Versão */}
      {/* Sair da conta */}
      <div className="card fade-up-5" style={{ overflow: "hidden", marginBottom: "16px" }}>
        <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-1)" }}>Conta Google</p>
            <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>{user?.email ?? ""}</p>
          </div>
          <button
            className="btn-secondary"
            onClick={signOut}
            style={{ padding: "8px 16px", fontSize: "13px", flexShrink: 0 }}
          >
            Sair
          </button>
        </div>
      </div>

      <p style={{ textAlign: "center", fontSize: "11px", color: "var(--text-3)", paddingBottom: "8px" }}>
        FlowCash · Motor financeiro temporal · v2.0
      </p>
    </div>
  );
}
