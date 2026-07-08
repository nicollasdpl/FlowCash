import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";

const cronSecret = defineSecret("NOTIFICATION_CRON_SECRET");
const APP_URL = "https://flowcash-rho.vercel.app";

/** 8h, 12h e 18h (Brasília) — chama a API do FlowCash para enviar push FCM. */
export const financeNotifications = onSchedule(
  {
    schedule: "0 8,12,18 * * *",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
    memory: "256MiB",
    timeoutSeconds: 120,
    secrets: [cronSecret],
  },
  async () => {
    const secret = cronSecret.value();
    if (!secret) {
      logger.error("NOTIFICATION_CRON_SECRET não configurado nas Functions");
      return;
    }

    const url = `${APP_URL}/api/cron/notifications`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
    });

    const body = await res.text();
    if (!res.ok) {
      logger.error("Cron FlowCash falhou", { status: res.status, body });
      return;
    }

    logger.info("Cron FlowCash OK", { body });
  },
);
