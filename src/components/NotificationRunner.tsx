"use client";
import { useCallback, useEffect, useRef } from "react";
import { useApp } from "@/context/AppContext";
import { buildFinanceAlerts } from "@/lib/notifications/buildAlerts";
import { deliverFinanceAlerts, registerNotificationServiceWorker, showNotificationNow } from "@/lib/notifications/deliver";
import { listenForegroundMessages, syncPushSubscription, fcmSupported } from "@/lib/notifications/fcmClient";
import "@/lib/firebase";

/** Checa alertas ao abrir o app (local) e mantém registro FCM para push com app fechado. */
export default function NotificationRunner() {
  const { state, user, syncState } = useApp();
  const prefs = state.notificationPrefs;
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void registerNotificationServiceWorker();
  }, []);

  useEffect(() => {
    if (!user || !prefs.enabled) return;
    let cancelled = false;
    void (async () => {
      const idToken = await user.getIdToken();
      const result = await syncPushSubscription(idToken, true);
      if (!cancelled && !result.ok) {
        console.warn("[notifications] push sync:", result.hint);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, prefs.enabled]);

  useEffect(() => {
    if (!user || !prefs.enabled) {
      if (user && !prefs.enabled) {
        void user.getIdToken().then(idToken => syncPushSubscription(idToken, false));
      }
      return;
    }
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void fcmSupported().then(supported => {
      if (cancelled || !supported) return;
      unsubscribe = listenForegroundMessages((title, body) => {
        void showNotificationNow(title, body, { tag: "flowcash-foreground" });
      });
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [user, prefs.enabled]);

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
