import { NextRequest, NextResponse } from "next/server";
import { verifyUid } from "@/lib/auth/verifyUid";
import { removePushToken, savePushToken } from "@/lib/notifications/sendPush";

export async function POST(req: NextRequest) {
  const uid = await verifyUid(req);
  if (!uid) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: { token?: string; userAgent?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "token obrigatório" }, { status: 400 });
  }

  await savePushToken(uid, token, body.userAgent);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const uid = await verifyUid(req);
  if (!uid) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "token obrigatório" }, { status: 400 });
  }

  await removePushToken(uid, token);
  return NextResponse.json({ ok: true });
}
