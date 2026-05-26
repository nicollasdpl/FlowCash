import { NextRequest, NextResponse } from "next/server";

// ─── Config ───────────────────────────────────────────────────────────────────

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

// ─── Schema estruturado oficial do Gemini ─────────────────────────────────────
// Ref: https://ai.google.dev/gemini-api/docs/structured-output
// Gemini usa OpenAPI 3.0 subset: tipos em lowercase, enum, required, etc.
// Um único schema plano cobre todos os intents — campos opcionais por intent.

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["transaction", "card_purchase", "unknown"],
    },
    // ── transaction fields ──
    type: {
      type: "string",
      enum: ["income", "expense"],
    },
    amount: { type: "number" },
    description: { type: "string" },
    categoryId: { type: "string" },
    accountId: { type: "string" },
    competenceDate: { type: "string" },
    paymentDate: { type: "string" },
    status: {
      type: "string",
      enum: ["paid", "pending", "overdue"],
    },
    confidence: { type: "number" },
    // ── card_purchase fields ──
    cardId: { type: "string" },
    purchaseDate: { type: "string" },
    totalInstallments: { type: "integer" },
    // ── unknown fields ──
    message: { type: "string" },
  },
  required: ["intent"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split("T")[0];
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {

  // ── 1. Validar API key ───────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[AI] GEMINI_API_KEY não definida.");
    return NextResponse.json({
      intent: "error",
      code: "NO_API_KEY",
      message: "GEMINI_API_KEY não configurada. Adicione a variável no Vercel.",
    }, { status: 500 });
  }

  // ── 2. Validar body ──────────────────────────────────────────────────────────
  let body: { message?: string; categories?: unknown[]; accounts?: unknown[]; cards?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ intent: "error", code: "BAD_REQUEST", message: "Body inválido." }, { status: 400 });
  }

  const { message, categories = [], accounts = [], cards = [] } = body;
  if (!message?.trim()) {
    return NextResponse.json({ intent: "unknown", message: "Mensagem vazia." });
  }

  const today     = todayStr();
  const yesterday = yesterdayStr();

  // ── 3. Montar prompt ─────────────────────────────────────────────────────────
  const categoriesList = (categories as { id: string; name: string; type: string; icon: string }[])
    .map(c => `  id="${c.id}" | ${c.icon} ${c.name} | tipo: ${c.type}`)
    .join("\n") || "  (nenhuma)";

  const accountsList = (accounts as { id: string; name: string; icon: string }[])
    .map(a => `  id="${a.id}" | ${a.icon} ${a.name}`)
    .join("\n") || "  (nenhuma)";

  const cardsList = (cards as { id: string; name: string; brand: string }[])
    .map(c => `  id="${c.id}" | ${c.name} (${c.brand})`)
    .join("\n") || "  (nenhum)";

  const prompt = `Você é um assistente financeiro pessoal brasileiro. Analise a mensagem e extraia dados financeiros.

Data de hoje: ${today}
Ontem: ${yesterday}

CATEGORIAS (use o id EXATO):
${categoriesList}

CONTAS (use o id EXATO):
${accountsList}

CARTÕES (use o id EXATO):
${cardsList}

MENSAGEM: "${message.trim()}"

REGRAS DE INTENT:
- Menciona cartão, bandeira, banco → intent: "card_purchase"
- Parcelado, "em X vezes" → intent: "card_purchase", totalInstallments = X
- Gasto/compra/despesa sem cartão → intent: "transaction", type: "expense"
- Salário/receita/entrada → intent: "transaction", type: "income"
- Não financeiro ou ambíguo → intent: "unknown"

REGRAS DE DATA:
- "hoje" → ${today} | "ontem" → ${yesterday} | sem data → ${today}

REGRAS DE CATEGORIA (aproxime pela palavra-chave):
- iFood/Rappi/restaurante/lanche → Alimentação
- Uber/99/gasolina/combustível → Transporte
- Netflix/Spotify/cinema/bar → Lazer
- Farmácia/médico/hospital → Saúde
- Aluguel/condomínio/luz/água/internet → Moradia
- Curso/escola/faculdade → Educação
- Roupa/tênis/vestuário → Vestuário
- Celular/notebook/eletrônico → Eletrônicos
- Salário/pagamento CLT → Salário
- Freela/PJ/projeto → Freelance

REGRAS DE CONTA/CARTÃO:
- Se citar banco ou cartão → use o id correspondente
- Se não especificar conta → use o primeiro id da lista de contas
- Se não especificar cartão → use o primeiro id da lista de cartões
- Se não há cartão para card_purchase → use intent: "unknown"

REGRAS DE STATUS:
- Padrão: "paid"
- "vou pagar"/"pendente"/"amanhã"/"depois" → "pending"`;

  // ── 4. Chamar Gemini com Structured Output ───────────────────────────────────
  let geminiRes: Response;
  try {
    geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.0,
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "TimeoutError";
    console.error("[AI] Fetch falhou:", e);
    return NextResponse.json({
      intent: "error",
      code: isTimeout ? "TIMEOUT" : "NETWORK",
      message: isTimeout
        ? "Gemini não respondeu em 20s. Tente novamente."
        : "Erro de rede ao conectar com o Gemini.",
    });
  }

  // ── 5. Tratar erros HTTP ─────────────────────────────────────────────────────
  if (!geminiRes.ok) {
    const errBody = await geminiRes.text().catch(() => "");
    console.error(`[AI] HTTP ${geminiRes.status}:`, errBody.slice(0, 600));

    const msgMap: Record<number, string> = {
      400: `Requisição inválida (400). Detalhe: ${errBody.slice(0, 150)}`,
      403: "API key inválida ou sem permissão (403). Verifique GEMINI_API_KEY no Vercel.",
      404: "Modelo não encontrado (404). O modelo pode não estar disponível para esta chave.",
      429: "Limite de requisições atingido (429). Aguarde e tente novamente.",
    };
    const msg = msgMap[geminiRes.status] ?? `Gemini retornou HTTP ${geminiRes.status}.`;
    return NextResponse.json({ intent: "error", code: `HTTP_${geminiRes.status}`, message: msg });
  }

  // ── 6. Ler resposta bruta ────────────────────────────────────────────────────
  const rawBody = await geminiRes.text();
  console.log("[AI] Raw Gemini response (primeiros 1000 chars):", rawBody.slice(0, 1000));

  // ── 7. Parsear envelope Gemini ───────────────────────────────────────────────
  let geminiData: Record<string, unknown>;
  try {
    geminiData = JSON.parse(rawBody);
  } catch {
    console.error("[AI] Envelope Gemini não é JSON:", rawBody.slice(0, 300));
    return NextResponse.json({
      intent: "error", code: "PARSE_ENVELOPE",
      message: "Resposta do servidor Gemini corrompida.",
    });
  }

  // ── 8. Extrair texto gerado ──────────────────────────────────────────────────
  type GeminiCandidate = { content?: { parts?: { text?: string }[] }; finishReason?: string };
  const candidates   = geminiData.candidates as GeminiCandidate[] | undefined;
  const rawText      = candidates?.[0]?.content?.parts?.[0]?.text;
  const finishReason = candidates?.[0]?.finishReason;

  console.log("[AI] finishReason:", finishReason);
  console.log("[AI] rawText:", rawText?.slice(0, 500) ?? "(vazio)");

  if (!rawText) {
    const reason = finishReason === "SAFETY"
      ? "Conteúdo bloqueado por filtros de segurança do Gemini."
      : `Gemini retornou resposta vazia (finishReason: ${finishReason ?? "desconhecido"}).`;
    return NextResponse.json({ intent: "error", code: "EMPTY_RESPONSE", message: reason });
  }

  // Detectar resposta truncada antes de tentar parsear
  if (finishReason === "MAX_TOKENS") {
    console.error("[AI] Resposta truncada por MAX_TOKENS. rawText:", rawText.slice(0, 200));
    return NextResponse.json({
      intent: "error", code: "TRUNCATED",
      message: "Resposta truncada pelo limite de tokens. Tente uma mensagem mais curta.",
    });
  }

  // ── 9. Parsear JSON estruturado ──────────────────────────────────────────────
  // Com responseSchema, o Gemini DEVE retornar JSON puro — sem markdown.
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText.trim());
  } catch (e) {
    console.error("[AI] JSON.parse falhou. rawText completo:", rawText);
    console.error("[AI] Erro parse:", e);
    return NextResponse.json({
      intent: "error", code: "JSON_PARSE",
      message: "Gemini retornou texto que não é JSON válido. rawText logado no servidor.",
    });
  }

  // ── 10. Validar campo intent ─────────────────────────────────────────────────
  const validIntents = ["transaction", "card_purchase", "unknown"];
  if (!parsed.intent || !validIntents.includes(parsed.intent as string)) {
    console.error("[AI] Campo intent inválido:", parsed.intent, "| parsed completo:", parsed);
    return NextResponse.json({
      intent: "error", code: "INVALID_INTENT",
      message: `Schema inválido — intent recebido: "${parsed.intent ?? "ausente"}".`,
    });
  }

  // ── 11. Preencher defaults ───────────────────────────────────────────────────
  if (parsed.intent === "transaction") {
    parsed.status          ??= "paid";
    parsed.competenceDate  ??= today;
    parsed.paymentDate     ??= today;
    parsed.confidence      ??= 0.8;
  }
  if (parsed.intent === "card_purchase") {
    parsed.totalInstallments ??= 1;
    parsed.purchaseDate      ??= today;
    parsed.confidence        ??= 0.8;
  }

  console.log("[AI] Sucesso:", parsed.intent, "| confiança:", parsed.confidence ?? "N/A");
  return NextResponse.json(parsed);
}
