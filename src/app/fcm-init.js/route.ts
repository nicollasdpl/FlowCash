import { NextResponse } from "next/server";

/** App Web do projeto flowcash-39f72 (público — Firebase Console). */
const FLOWCASH_WEB_APP_ID = "1:271526620271:web:f7426f87b1c7280bf4319a";

/** Config pública do Firebase para o service worker (FCM em background). */
export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || FLOWCASH_WEB_APP_ID,
  };

  const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    return new NextResponse(
      `console.warn("[fcm-init] config incompleta: ${missing.join(", ")}");`,
      { headers: { "Content-Type": "application/javascript" } },
    );
  }

  const body = `firebase.initializeApp(${JSON.stringify(config)});`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
