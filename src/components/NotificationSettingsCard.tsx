"use client";
import { useState } from "react";
import { Bell } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { buildFinanceAlerts } from "@/lib/notifications/buildAlerts";
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from "@/lib/notifications/types";
import {
  notificationPermission,
  notificationsSupported,
  registerNotificationServiceWorker,
  requestNotificationPermission,
  testFinanceNotification,
} from "@/lib/notifications/deliver";
import { syncPushSubscription } from "@/lib/notifications/fcmClient";
import "@/lib/firebase";

const TOGGLE_ITEMS: { key: keyof Omit<NotificationPrefs, "enabled">; label: string; desc: string }[] = [
  { key: "overdue", label: "Contas em atraso", desc: "Despesas com data já passada" },
  { key: "dueToday", label: "Vence hoje", desc: "Despesas com vencimento hoje" },
  { key: "dueTomorrow", label: "Vence amanhã", desc: "Lembrete um dia antes" },
  { key: "incomeToday", label: "A receber hoje", desc: "Receitas previstas para hoje" },
  { key: "cardInvoiceDue", label: "Fatura do cartão", desc: "Até 3 dias antes do vencimento" },
  { key: "budgetOver", label: "Orçamento estourado", desc: "Quando passar de 100% do limite" },
  { key: "budgetWarning", label: "Orçamento em risco", desc: "Quando passar de 80% do limite" },
];

export default function NotificationSettingsCard() {
  const { state, dispatch, user } = useApp();
  const prefs = state.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;
  const supported = notificationsSupported();
  const perm = notificationPermission();
  const [testHint, setTestHint] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [pushHint, setPushHint] = useState<string | null>(null);

  function update(patch: Partial<NotificationPrefs>) {
    dispatch({
      type: "SET_NOTIFICATION_PREFS",
      payload: { ...prefs, ...patch },
    });
  }

  async function toggleMaster() {
    if (!supported) return;

    if (!prefs.enabled) {
      const result = await requestNotificationPermission();
      if (result !== "granted") return;
      await registerNotificationServiceWorker();
      update({ enabled: true });
      if (user) {
        const idToken = await user.getIdToken();
        const sync = await syncPushSubscription(idToken, true);
        setPushHint(sync.ok ? "Push ativo — lembretes chegam com o app fechado." : sync.hint ?? null);
      }
      return;
    }

    if (user) {
      const idToken = await user.getIdToken();
      await syncPushSubscription(idToken, false);
    }
    setPushHint(null);
    update({ enabled: false });
  }

  function toggleItem(key: keyof Omit<NotificationPrefs, "enabled">) {
    update({ [key]: !prefs[key] });
  }

  async function handleTestNotification() {
    setTesting(true);
    setTestHint(null);

    if (user) {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/push/test", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json() as { ok?: boolean; hint?: string };
        if (data.ok && data.hint) {
          setTestHint(data.hint);
          setTesting(false);
          return;
        }
        if (data.hint) {
          setTestHint(data.hint);
          setTesting(false);
          return;
        }
      } catch {
        // fallback local abaixo
      }
    }

    const alerts = buildFinanceAlerts(state, { ...prefs, enabled: true });
    const result = await testFinanceNotification(alerts);
    setTestHint(result.hint);
    setTesting(false);
  }

  const permLabel =
    perm === "granted"
      ? "Permissão concedida · push com app fechado ativo após ativar"
      : perm === "denied"
        ? "Bloqueado no navegador — libere nas configurações do Chrome"
        : perm === "default"
          ? "Toque em ativar para permitir"
          : "Não suportado neste dispositivo";

  const permColor =
    perm === "granted" ? "var(--accent)" : perm === "denied" ? "var(--red)" : "var(--text-3)";

  return (
    <div className="card fade-up-3" style={{ overflow: "hidden", marginBottom: "14px" }}>
      <div style={{
        padding: "13px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}>
        <Bell size={16} strokeWidth={1.5} color="var(--accent)" />
        <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Notificações
        </p>
      </div>

      <div style={{ padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-1)" }}>Lembretes financeiros</p>
            <p style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "3px", lineHeight: 1.4 }}>
              Push automático às 8h, 12h e 18h (horário de Brasília) via Firebase, mesmo com o app fechado. Ao abrir o app, também avisa se houver pendências.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void toggleMaster()}
            disabled={!supported}
            aria-pressed={prefs.enabled}
            style={{
              width: "48px",
              height: "28px",
              borderRadius: "999px",
              border: "none",
              flexShrink: 0,
              background: prefs.enabled ? "var(--accent)" : "var(--bg-input)",
              position: "relative",
              cursor: supported ? "pointer" : "not-allowed",
              opacity: supported ? 1 : 0.5,
            }}
          >
            <span style={{
              position: "absolute",
              top: "3px",
              left: prefs.enabled ? "23px" : "3px",
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              background: "#fff",
              transition: "left 0.15s ease",
            }} />
          </button>
        </div>

        <p style={{ fontSize: "11px", color: permColor, marginBottom: pushHint ? "4px" : "12px", lineHeight: 1.4 }}>
          {permLabel}
        </p>
        {pushHint && (
          <p style={{ fontSize: "11px", color: "var(--accent)", marginBottom: "12px", lineHeight: 1.4 }}>
            {pushHint}
          </p>
        )}

        <button
          type="button"
          className="btn-secondary"
          disabled={!supported || testing}
          onClick={() => void handleTestNotification()}
          style={{ width: "100%", justifyContent: "center", marginBottom: testHint ? "8px" : prefs.enabled ? "0" : "0" }}
        >
          {testing ? "Enviando..." : "Testar notificação"}
        </button>
        {testHint && (
          <p style={{
            fontSize: "11px",
            color: testHint.includes("enviad") ? "var(--accent)" : "var(--red)",
            lineHeight: 1.4,
            marginBottom: prefs.enabled ? "14px" : "0",
          }}>
            {testHint}
          </p>
        )}

        {prefs.enabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0", borderTop: "1px solid var(--border)", marginTop: "4px" }}>
            {TOGGLE_ITEMS.map((item, i) => (
              <div
                key={item.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  padding: "12px 0",
                  borderBottom: i < TOGGLE_ITEMS.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>{item.label}</p>
                  <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>{item.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleItem(item.key)}
                  aria-pressed={prefs[item.key]}
                  style={{
                    width: "42px",
                    height: "26px",
                    borderRadius: "999px",
                    border: "none",
                    flexShrink: 0,
                    background: prefs[item.key] ? "var(--accent)" : "var(--bg-input)",
                    position: "relative",
                    cursor: "pointer",
                  }}
                >
                  <span style={{
                    position: "absolute",
                    top: "3px",
                    left: prefs[item.key] ? "19px" : "3px",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 0.15s ease",
                  }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
