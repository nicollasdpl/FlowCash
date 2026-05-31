import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cached: App | undefined;

function getAdminApp(): App {
  if (cached) return cached;
  const existing = getApps()[0];
  if (existing) {
    cached = existing;
    return cached;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON não configurada.");
  }

  let serviceAccount: { project_id: string; client_email: string; private_key: string };
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON contém JSON inválido.");
  }

  cached = initializeApp({
    credential: cert({
      projectId:   serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey:  serviceAccount.private_key.replace(/\\n/g, "\n"),
    }),
  });
  return cached;
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}
