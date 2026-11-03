"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getSpendingRoom } from "@/engine/reportInsightsEngine";
import { buildWeekAnchor, collectWeekVariableSpend, getWeekBounds, replaceWeekSnapshot, snapshotReadiness } from "@/lib/budgetPacing";
import { createWeekSnapshotOnce, deleteCurrentWeekSnapshot, readConfirmedAppState } from "@/lib/budgetPacingStore";

function saoPauloToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default function RecalcularCotaPage() {
  const { user } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirmRecalculation() {
    if (!user || busy) return;
    setBusy(true);
    setError("");
    try {
      const todayStr = saoPauloToday();
      const confirmed = await readConfirmedAppState(user.uid);
      if (!confirmed) throw new Error("Dados do servidor indisponíveis.");
      const remote = confirmed.state;
      const readiness = snapshotReadiness(confirmed.hydrated, remote);
      if (readiness !== "ready") throw new Error("Contas ou dados ainda não carregados.");
      const bounds = getWeekBounds(todayStr);
      const spend = collectWeekVariableSpend({ bounds, throughDate: todayStr, accounts: remote.accounts,
        transactions: remote.transactions, purchases: remote.purchases, installments: remote.installments, cards: remote.cards });
      const room = getSpendingRoom(remote.accounts, remote.transactions, remote.cards, remote.installments, todayStr, remote.purchases);
      const replacement = buildWeekAnchor(room.free, bounds, spend);
      await replaceWeekSnapshot(replacement, confirmed.hydrated, remote,
        () => deleteCurrentWeekSnapshot(user.uid, bounds.semanaInicio),
        async snapshot => { await createWeekSnapshotOnce(user.uid, snapshot, confirmed); });
      router.push("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível recalcular esta semana.");
      setBusy(false);
    }
  }

  return <div style={{ maxWidth: 680, margin: "0 auto", padding: "max(16px, var(--safe-top)) 16px calc(var(--bottom-nav-total) + 24px)" }}>
    <button type="button" onClick={() => router.back()} className="icon-btn ghost" aria-label="Voltar" style={{ width: 44, height: 44, marginBottom: 16 }}><ArrowLeft size={20} /></button>
    <div className="soft-card" style={{ padding: 20 }}>
      <AlertTriangle size={23} color="var(--amber)" strokeWidth={1.7} />
      <h1 className="page-title" style={{ fontSize: 20, marginTop: 12 }}>Recalcular esta semana?</h1>
      <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>O registro da semana atual será apagado e recriado com os lançamentos que estão no servidor agora. A nova cota poderá ser diferente.</p>
      {error && <p role="alert" style={{ color: "var(--red)", fontSize: 12, marginTop: 14 }}>{error}</p>}
      <button type="button" className="btn-primary" disabled={busy || !user} onClick={() => void confirmRecalculation()} style={{ width: "100%", minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20 }}><RotateCcw size={17} />{busy ? "Recalculando…" : "Confirmar recálculo"}</button>
    </div>
  </div>;
}
