import { NextRequest, NextResponse } from "next/server";
import { verifyUid } from "@/lib/auth/verifyUid";
import { buildFinanceAlerts, formatAlertDigest } from "@/lib/notifications/buildAlerts";
import { loadUserAppState, sendTestPushToUser } from "@/lib/notifications/sendPush";
import { DEFAULT_NOTIFICATION_PREFS } from "@/lib/notifications/types";

export async function POST(req: NextRequest) {
  const uid = await verifyUid(req);
  if (!uid) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const state = await loadUserAppState(uid);
  if (!state) {
    return NextResponse.json({ error: "Estado não encontrado" }, { status: 404 });
  }

  const prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...(state.notificationPrefs ?? {}), enabled: true };
  const alerts = buildFinanceAlerts(state, prefs);

  let title: string;
  let body: string;
  if (alerts.length > 0) {
    ({ title, body } = formatAlertDigest(alerts));
  } else {
    title = "FlowCash — teste";
    body = "Push funcionando! Você receberá lembretes mesmo com o app fechado.";
  }

  const { sent } = await sendTestPushToUser(uid, title, body);
  if (sent === 0) {
    return NextResponse.json({
      ok: false,
      hint: "Nenhum dispositivo registrado. Ative as notificações e tente de novo.",
    });
  }

  return NextResponse.json({
    ok: true,
    hint: alerts.length > 0
      ? "Push enviado com seus lembretes atuais."
      : "Push de teste enviado (nenhum lembrete real no momento).",
  });
}
