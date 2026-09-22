"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, type AppState } from "@/context/AppContext";

function isAppStateShape(v: unknown): v is AppState {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.accounts) &&
    Array.isArray(o.transactions) &&
    Array.isArray(o.cards) &&
    Array.isArray(o.purchases) &&
    Array.isArray(o.installments) &&
    Array.isArray(o.categories)
  );
}

/**
 * Rota de emergência — NÃO linkada no app.
 * Acesse só pela URL: /importar-backup
 * Exige login + digitar CONFIRMAR antes de gravar no Firestore.
 */
export default function ImportarBackupPage() {
  const { user, authLoading, signIn, restoreFromBackup, state } = useApp();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmText, setConfirmText] = useState("");
  const [pending, setPending] = useState<AppState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(file: File | null) {
    setMsg(null);
    setPending(null);
    setConfirmText("");
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isAppStateShape(parsed)) {
        throw new Error("Arquivo inválido — precisa ser backup JSON do FlowCash.");
      }
      setPending(parsed);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha ao ler o arquivo.");
    }
  }

  async function runRestore() {
    if (!pending) return;
    if (confirmText !== "CONFIRMAR") {
      setMsg('Digite exatamente CONFIRMAR para continuar.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await restoreFromBackup(pending);
      setMsg(
        `Restaurado: ${pending.transactions.length} transações · ${pending.purchases.length} compras.`,
      );
      setPending(null);
      setConfirmText("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha ao restaurar.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
        <p style={{ color: "var(--text-3)" }}>Carregando…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
        <h1 className="page-title" style={{ fontSize: 20, marginBottom: 8 }}>
          Restaurar backup
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16, lineHeight: 1.45 }}>
          Faça login para restaurar um JSON no servidor desta conta.
        </p>
        <button className="btn-primary" type="button" onClick={() => void signIn()} style={{ width: "100%" }}>
          Entrar com Google
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1 className="page-title" style={{ fontSize: 20, marginBottom: 8 }}>
        Restaurar backup
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16, lineHeight: 1.45 }}>
        Rota de emergência. Substitui <strong>todos</strong> os dados da conta logada
        ({user.email}) no Firestore. Estado atual: {state.transactions.length} tx ·{" "}
        {state.purchases.length} compras.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        style={{ width: "100%", marginBottom: 12, fontSize: 13 }}
      />

      {pending && (
        <div
          className="soft-card"
          style={{ padding: 14, marginBottom: 12, border: "1px solid var(--red)", borderRadius: 12 }}
        >
          <p style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.4 }}>
            Backup: <strong>{pending.transactions.length}</strong> transações ·{" "}
            <strong>{pending.purchases.length}</strong> compras ·{" "}
            <strong>{pending.cards.length}</strong> cartões
          </p>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>
            Digite <strong>CONFIRMAR</strong> para gravar no servidor
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="CONFIRMAR"
            autoComplete="off"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-2)",
              color: "var(--text-1)",
              marginBottom: 10,
              fontSize: 14,
            }}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={busy || confirmText !== "CONFIRMAR"}
            onClick={() => void runRestore()}
            style={{ width: "100%", opacity: confirmText !== "CONFIRMAR" ? 0.5 : 1 }}
          >
            {busy ? "Restaurando…" : "Sobrescrever dados no servidor"}
          </button>
        </div>
      )}

      {msg && (
        <p
          style={{
            fontSize: 12,
            marginBottom: 12,
            color: msg.startsWith("Restaurado") ? "var(--green)" : "var(--red)",
            lineHeight: 1.4,
          }}
        >
          {msg}
        </p>
      )}

      <button type="button" className="btn-secondary" onClick={() => router.push("/")} style={{ width: "100%" }}>
        Voltar ao início
      </button>
    </div>
  );
}
