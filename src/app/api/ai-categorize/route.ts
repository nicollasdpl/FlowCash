import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

// Categorização em lote de lançamentos importados da fatura.
// 1 chamada por import (todas as descrições de baixa confiança de uma vez).
// Auth: Bearer idToken. Modelo: gemini-flash-lite-latest (mesmo do ai-budget).

export const maxDuration = 30;

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent";

const MAX_ITEMS = 60;
const MAX_DESC_LEN = 60;

const SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          categoryId: { type: "string" },
        },
        required: ["id", "categoryId"],
      },
    },
  },
  required: ["results"],
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

export async function POST(req: NextRequest) {
  let uid: string | null;
  try {
    uid = await verifyUid(req);
  } catch (e) {
    console.error("[ai-categorize] admin init:", e);
    return NextResponse.json({ error: "AUTH_INIT" }, { status: 500 });
  }
  if (!uid) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "NO_API_KEY" }, { status: 500 });

  type ItemIn = { id: string; description: string };
  type CatIn = { id: string; name: string };
  let body: { items?: ItemIn[]; categories?: CatIn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const categories = (Array.isArray(body.categories) ? body.categories : [])
    .filter(c => c && typeof c.id === "string" && typeof c.name === "string")
    .slice(0, 40);
  const items = (Array.isArray(body.items) ? body.items : [])
    .filter(i => i && typeof i.id === "string" && typeof i.description === "string")
    .slice(0, MAX_ITEMS)
    .map(i => ({ id: i.id, description: i.description.slice(0, MAX_DESC_LEN) }));

  if (items.length === 0 || categories.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const categoryIds = new Set(categories.map(c => c.id));
  const itemIds = new Set(items.map(i => i.id));

  const catLines = categories.map(c => `  id="${c.id}" | ${c.name}`).join("\n");
  const itemLines = items.map(i => `  id="${i.id}" | ${i.description}`).join("\n");

  const prompt = `Você categoriza lançamentos de fatura de cartão de crédito brasileiro. Para cada lançamento, escolha a categoria mais provável pelo nome do estabelecimento. Exemplos de raciocínio: posto/combustível → Transporte; farmácia/drogaria → Saúde; bar/adega/cervejaria → Bebida ou Lazer; mercado/supermercado → Mercado ou Alimentação; PicPay/transferência sem contexto → Outros. Use SOMENTE os ids de categoria fornecidos.

CATEGORIAS:
${catLines}

LANÇAMENTOS:
${itemLines}

Retorne APENAS JSON: { "results": [{ "id": "<id do lançamento>", "categoryId": "<id da categoria>" }] } com um resultado para cada lançamento.`;

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
          temperature: 0.1,
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
    console.error(`[ai-categorize] HTTP ${res.status}:`, errBody.slice(0, 300));
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

  let parsed: { results?: unknown[] };
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return NextResponse.json({ error: "INVALID_RESPONSE" }, { status: 502 });
  }

  const rawItems = Array.isArray(parsed.results) ? parsed.results : [];
  const results: { id: string; categoryId: string }[] = [];
  for (const it of rawItems) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    const categoryId = typeof r.categoryId === "string" ? r.categoryId : "";
    if (!id || !itemIds.has(id)) continue;
    if (!categoryId || !categoryIds.has(categoryId)) continue;
    results.push({ id, categoryId });
  }

  return NextResponse.json({ results });
}
