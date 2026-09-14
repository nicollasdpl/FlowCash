import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import { app } from "@/lib/firebase";
import { registerNotificationServiceWorker } from "./deliver";

let messagingInstance: Messaging | null = null;
let messagingInitError: string | null = null;

export async function fcmSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

async function getMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (messagingInstance) return messagingInstance;

  const supported = await fcmSupported();
  if (!supported) {
    messagingInitError = "Push FCM não é suportado neste navegador/dispositivo.";
    return null;
  }

  try {
    messagingInstance = getMessaging(app);
    messagingInitError = null;
    return messagingInstance;
  } catch (err) {
    messagingInitError = err instanceof Error ? err.message : String(err);
    console.warn("[fcm] getMessaging failed:", err);
    return null;
  }
}

export async function getFcmToken(): Promise<{ token: string | null; error?: string }> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
  if (!vapidKey) {
    return { token: null, error: "Chave VAPID ausente no build. Redeploy necessário." };
  }

  if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
    return { token: null, error: "Permissão de notificação não concedida." };
  }

  if (!("serviceWorker" in navigator)) {
    return { token: null, error: "Service Worker indisponível neste contexto." };
  }

  const messaging = await getMessagingInstance();
  if (!messaging) {
    return {
      token: null,
      error: messagingInitError
        ? `Firebase Messaging: ${messagingInitError}`
        : "Firebase Messaging não inicializou.",
    };
  }

  const registration = await registerNotificationServiceWorker();
  if (!registration) {
    return { token: null, error: "Service worker não registrou." };
  }

  try {
    // Espera o SW ficar ativo e controlar a página
    const ready = await navigator.serviceWorker.ready;
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    // Em PWA Android, às vezes o controller ainda não está pronto
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>(resolve => {
        const t = setTimeout(() => resolve(), 1500);
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            clearTimeout(t);
            resolve();
          },
          { once: true },
        );
      });
    }
    await new Promise(r => setTimeout(r, 300));

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: ready,
    });

    if (!token) {
      return { token: null, error: "FCM retornou token vazio. Feche o app e abra de novo." };
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
  void (async () => {
    try {
      const messaging = await getMessagingInstance();
      if (!messaging) return;
      onMessage(messaging, payload => {
        const title = payload.notification?.title || "FlowCash";
        const body = payload.notification?.body || "";
        onPayload(title, body);
      });
    } catch {
      // ignore
    }
  })();
  return () => {};
}
