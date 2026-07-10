import { getApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import "@/lib/firebase";
import { registerNotificationServiceWorker } from "./deliver";

let messagingInstance: Messaging | null = null;

export async function fcmSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

function getMessagingInstance(): Messaging | null {
  if (typeof window === "undefined") return null;
  if (messagingInstance) return messagingInstance;
  try {
    const app = getApp();
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch {
    return null;
  }
}

export async function getFcmToken(): Promise<{ token: string | null; error?: string }> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
  if (!vapidKey) {
    return { token: null, error: "Chave VAPID ausente no build. Redeploy necessário." };
  }

  const supported = await fcmSupported();
  if (!supported) {
    return { token: null, error: "Push FCM não é suportado neste navegador." };
  }

  if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
    return { token: null, error: "Permissão de notificação não concedida." };
  }

  const messaging = getMessagingInstance();
  if (!messaging) {
    return { token: null, error: "Firebase Messaging não inicializou." };
  }

  const registration = await registerNotificationServiceWorker();
  if (!registration) {
    return { token: null, error: "Service worker não registrou." };
  }

  try {
    await navigator.serviceWorker.ready;
    // Garante que o SW ativo está controlando a página antes do getToken
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    await new Promise(r => setTimeout(r, 400));

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      return { token: null, error: "FCM retornou token vazio. Tente fechar e reabrir o app." };
    }
    return { token };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[fcm] getToken failed:", err);
    return { token: null, error: `Falha no token FCM: ${msg}` };
  }
}

export async function registerPushTokenWithServer(idToken: string, token: string): Promise<boolean> {
  const res = await fetch("/api/push/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ token, userAgent: navigator.userAgent }),
  });
  return res.ok;
}

export async function unregisterPushTokenWithServer(idToken: string, token: string): Promise<void> {
  await fetch("/api/push/register", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ token }),
  });
}

export async function syncPushSubscription(
  idToken: string,
  enabled: boolean,
): Promise<{ ok: boolean; hint?: string }> {
  if (!enabled) {
    const { token } = await getFcmToken();
    if (token) await unregisterPushTokenWithServer(idToken, token);
    return { ok: true };
  }

  const { token, error } = await getFcmToken();
  if (!token) {
    return {
      ok: false,
      hint: error ?? "Não foi possível obter o token push.",
    };
  }

  const ok = await registerPushTokenWithServer(idToken, token);
  return ok
    ? { ok: true }
    : { ok: false, hint: "Falha ao registrar o dispositivo no servidor." };
}

export function listenForegroundMessages(onPayload: (title: string, body: string) => void) {
  try {
    const messaging = getMessagingInstance();
    if (!messaging) return () => {};
    return onMessage(messaging, payload => {
      const title = payload.notification?.title || "FlowCash";
      const body = payload.notification?.body || "";
      onPayload(title, body);
    });
  } catch {
    return () => {};
  }
}
