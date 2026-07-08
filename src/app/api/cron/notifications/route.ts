import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { runScheduledNotificationsForAllUsers } from "@/lib/notifications/scheduledPush";

export const maxDuration = 300;

function isAuthorizedCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  const secrets = [process.env.CRON_SECRET, process.env.NOTIFICATION_CRON_SECRET].filter(
    (s): s is string => Boolean(s),
  );
  return secrets.some(s => s === token);
}

/** Disparado pelo Cloud Scheduler (Firebase) — push FCM com app fechado. */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { processed, sent, errors } = await runScheduledNotificationsForAllUsers(adminDb());

  return NextResponse.json({
    ok: true,
    processed,
    sent,
    errors: errors.slice(0, 20),
  });
}
