import { getMessaging } from "firebase-admin/messaging";
import { adminDb } from "@/lib/firebase-admin";
import type { AppState } from "@/context/AppContext";
import { buildFinanceAlerts, formatAlertDigest } from "./buildAlerts";
import { DEFAULT_NOTIFICATION_PREFS } from "./types";

export interface PushTokenDoc {
  token: string;
  userAgent?: string;
  createdAt?: unknown;
  lastSeenAt?: unknown;
}

function tokenDocId(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash |= 0;
  }
  return `t_${Math.abs(hash)}`;
}

export async function savePushToken(uid: string, token: string, userAgent?: string) {
  const ref = adminDb().doc(`users/${uid}/pushTokens/${tokenDocId(token)}`);
  await ref.set(
    {
      token,
      userAgent: userAgent ?? null,
      lastSeenAt: new Date(),
      createdAt: new Date(),
    },
    { merge: true },
  );
}

export async function removePushToken(uid: string, token: string) {
  await adminDb().doc(`users/${uid}/pushTokens/${tokenDocId(token)}`).delete();
}

export async function listPushTokens(uid: string): Promise<string[]> {
  const snap = await adminDb().collection(`users/${uid}/pushTokens`).get();
  return snap.docs
    .map(d => (d.data() as PushTokenDoc).token)
    .filter((t): t is string => typeof t === "string" && t.length > 0);
}

export async function loadUserAppState(uid: string): Promise<AppState | null> {
  const snap = await adminDb().doc(`users/${uid}/app/state`).get();
  if (!snap.exists) return null;
  return snap.data() as AppState;
}

export async function sendMulticastPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number; invalidTokens: string[] }> {
  if (tokens.length === 0) return { sent: 0, invalidTokens: [] };

  const messaging = getMessaging();
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: data ?? {},
    webpush: {
      fcmOptions: { link: data?.url ?? "/" },
      notification: {
        icon: "/icon-192.png",
        badge: "/icon-192.png",
      },
    },
  });

  const invalidTokens: string[] = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code ?? "";
      if (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered"
      ) {
        invalidTokens.push(tokens[i]!);
      }
    }
  });

  return { sent: res.successCount, invalidTokens };
}

export async function sendFinanceAlertsToUser(uid: string): Promise<{ sent: boolean; reason?: string }> {
  const state = await loadUserAppState(uid);
  if (!state) return { sent: false, reason: "no_state" };

  const prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...(state.notificationPrefs ?? {}) };
  if (!prefs.enabled) return { sent: false, reason: "disabled" };

  const alerts = buildFinanceAlerts(state, prefs);
  if (alerts.length === 0) return { sent: false, reason: "no_alerts" };

  const tokens = await listPushTokens(uid);
  if (tokens.length === 0) return { sent: false, reason: "no_tokens" };

  const { title, body } = formatAlertDigest(alerts);
  if (!body) return { sent: false, reason: "empty_body" };

  const { sent, invalidTokens } = await sendMulticastPush(tokens, title, body, {
    url: "/",
    tag: "flowcash-finance",
    requireInteraction: alerts.some(a => a.kind === "overdue") ? "true" : "false",
  });

  for (const bad of invalidTokens) {
    await removePushToken(uid, bad);
  }

  return { sent: sent > 0 };
}

export async function sendTestPushToUser(uid: string, title: string, body: string) {
  const tokens = await listPushTokens(uid);
  if (tokens.length === 0) return { sent: 0, invalidTokens: [] as string[] };
  const result = await sendMulticastPush(tokens, title, body, {
    url: "/",
    tag: "flowcash-test",
  });
  for (const bad of result.invalidTokens) {
    await removePushToken(uid, bad);
  }
  return result;
}
