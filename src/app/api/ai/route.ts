import { NextRequest, NextResponse } from "next/server";

// ─── Config ───────────────────────────────────────────────────────────────────

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

// ─── Rate limiting (in-memory, por IP) ───────────────────────────────────────
// Gemini free tier: 15 RPM. Limitamos a 12 para ter margem.

const RL_STORE = new Map<string, number[]>();
const RL_MAX   = 12;   // max requests per window
const RL_WIN   = 60_000; // 60s window

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const hits = (RL_STORE.get(ip) ?? []).filter(t => now - t < RL_WIN);

  if (hits.length >= RL_MAX) {
    const oldest = hits[0];
    const retryAfterMs = RL_WIN - (now - oldest);
    return { allowed: false, retryAfterMs };
  }

  RL_STORE.set(ip, [...hits, now]);
  return { allowed: true, retryAfterMs: 0 };
}

// Limpeza periódica para não vazar memória
setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of RL_STORE) {
    const fresh = hits.filter(t => now - t < RL_WIN);
    if (fresh.length === 0) RL_STORE.delete(ip);
    else RL_STORE.set(ip, fresh);
  }
}, 120_000);

// ─── Schema estruturado ───────────────────────────────────────────────────────

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["transaction", "card_purchase", "unknown"] },
    type: { type: "string", enum: ["income", "expense"] },
    amount: { type: "number" },
    description: { type: "string" },
    categoryId: { type: "string" },
    accountId: { type: "string" },
    competenceDate: { type: "string" },
    paymentDate: { type: "string" },
    status: { type: "string", enum: ["paid", "pending", "overdue"] },
    confidence: { type: "number" },
    cardId: { type: "string" },
    purchaseDate: { type: "string" },
    totalInstallments: { type: "integer" },
    message: { type: "string" },
  },
  required: ["intent", "amount"],
};

// ─── Keywords por categoria (contexto semântico para o modelo) ───────────────

const CATEGORY_KEYWORDS: Record<string, string> = {
  "alimentacao":   "ifood, rappi, uber eats, restaurante, lanche, mercado, supermercado, padaria, acougue, hortifruti, pizza, hamburguer, delivery, mcdonalds, burger king, subway",
  "transporte":    "uber, 99, cabify, 99pop, gasolina, combustivel, posto, onibus, metro, estacionamento, pedagio, taxi, passagem, brt",
  "moradia":       "aluguel, condominio, iptu, agua, luz, energia, gas, internet, net, claro, vivo, tim, oi, conta de luz, conta de agua",
  "saude":         "farmacia, remedio, consulta, medico, dentista, hospital, plano de saude, exame, drogaria, drogasil, ultrafarma",
  "lazer":         "netflix, spotify, disney, amazon prime, cinema, teatro, show, ingresso, steam, playstation, xbox, jogo, eventim",
  "academia":      "smartfit, bluefit, gympass, musculacao, treino, personal, academia, crossfit, pilates, yoga, wellhub",
  "educacao":      "curso, faculdade, escola, livro, udemy, alura, mensalidade, material escolar, descomplica",
  "vestuario":     "roupa, calcado, tenis, camisa, calca, loja, shein, renner, c&a, riachuelo, zara, hering, levis",
  "eletronicos":   "celular, notebook, tablet, fone, carregador, kabum, amazon, americanas, magazine luiza, shopee",
  "viagem":        "hotel, passagem aerea, airbnb, hospedagem, latam, gol, azul, booking, decolar",
  "pets":          "racao, veterinario, petshop, banho e tosa, cobasi, petz, remedio pet",
  "salario":       "salario, pagamento, holerite, pro-labore, renda, receita mensal",
  "freelance":     "freelance, servico, honorario, projeto, consultoria, pix recebido",
  "investimentos": "dividendo, rendimento, juros, resgate, cdb, tesouro, fundo, rendeu",
};

