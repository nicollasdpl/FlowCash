import type { Firestore } from "firebase-admin/firestore";
import { sendFinanceAlertsToUser } from "./sendPush";

export async function runScheduledNotificationsForAllUsers(
  db: Firestore,
): Promise<{ processed: number; sent: number; errors: string[] }> {
  const usersSnap = await db.collection("users").get();
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

  return { processed, sent, errors };
}
