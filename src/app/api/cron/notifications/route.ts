import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendFinanceAlertsToUser } from "@/lib/notifications/sendPush";

export const maxDuration = 300;

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Cron Vercel — envia push FCM para usuários com lembretes ativos (app fechado). */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const usersSnap = await adminDb().collection("users").get();
  let processed = 0;
  let sent = 0;
  const errors: string[] = [];

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    processed++;
    try {
      const result = await sendFinanceAlertsToUser(uid);
      if (result.sent) sent++;
    } catch (err) {
      errors.push(`${uid}: ${err instanceof Error ? err.message : "erro"}`);
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    sent,
    errors: errors.slice(0, 20),
  });
}