function normalizeKey(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

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

  // ── 1. Rate limit ────────────────────────────────────────────────────────────
  const ip = getIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);
    return NextResponse.json(
      {
        intent: "error",
        code: "HTTP_429",
        message: `Limite de requisições atingido. Aguarde ${retryAfterSec}s.`,
        retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  // ── 2. Validar API key ───────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      intent: "error",
      code: "NO_API_KEY",
      message: "GEMINI_API_KEY não configurada.",
    }, { status: 500 });
  }

  // ── 3. Validar body ──────────────────────────────────────────────────────────
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

  // ── 4. Montar prompt ─────────────────────────────────────────────────────────
  const categoriesList = (categories as { id: string; name: string; type: string }[])
    .map(c => {
      const kw = CATEGORY_KEYWORDS[normalizeKey(c.name)];
      return `  id="${c.id}" | ${c.name} (${c.type})${kw ? ` → ${kw}` : ""}`;
    })
    .join("\n") || "  (nenhuma)";

  const accountsList = (accounts as { id: string; name: string }[])
    .map(a => `  id="${a.id}" | ${a.name}`)
    .join("\n") || "  (nenhuma)";

  const cardsList = (cards as { id: string; name: string; brand: string }[])
    .map(c => `  id="${c.id}" | ${c.name} (${c.brand})`)
    .join("\n") || "  (nenhum)";

  const prompt = `Você é um assistente financeiro pessoal brasileiro. Extraia dados financeiros de mensagens informais.
Hoje: ${today} | Ontem: ${yesterday}

CATEGORIAS:
${categoriesList}

Keywords fixas por categoria personalizada:
- "Corre" (expense) → corre, baseado, beck, erva, verde, fumei, fumar, fuminho, bagulho, skank
- "Para Mim" (expense) → comprei pra mim, presente pra mim, mimo, roupa pra mim, tênis, perfume, compra pessoal
- "Assinatura" (expense) → netflix, spotify, amazon prime, youtube premium, chatgpt, discord nitro, mensalidade, plano, recorrente, renovação
- "Bebida" (expense) → cerveja, heineken, budweiser, drinks, bar, boteco, cachaça, vinho, whisky, vodka, gelada, latinha

CONTAS:
${accountsList}

CARTÕES:
${cardsList}

MENSAGEM: "${message.trim()}"

REGRAS:
- Menciona bandeira (Visa/Mastercard/Elo/Amex) ou palavra "cartão" → card_purchase
- Parcelado/"em X vezes"/"X parcelas" → card_purchase, totalInstallments=X
- Banco (Bradesco/Nubank/Itaú/Inter/C6) sem "cartão" → transaction com accountId
- Gasto sem cartão → transaction, type=expense
- Receita/salário/freela/pix recebido → transaction, type=income
- Ambíguo → unknown
- "hoje" → ${today} | "ontem" → ${yesterday} | sem data → ${today}
- Status padrão: "paid" | "vou pagar"/"pendente"/"devo" → "pending"
- Sem conta → primeiro id da lista | Sem cartão → primeiro id da lista
- VALOR: converta para número decimal. "49,75"→49.75 | "R$50"→50 | "1.200,00"→1200 | "mil reais"→1000 | "cinquenta"→50

EXEMPLOS:
"passei 30 no mercadão" → Alimentação, expense, 30
"paguei o ifood" → Alimentação, expense
"uber até o trabalho" → Transporte, expense
"comprei um beck" → Bebida, expense
"boteco ontem, 80 conto" → Bebida, expense, 80, ontem
"renovação do spotify" → Assinatura, expense
"comprei um tênis pra mim" → Para Mim, expense
"academia esse mês" → Saúde, expense
"salário caiu" → Salário, income
"recebi freela" → Freelance, income
"paguei aluguel" → Moradia, expense`;

  // ── 5. Chamar Gemini ─────────────────────────────────────────────────────────
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
          maxOutputTokens: 512,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "TimeoutError";
    return NextResponse.json({
      intent: "error",
      code: isTimeout ? "TIMEOUT" : "NETWORK",
      message: isTimeout
        ? "Gemini não respondeu em 20s. Tente novamente."
        : "Erro de rede ao conectar com o Gemini.",
    });
  }

  // ── 6. Tratar erros HTTP ─────────────────────────────────────────────────────
  if (!geminiRes.ok) {
    const errBody = await geminiRes.text().catch(() => "");
    console.error(`[AI] HTTP ${geminiRes.status}:`, errBody.slice(0, 400));

    if (geminiRes.status === 429) {
      return NextResponse.json(
        { intent: "error", code: "HTTP_429", message: "Limite da API Gemini atingido. Aguarde alguns segundos.", retryAfterSec: 30 },
        { status: 429 }
      );
    }

    const msgMap: Record<number, string> = {
      400: `Requisição inválida (400).`,
      403: "API key inválida ou sem permissão (403).",
      404: "Modelo não encontrado (404).",
    };
    return NextResponse.json({
      intent: "error",
      code: `HTTP_${geminiRes.status}`,
      message: msgMap[geminiRes.status] ?? `Gemini retornou HTTP ${geminiRes.status}.`,
    });
  }

  // ── 7. Parsear resposta ──────────────────────────────────────────────────────
  const rawBody = await geminiRes.text();

  let geminiData: Record<string, unknown>;
  try {
    geminiData = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ intent: "error", code: "PARSE_ENVELOPE", message: "Resposta do Gemini corrompida." });
  }

  type GeminiCandidate = { content?: { parts?: { text?: string }[] }; finishReason?: string };
  const candidates   = geminiData.candidates as GeminiCandidate[] | undefined;
  const rawText      = candidates?.[0]?.content?.parts?.[0]?.text;
  const finishReason = candidates?.[0]?.finishReason;

  if (!rawText) {
    const reason = finishReason === "SAFETY"
      ? "Conteúdo bloqueado por filtros de segurança."
      : `Gemini retornou resposta vazia (${finishReason ?? "desconhecido"}).`;
    return NextResponse.json({ intent: "error", code: "EMPTY_RESPONSE", message: reason });
  }

  if (finishReason === "MAX_TOKENS") {
    return NextResponse.json({ intent: "error", code: "TRUNCATED", message: "Resposta truncada. Tente uma mensagem mais curta." });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText.trim());
  } catch {
    return NextResponse.json({ intent: "error", code: "JSON_PARSE", message: "Gemini retornou JSON inválido." });
  }

  const validIntents = ["transaction", "card_purchase", "unknown"];
  if (!parsed.intent || !validIntents.includes(parsed.intent as string)) {
    return NextResponse.json({ intent: "error", code: "INVALID_INTENT", message: `Intent inválido: "${parsed.intent ?? "ausente"}".` });
  }

  if (parsed.intent === "transaction") {
    parsed.status         ??= "paid";
    parsed.competenceDate ??= today;
    parsed.paymentDate    ??= today;
    parsed.confidence     ??= 0.8;
  }
  if (parsed.intent === "card_purchase") {
    parsed.totalInstallments ??= 1;
    parsed.purchaseDate      ??= today;
    parsed.confidence        ??= 0.8;
  }

  // Sanitiza amount — Gemini pode retornar string com vírgula ou omitir o campo
  if (parsed.intent === "transaction" || parsed.intent === "card_purchase") {
    if (typeof parsed.amount === "string") {
      const n = parseFloat((parsed.amount as string).replace(/\./g, "").replace(",", "."));
      parsed.amount = isNaN(n) ? undefined : n;
    }
    if (typeof parsed.amount !== "number" || isNaN(parsed.amount as number) || (parsed.amount as number) <= 0) {
      return NextResponse.json({
        intent: "error",
        code: "MISSING_AMOUNT",
        message: "Não consegui identificar o valor. Tente incluir o valor de forma mais clara, ex: 'gastei R$49,75'.",
      });
    }
  }

  return NextResponse.json(parsed);
}
