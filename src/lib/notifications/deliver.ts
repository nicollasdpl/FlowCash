import type { FinanceAlert } from "./types";
import { formatAlertDigest } from "./buildAlerts";

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
    return await navigator.serviceWorker.register(SW_PATH, {
      scope: "/",
      updateViaCache: "none",
    });
  } catch (err) {
    console.warn("[notifications] service worker registration failed:", err);
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
      return await navigator.serviceWorker.register(SW_PATH, {
        scope: "/",
        updateViaCache: "none",
      });
    } catch (retryErr) {
      console.warn("[notifications] service worker retry failed:", retryErr);
      return null;
    }
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

/** Teste local imediato (fallback se push servidor falhar). */
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
        ? "Notificação local enviada com seus lembretes atuais."
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

export async function deliverFinanceAlerts(_uid: string, alerts: FinanceAlert[]): Promise<boolean> {
  if (alerts.length === 0) return false;
  if (!notificationsSupported() || Notification.permission !== "granted") return false;

  const { title, body } = formatAlertDigest(alerts);
  if (!body) return false;

  const options: NotificationOptions = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "flowcash-local",
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
    return true;
  } catch (err) {
    console.warn("[notifications] deliver failed:", err);
    return false;
  }
}
