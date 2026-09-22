import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { validateAiMatchPairs } from "@/lib/invoiceImport/matchInvoiceLines";
import { roundCents } from "@/lib/invoiceImport/csvShared";
import type { AppInvoiceLine, ImportedLine, NearMatchPair } from "@/lib/invoiceImport/types";

/**
 * Emparelha sobras do import (só no extrato ↔ só no app) com Gemini.
 * Só devolve pares que passam em validateAiMatchPairs (valor+data; sem chute).
 * Auth: Bearer idToken. Modelo: gemini-flash-lite-latest.
 */

export const maxDuration = 30;

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent";

const MAX_BANK = 40;
const MAX_APP = 40;
const MAX_DESC = 50;

const SCHEMA = {
  type: "object",
  properties: {
    pairs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          importedId: { type: "string" },
          installmentId: { type: "string" },
          reason: { type: "string" },
        },
        required: ["importedId", "installmentId"],
      },
    },
  },
  required: ["pairs"],
};

async function verifyUid(req: NextRequest): Promise<string | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const idToken = header.slice(7).trim();
  if (!idToken) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return null;
  }
}

function fmtLine(l: {
  id: string;
  date: string;
  description: string;
  amount: number;
  extra?: string;
}): string {
  const desc = l.description.slice(0, MAX_DESC);
  const extra = l.extra ? ` | ${l.extra}` : "";
  return `  id="${l.id}" | ${l.date} | ${desc} | R$ ${l.amount.toFixed(2)}${extra}`;
}

export async function POST(req: NextRequest) {
  let uid: string | null;
  try {
    uid = await verifyUid(req);
  } catch (e) {
    console.error("[ai-match] admin init:", e);
    return NextResponse.json({ error: "AUTH_INIT" }, { status: 500 });
  }
  if (!uid) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "NO_API_KEY" }, { status: 500 });

  type Body = {
    bank?: ImportedLine[];
    app?: AppInvoiceLine[];
    near?: NearMatchPair[];
  };
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const bank = (Array.isArray(body.bank) ? body.bank : [])
    .filter(
      l =>
        l &&
        typeof l.id === "string" &&
        typeof l.date === "string" &&
        typeof l.description === "string" &&
        typeof l.amount === "number",
    )
    .slice(0, MAX_BANK)
    .map(l => ({
      ...l,
      description: String(l.description).slice(0, MAX_DESC),
      amount: roundCents(l.amount),
    }));

  const app = (Array.isArray(body.app) ? body.app : [])
    .filter(
      l =>
        l &&
        typeof l.installmentId === "string" &&
        typeof l.date === "string" &&
        typeof l.description === "string" &&
        typeof l.amount === "number",
    )
    .slice(0, MAX_APP)
    .map(l => ({
      ...l,
      description: String(l.description).slice(0, MAX_DESC),
      amount: roundCents(l.amount),
    }));

  const near = (Array.isArray(body.near) ? body.near : []).slice(0, 20);

  if (bank.length === 0 || app.length === 0) {
    return NextResponse.json({ pairs: [] });
  }

  const bankLines = bank
    .map(l => {
      const hint = l.installmentHint
        ? `${l.installmentHint.current}/${l.installmentHint.total}`
        : l.isSubscriptionHint
          ? "assinatura"
          : "à vista";
      return fmtLine({
        id: l.id,
        date: l.date,
        description: l.description,
        amount: l.amount,
        extra: hint,
      });
    })
    .join("\n");

  const appLines = app
    .map(l => {
      const parc =
        l.totalInstallments > 1
          ? `${l.installmentNumber}/${l.totalInstallments}`
          : l.isSubscription
            ? "assinatura"
            : "à vista";
      return fmtLine({
        id: l.installmentId,
        date: l.date,
        description: l.description,
        amount: l.amount,
        extra: `${parc} | cat=${l.categoryName}`,
      });
    })
    .join("\n");

  const nearHint =
    near.length > 0
      ? `\nQUASE (já sugeridos pelo app — confirme só se tiver certeza):\n${near
          .map(
            n =>
              `  bank=${n.imported.id} app=${n.app.installmentId} | ${n.imported.description} R$ ${n.imported.amount.toFixed(2)} ↔ ${n.app.description} R$ ${n.app.amount.toFixed(2)}`,
          )
          .join("\n")}`
      : "";

  const prompt = `Você emparelha lançamentos de fatura de cartão (extrato do banco) com compras já lançadas no app do usuário.

REGRAS OBRIGATÓRIAS (não chute):
1. Só devolva um par se tiver ALTA confiança de que é o MESMO gasto.
2. O valor deve ser IGUAL (mesmo centavo) OU diferença ≤ 1% (mín. R$ 0,25) — tipicamente arredondamento.
3. A data deve estar a no máximo 7 dias.
4. Nome pode diferir: usuário renomeia (ex.: "PICPAY*NICOLLAS" no banco = "Corre" no app; "EDCAS COMERCIO" = "Mequi"). Use valor+data+contexto.
5. Se houver VÁRIOS candidatos com o mesmo valor na janela de datas, NÃO emparelhe — omita.
6. Cada id do banco e cada installmentId do app no máximo UMA vez.
7. Se não tiver certeza, omita. Melhor deixar sem par do que errar.
8. Não invente ids. Use só os ids listados.

EXTRATO (banco):
${bankLines}

APP (já lançado):
${appLines}
${nearHint}

Retorne APENAS JSON: { "pairs": [{ "importedId": "<id do extrato>", "installmentId": "<id do app>", "reason": "<curto>" }] }.
Pode retornar pairs: [] se nada for seguro.`;

  let res: Response;
  try {
    res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
          temperature: 0,
          maxOutputTokens: 4096,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "TimeoutError";
    return NextResponse.json({ error: isTimeout ? "TIMEOUT" : "NETWORK" }, { status: 504 });
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error(`[ai-match] HTTP ${res.status}:`, errBody.slice(0, 300));
    const detail = errBody.replace(/\s+/g, " ").trim().slice(0, 220);
    return NextResponse.json(
      { error: `HTTP_${res.status}`, detail },
      { status: res.status === 429 ? 429 : 502 },
    );
  }

  const raw = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "PARSE_ENVELOPE" }, { status: 502 });
  }

  type Cand = { content?: { parts?: { text?: string }[] } };
  const text = (data.candidates as Cand[] | undefined)?.[0]?.content?.parts?.[0]?.text;
  if (!text) return NextResponse.json({ error: "EMPTY_RESPONSE" }, { status: 502 });

  let parsed: { pairs?: unknown[] };
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return NextResponse.json({ error: "INVALID_RESPONSE" }, { status: 502 });
  }

  const rawPairs = Array.isArray(parsed.pairs) ? parsed.pairs : [];
  const suggestions: { importedId: string; installmentId: string }[] = [];
  for (const it of rawPairs) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const importedId = typeof r.importedId === "string" ? r.importedId : "";
    const installmentId = typeof r.installmentId === "string" ? r.installmentId : "";
    if (!importedId || !installmentId) continue;
    suggestions.push({ importedId, installmentId });
  }

  // Rede de segurança: só aceita o que passa na validação determinística.
  const links = validateAiMatchPairs(bank, app, near, suggestions);
  const pairs = Object.entries(links).map(([importedId, installmentId]) => ({
    importedId,
    installmentId,
  }));

  return NextResponse.json({ pairs });
}
