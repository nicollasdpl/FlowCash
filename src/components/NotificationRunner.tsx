"use client";
import { useCallback, useEffect, useRef } from "react";
import { useApp } from "@/context/AppContext";
import { buildFinanceAlerts } from "@/lib/notifications/buildAlerts";
import { deliverFinanceAlerts, registerNotificationServiceWorker } from "@/lib/notifications/deliver";

/** Checa alertas financeiros ao abrir/voltar ao app e dispara notificação local (PWA). */
export default function NotificationRunner() {
  const { state, user, syncState } = useApp();
  const prefs = state.notificationPrefs;
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void registerNotificationServiceWorker();
  }, []);

  const runCheck = useCallback(async () => {
    if (!user || !prefs.enabled) return;
    const alerts = buildFinanceAlerts(state, prefs);
    if (alerts.length === 0) return;
    await deliverFinanceAlerts(user.uid, alerts);
  }, [prefs, state, user]);

  const scheduleCheck = useCallback(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(() => {
      void runCheck();
    }, 1200);
  }, [runCheck]);

  useEffect(() => {
    if (!user || !prefs.enabled) return;
    scheduleCheck();
    return () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, [user, prefs.enabled, syncState, scheduleCheck]);

  useEffect(() => {
    if (!user || !prefs.enabled) return;
    const onVis = () => {
      if (document.visibilityState === "visible") scheduleCheck();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user, prefs.enabled, scheduleCheck]);

  return null;
}
