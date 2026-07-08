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

export async function getFcmToken(): Promise<string | null> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn("[fcm] NEXT_PUBLIC_FIREBASE_VAPID_KEY ausente");
    return null;
  }
  const supported = await fcmSupported();
  if (!supported) return null;

  const messaging = getMessagingInstance();
  if (!messaging) return null;

  const registration = await registerNotificationServiceWorker();
  if (!registration) return null;

  try {
    return await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  } catch (err) {
    console.warn("[fcm] getToken failed:", err);
    return null;
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
    const token = await getFcmToken();
    if (token) await unregisterPushTokenWithServer(idToken, token);
    return { ok: true };
  }

  const token = await getFcmToken();
  if (!token) {
    return {
      ok: false,
      hint: "Não foi possível obter o token push. Verifique a chave VAPID no Firebase.",
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
