import type { FinanceAlert } from "./types";
import { alertDigestKey, formatAlertDigest } from "./buildAlerts";

const SW_PATH = "/sw.js";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
  } catch (err) {
    console.warn("[notifications] service worker registration failed:", err);
    return null;
  }
}

function dedupeStorageKey(uid: string): string {
  return `flowcash_notif_digest_${uid}`;
}

function wasDigestSentToday(uid: string, digestKey: string): boolean {
  try {
    const raw = localStorage.getItem(dedupeStorageKey(uid));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { date: string; key: string };
    const today = new Date().toISOString().split("T")[0]!;
    return parsed.date === today && parsed.key === digestKey;
  } catch {
    return false;
  }
}

function markDigestSent(uid: string, digestKey: string) {
  try {
    const today = new Date().toISOString().split("T")[0]!;
    localStorage.setItem(dedupeStorageKey(uid), JSON.stringify({ date: today, key: digestKey }));
  } catch {
    // ignore
  }
}

export async function showNotificationNow(
  title: string,
  body: string,
  options?: { tag?: string; requireInteraction?: boolean },
): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;

  const notifOptions: NotificationOptions = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: options?.tag ?? "flowcash-test",
    data: { url: "/" },
    requireInteraction: options?.requireInteraction ?? false,
  };

  try {
    const reg = await registerNotificationServiceWorker();
    if (reg?.showNotification) {
      await reg.showNotification(title, notifOptions);
    } else {
      new Notification(title, notifOptions);
    }
    return true;
  } catch (err) {
    console.warn("[notifications] show failed:", err);
    return false;
  }
}

/** Teste manual — ignora limite de 1 por dia. Usa alertas reais ou mensagem de exemplo. */
export async function testFinanceNotification(
  alerts: FinanceAlert[],
): Promise<{ ok: boolean; hint: string }> {
  if (!notificationsSupported()) {
    return { ok: false, hint: "Notificações não suportadas neste navegador." };
  }

  let perm: NotificationPermission | "unsupported" = Notification.permission;
  if (perm !== "granted") {
    perm = await requestNotificationPermission();
  }
  if (perm !== "granted") {
    return { ok: false, hint: "Permissão negada. Libere nas configurações do Chrome." };
  }

  await registerNotificationServiceWorker();

  if (alerts.length > 0) {
    const { title, body } = formatAlertDigest(alerts);
    const ok = await showNotificationNow(title, body, {
      tag: "flowcash-test",
      requireInteraction: alerts.some(a => a.kind === "overdue"),
    });
    return {
      ok,
      hint: ok
        ? "Notificação enviada com seus lembretes atuais."
        : "Não foi possível exibir a notificação.",
    };
  }

  const ok = await showNotificationNow(
    "FlowCash — teste",
    "Vence hoje: Conta de luz · R$ 136,88\nFatura Nubank vence amanhã · R$ 563,42",
    { tag: "flowcash-test" },
  );
  return {
    ok,
    hint: ok
      ? "Notificação de exemplo enviada (nenhum lembrete real no momento)."
      : "Não foi possível exibir a notificação.",
  };
}

export async function deliverFinanceAlerts(uid: string, alerts: FinanceAlert[]): Promise<boolean> {
  if (alerts.length === 0) return false;
  if (!notificationsSupported() || Notification.permission !== "granted") return false;

  const digestKey = alertDigestKey(alerts);
  if (wasDigestSentToday(uid, digestKey)) return false;

  const { title, body } = formatAlertDigest(alerts);
  if (!body) return false;

  const options: NotificationOptions = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `flowcash-${digestKey.slice(0, 32)}`,
    data: { url: "/" },
    requireInteraction: alerts.some(a => a.kind === "overdue"),
  };

  try {
    const reg = await registerNotificationServiceWorker();
    if (reg?.showNotification) {
      await reg.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
    markDigestSent(uid, digestKey);
    return true;
  } catch (err) {
    console.warn("[notifications] deliver failed:", err);
    return false;
  }
}
