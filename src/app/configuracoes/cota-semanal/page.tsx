"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, RotateCcw } from "lucide-react";
import { useApp, type AppState } from "@/context/AppContext";
import { deriveVariableCategoryIds } from "@/lib/budgetPacing";
import { readConfirmedAppState, readVariableCategoryConfig, saveVariableCategoryConfig } from "@/lib/budgetPacingStore";

function currentSaoPauloMonth(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}`;
}

export default function CotaSemanalSettingsPage() {
  const router = useRouter();
  const { user } = useApp();
  const [remote, setRemote] = useState<AppState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [useDefault, setUseDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const month = currentSaoPauloMonth();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const confirmed = await readConfirmedAppState(user.uid);
        if (!confirmed || cancelled) return;
        const state = confirmed.state;
        const configured = await readVariableCategoryConfig(user.uid);
        if (cancelled) return;
        setRemote(state);
        setUseDefault(configured === null);
        setSelected(deriveVariableCategoryIds(state.budgets, month, configured));
      } catch {
        if (!cancelled) setError("Não foi possível carregar a configuração. Verifique a conexão.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, month]);

  const categories = remote?.categories.filter(category => category.type === "expense" && !category.isSystem) ?? [];
  const defaults = deriveVariableCategoryIds(remote?.budgets ?? [], month);

  function toggle(id: string) {
    setUseDefault(false);
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }
  async function save() {
    if (!user || !remote || saving) return;
    setSaving(true);
    setError("");
    try {
      await saveVariableCategoryConfig(user.uid, useDefault ? null : selected);
      router.back();
    } catch {
      setError("Não foi possível salvar. Tente novamente.");
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "max(16px, var(--safe-top)) 16px calc(var(--bottom-nav-total) + 24px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <button type="button" onClick={() => router.back()} className="icon-btn ghost" aria-label="Voltar" style={{ width: 44, height: 44 }}><ArrowLeft size={20} /></button>
        <div>
          <h1 className="page-title" style={{ fontSize: 20 }}>Categorias da cota semanal</h1>
          <p style={{ color: "var(--text-2)", fontSize: 12 }}>Escolha os gastos variáveis que entram na barra.</p>
        </div>
      </div>
      {loading && <p style={{ color: "var(--text-2)", fontSize: 13 }}>Carregando categorias…</p>}
      {error && <p role="alert" style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {!loading && remote && <>
        <div className="soft-card" style={{ padding: 16, marginBottom: 14 }}>
          <p style={{ color: "var(--text-1)", fontSize: 14, fontWeight: 600 }}>Padrão: orçamentos deste mês</p>
          <p style={{ color: "var(--text-2)", fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>Hoje, {defaults.length} categoria{defaults.length === 1 ? "" : "s"} com orçamento mensal. Uma seleção personalizada permanece nas próximas semanas até você alterá-la.</p>
          {!useDefault && <button type="button" className="link-quiet" onClick={() => { setUseDefault(true); setSelected(defaults); }} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}><RotateCcw size={14} /> Usar padrão novamente</button>}
        </div>
        <div className="soft-card" style={{ overflow: "hidden", marginBottom: 14 }}>
          {categories.map((category, index) => <label key={category.id} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 52, padding: "10px 16px", borderBottom: index < categories.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer" }}>
            <input type="checkbox" checked={selected.includes(category.id)} onChange={() => toggle(category.id)} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
            <span style={{ flex: 1, color: "var(--text-1)", fontSize: 14 }}>{category.name}</span>
            {defaults.includes(category.id) && <span style={{ color: "var(--text-3)", fontSize: 11 }}>Orçamento</span>}
          </label>)}
          {categories.length === 0 && <p style={{ padding: 16, color: "var(--text-2)", fontSize: 13 }}>Nenhuma categoria de despesa cadastrada.</p>}
        </div>
        <p style={{ color: "var(--text-3)", fontSize: 11, lineHeight: 1.5, marginBottom: 16 }}>A seleção será usada na próxima semana se já houver uma cota semanal registrada para a semana atual.</p>
        <button type="button" className="btn-primary" disabled={saving} onClick={() => void save()} style={{ width: "100%", minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Check size={17} />{saving ? "Salvando…" : "Salvar categorias"}</button>
        <button type="button" className="link-quiet" onClick={() => router.push("/configuracoes/cota-semanal/recalcular")} style={{ marginTop: 20, minHeight: 44 }}>Recalcular esta semana</button>
      </>}
    </div>
  );
}
