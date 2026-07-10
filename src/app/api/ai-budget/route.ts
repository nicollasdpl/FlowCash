import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

// Sugestão de orçamentos por IA. Endpoint próprio (não polui o copiloto /api/ai).
// Auth: Bearer idToken. Sem rate limit próprio. Modelo: gemini-flash-lite-latest
// (free tier maior que o flash; o gemini-2.0-flash retorna 404 nesta chave).

export const maxDuration = 30;

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent";

const SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          categoryId: { type: "string" },
          amount: { type: "number" },
        },
        required: ["categoryId", "amount"],
      },
    },
  },
  required: ["suggestions"],
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
    console.error("[ai-budget] admin init:", e);
    return NextResponse.json({ error: "AUTH_INIT" }, { status: 500 });
  }
  if (!uid) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "NO_API_KEY" }, { status: 500 });

  type CatIn = { id: string; name: string };
  type SpentIn = { categoryId: string; month: string; spent: number };
  let body: { categories?: CatIn[]; spentLast3Months?: SpentIn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const categories = (Array.isArray(body.categories) ? body.categories : [])
    .filter(c => c && typeof c.id === "string" && typeof c.name === "string");
  const spent = (Array.isArray(body.spentLast3Months) ? body.spentLast3Months : [])
    .filter(s => s && typeof s.categoryId === "string" && typeof s.spent === "number");
  const categoryIds = new Set(categories.map(c => c.id));

  if (categories.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const catLines = categories.map(c => `  id="${c.id}" | ${c.name}`).join("\n");
  const spentLines = spent
    .filter(s => categoryIds.has(s.categoryId))
    .map(s => `  ${s.month} | ${s.categoryId} | ${s.spent.toFixed(2)}`)
    .join("\n") || "  (sem histórico)";

  const prompt = `Você é um planejador financeiro pessoal brasileiro. Com base nos gastos reais dos últimos 3 meses por categoria, sugira um orçamento mensal realista para cada categoria que tenha histórico. Arredonde para valores redondos (50, 100, 150, 200, 250...). Use SOMENTE os ids fornecidos; não invente categorias. Se uma categoria não tem histórico relevante, pode omiti-la.

CATEGORIAS (use estes ids):
${catLines}

GASTOS (mês | categoryId | valor em R$):
${spentLines}

Retorne APENAS JSON: { "suggestions": [{ "categoryId": "<id>", "amount": <número> }] }`;

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
          temperature: 0.2,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingBudget: 0 },
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
    console.error(`[ai-budget] HTTP ${res.status}:`, errBody.slice(0, 300));
    const detail = errBody.replace(/\s+/g, " ").trim().slice(0, 180);
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

  type Cand = { content?: { parts?: { text?: string }[] }; finishReason?: string };
  const text = (data.candidates as Cand[] | undefined)?.[0]?.content?.parts?.[0]?.text;
  if (!text) return NextResponse.json({ error: "EMPTY_RESPONSE" }, { status: 502 });

  let parsed: { suggestions?: unknown[] };
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return NextResponse.json({ error: "INVALID_RESPONSE" }, { status: 502 });
  }

  const rawItems = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const suggestions: { categoryId: string; amount: number }[] = [];
  for (const it of rawItems) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const categoryId = typeof r.categoryId === "string" ? r.categoryId : "";
    const amountRaw = typeof r.amount === "number" ? r.amount
      : typeof r.amount === "string" ? parseFloat(r.amount) : NaN;
    if (!categoryId || !categoryIds.has(categoryId)) continue;
    if (!isFinite(amountRaw) || amountRaw <= 0) continue;
    suggestions.push({ categoryId, amount: Math.round(amountRaw) });
  }

  return NextResponse.json({ suggestions });
}
