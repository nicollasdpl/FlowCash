"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import type { Category } from "@/context/AppContext";
import CategoryModal from "@/components/CategoryModal";
import CategoryIcon from "@/components/CategoryIcon";
import { Landmark, BarChart2, TrendingUp, ArrowUpDown, CreditCard, Target } from "lucide-react";

export default function Configuracoes() {
  const { state, dispatch, user, signOut } = useApp();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(state.userName ?? "");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
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

  const navItems = [
    { href: "/contas", Icon: Landmark, label: "Minhas Contas", desc: `${stats.accounts} conta${stats.accounts !== 1 ? "s" : ""} cadastrada${stats.accounts !== 1 ? "s" : ""}` },
    { href: "/orcamentos", Icon: BarChart2, label: "Orçamentos", desc: `${state.budgets.length} limite${state.budgets.length !== 1 ? "s" : ""} definido${state.budgets.length !== 1 ? "s" : ""}` },
    { href: "/relatorios", Icon: TrendingUp, label: "Relatórios", desc: "Análises e gráficos" },
  ];

  const statItems = [
    { label: "Contas", value: stats.accounts, Icon: Landmark },
    { label: "Transações", value: stats.transactions, Icon: ArrowUpDown },
    { label: "Cartões", value: stats.cards, Icon: CreditCard },
    { label: "Metas", value: stats.goals, Icon: Target },
  ];

  return (
    <div style={{ padding: "16px", maxWidth: "640px", margin: "0 auto" }}>
      {showCatModal && <CategoryModal onClose={() => setShowCatModal(false)} />}
      {editCat && <CategoryModal category={editCat} onClose={() => setEditCat(null)} />}

      {/* Header */}
      <div className="fade-up-1" style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.03em" }}>
          Configurações
        </h1>
        <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "3px" }}>
          Personalize o FlowCash
        </p>
      </div>

      {/* ── Navegação rápida ── */}
      <div className="card fade-up-1" style={{ overflow: "hidden", marginBottom: "14px" }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Seções
          </p>
        </div>
        {navItems.map((item, i) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "flex", alignItems: "center", gap: "14px",
              padding: "14px 16px",
              borderBottom: i < navItems.length - 1 ? "1px solid var(--border)" : "none",
              textDecoration: "none",
            }}
          >
            <div style={{
              width: "40px", height: "40px", borderRadius: "12px", flexShrink: 0,
              background: "var(--bg-input)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <item.Icon size={20} strokeWidth={1.5} color="var(--text-2)" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-1)" }}>{item.label}</p>
              <p style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "2px" }}>{item.desc}</p>
            </div>
            <span style={{ color: "var(--text-3)", fontSize: "16px" }}>›</span>
          </Link>
        ))}
      </div>

      {/* Perfil */}
      <div className="card fade-up-2" style={{ overflow: "hidden", marginBottom: "14px" }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Perfil
          </p>
        </div>

        <div style={{ padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
            {user?.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" width={52} height={52} style={{ borderRadius: "16px", flexShrink: 0 }} />
            ) : (
              <div style={{
                width: "52px", height: "52px", borderRadius: "16px", flexShrink: 0,
                background: "var(--accent-10)", border: "1px solid var(--border-accent)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "22px", color: "var(--accent)", fontWeight: 700,
              }}>
                {(state.userName || user?.displayName || "?")[0].toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <p style={{
                fontSize: "15px", fontWeight: 700, color: "var(--text-1)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {state.userName || user?.displayName || "Sem nome"}
              </p>
              <p style={{
                fontSize: "11.5px", color: "var(--text-3)", marginTop: "2px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {user?.email ?? ""}
              </p>
            </div>
          </div>

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
                <button className="btn-primary" onClick={saveName} disabled={!nameInput.trim()} style={{ padding: "0 16px", flexShrink: 0, minWidth: "70px" }}>
                  OK
                </button>
              </div>
            ) : (
              <div
                onClick={startEdit}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 16px",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)",
                  cursor: "pointer", minHeight: "52px",
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
      <div className="card fade-up-3" style={{ overflow: "hidden", marginBottom: "14px" }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Dados do App
          </p>
        </div>

        <div style={{ padding: "14px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
            {statItems.map(({ label, value, Icon }) => (
              <div key={label} style={{
                padding: "12px 14px",
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
              }}>
                <div style={{ marginBottom: "4px", color: "var(--text-3)" }}>
                  <Icon size={16} strokeWidth={1.5} />
                </div>
                <p style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-1)", lineHeight: 1 }}>{value}</p>
                <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>{label}</p>
              </div>
            ))}
          </div>
          <button
            className="btn-secondary"
            onClick={() => {
              const data = JSON.stringify(JSON.parse(localStorage.getItem("flowcash_v2") ?? "{}"), null, 2);
              const blob = new Blob([data], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `flowcash_backup_${new Date().toISOString().split("T")[0]}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            style={{ width: "100%", textAlign: "center", justifyContent: "center" }}
          >
            Exportar dados (JSON)
          </button>
        </div>
      </div>

      {/* Categorias */}
      <div className="card fade-up-4" style={{ overflow: "hidden", marginBottom: "14px" }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Categorias ({state.categories.length})
          </p>
          <button
            onClick={() => setShowCatModal(true)}
            style={{
              background: "var(--accent-10)", border: "1px solid var(--border-accent)",
              borderRadius: "8px", color: "var(--accent)", fontWeight: 700,
              fontSize: "13px", padding: "6px 12px", cursor: "pointer",
              fontFamily: "inherit", minHeight: "36px",
            }}
          >+ Nova</button>
        </div>
        <div style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: "7px" }}>
          {state.categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setEditCat(cat)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "5px",
                padding: "6px 10px",
                background: `${cat.color}12`,
                border: `1px solid ${cat.color}28`,
                borderRadius: "20px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <CategoryIcon icon={cat.icon} color={cat.color} size={13} />
              <span style={{ fontSize: "11.5px", fontWeight: 600, color: cat.color }}>{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Conta */}
      <div className="card fade-up-5" style={{ overflow: "hidden", marginBottom: "14px" }}>
        <div style={{
          padding: "14px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-1)" }}>Conta Google</p>
            <p style={{
              fontSize: "12px", color: "var(--text-3)", marginTop: "2px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {user?.email ?? ""}
            </p>
          </div>
          <button
            className="btn-secondary"
            onClick={signOut}
            style={{ padding: "10px 16px", fontSize: "13px", flexShrink: 0, marginLeft: "12px", minHeight: "44px" }}
          >
            Sair
          </button>
        </div>
      </div>

      {/* Zona de perigo */}
      <div className="card fade-up-5" style={{ overflow: "hidden", marginBottom: "20px", borderColor: "var(--red-20)" }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--red-20)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--red)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Zona de Perigo
          </p>
        </div>
        <div style={{ padding: "14px 16px" }}>
          <p style={{ fontSize: "13px", color: "var(--text-2)", marginBottom: "12px", lineHeight: 1.5 }}>
            Apagar todos os dados. Esta ação não pode ser desfeita.
          </p>
          {!showClearConfirm ? (
            <button
              className="btn-danger"
              onClick={() => setShowClearConfirm(true)}
              style={{ width: "100%", textAlign: "center", justifyContent: "center" }}
            >
              Apagar todos os dados
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--red)", textAlign: "center" }}>
                Tem certeza? Esta ação é irreversível.
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn-danger" onClick={clearAllData} style={{ flex: 1, justifyContent: "center" }}>
                  Sim, apagar
                </button>
                <button className="btn-secondary" onClick={() => setShowClearConfirm(false)} style={{ flex: 1, justifyContent: "center" }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <p style={{ textAlign: "center", fontSize: "11px", color: "var(--text-4)", paddingBottom: "8px" }}>
        FlowCash v2.0 · Motor financeiro temporal
      </p>
    </div>
  );
}
