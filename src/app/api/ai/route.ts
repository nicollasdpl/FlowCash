import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { buildCategoryListLine } from "@/lib/ai/categoryKeywords";
import { formatFinancialContextBlock } from "@/lib/ai/formatFinancialContextBlock";
import { detectIntent, extractIntentFromAssistantContent, isLocalAnswerCandidate, stripIntentPrefix } from "@/lib/intentDetection";
import { tryLocalAnswer } from "@/lib/ai/localAnswers";
import { MAX_TX, sanitizeActions, sanitizeTransactions } from "@/lib/ai/sanitizeTransactions";
import type { FinancialContext } from "@/lib/ai/types";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

export const maxDuration = 60;

const RL_MAX = 60;
const RL_WIN_MS = 60_000;
const MAX_HINTS = 20;
const MAX_HISTORY_TURNS = 2;

const TX_ITEM_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["transaction", "card_purchase"] },
    type: { type: "string", enum: ["income", "expense"] },
    amount: { type: "number" },
    description: { type: "string" },
    categoryId: { type: "string" },
    accountId: { type: "string" },
    cardId: { type: "string" },
    competenceDate: { type: "string" },
    paymentDate: { type: "string" },
    purchaseDate: { type: "string" },
    status: { type: "string", enum: ["paid", "pending", "overdue"] },
    totalInstallments: { type: "integer" },
    confidence: { type: "string", enum: ["high", "low"] },
  },
  required: ["intent", "amount"],
};

const ACTION_ITEM_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["delete_tx", "update_tx", "delete_purchase"] },
    targetId: { type: "string" },
    targetDescription: { type: "string" },
    targetDate: { type: "string" },
    targetAmount: { type: "number" },
    patch: {
      type: "object",
      properties: {
        amount: { type: "number" },
        description: { type: "string" },
        categoryId: { type: "string" },
        accountId: { type: "string" },
        paymentDate: { type: "string" },
        status: { type: "string", enum: ["paid", "pending"] },
      },
    },
    confidence: { type: "string", enum: ["high", "low"] },
  },
  required: ["action", "targetId", "targetDescription"],
};

const SCHEMA_LAUNCH = {
  type: "object",
  properties: {
    transactions: { type: "array", items: TX_ITEM_SCHEMA },
    message: { type: "string" },
  },
  required: ["transactions"],
};

const SCHEMA_QUESTION = {
  type: "object",
  properties: {
    answer: { type: "string" },
    message: { type: "string" },
  },
  required: ["answer"],
};

const SCHEMA_MIXED = {
  type: "object",
  properties: {
    transactions: { type: "array", items: TX_ITEM_SCHEMA },
    answer: { type: "string" },
    message: { type: "string" },
  },
  required: ["transactions", "answer"],
};

const SCHEMA_ACTION = {
  type: "object",
  properties: {
    actions: { type: "array", items: ACTION_ITEM_SCHEMA },
    message: { type: "string" },
  },
  required: ["actions"],
};

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function unauthorized(message: string) {
  return NextResponse.json({ intent: "error", code: "UNAUTHORIZED", message }, { status: 401 });
}

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

async function checkRateLimit(uid: string): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const ref = adminDb().doc(`users/${uid}/app/rateLimit`);
  return adminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = snap.exists ? snap.data() : null;
    const windowStart = typeof data?.windowStart === "number" ? data.windowStart : 0;
    const count = typeof data?.requestsThisMinute === "number" ? data.requestsThisMinute : 0;

    if (!data || now - windowStart >= RL_WIN_MS) {
      tx.set(ref, {
        requestsThisMinute: 1,
        windowStart: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { allowed: true, retryAfterMs: 0 };
    }

    if (count >= RL_MAX) {
      return { allowed: false, retryAfterMs: RL_WIN_MS - (now - windowStart) };
    }

    tx.update(ref, {
      requestsThisMinute: count + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { allowed: true, retryAfterMs: 0 };
  });
}

function isFinancialContext(v: unknown): v is FinancialContext {
  return Boolean(v && typeof v === "object" && "summary" in (v as FinancialContext));
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  let uid: string | null;
  try {
    uid = await verifyUid(req);
  } catch (e) {
    console.error("[AI] Admin SDK indisponível:", e);
    return NextResponse.json(
      { intent: "error", code: "ADMIN_INIT", message: "Configuração de autenticação ausente no servidor." },
      { status: 500 },
    );
  }
  if (!uid) return unauthorized("Sessão expirada. Faça login novamente.");

  const rl = await checkRateLimit(uid);
  if (!rl.allowed) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);
    return NextResponse.json(
      {
        intent: "error",
        code: "HTTP_429",
        message: `Limite de requisições atingido. Aguarde ${retryAfterSec}s.`,
        retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      intent: "error",
      code: "NO_API_KEY",
      message: "GEMINI_API_KEY não configurada.",
    }, { status: 500 });
  }

  type HintIn = { categoryId?: unknown; accountId?: unknown; cardId?: unknown; confirmedCount?: unknown };
  type TurnIn = { role?: unknown; content?: unknown };

  let body: {
    message?: string;
    categories?: unknown[];
    accounts?: unknown[];
    cards?: unknown[];
    hints?: Record<string, HintIn>;
    financialContext?: FinancialContext;
    conversationHistory?: TurnIn[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ intent: "error", code: "BAD_REQUEST", message: "Body inválido." }, { status: 400 });
  }

  const { message, categories = [], accounts = [], cards = [], hints = {}, financialContext, conversationHistory } = body;
  if (!message?.trim()) {
    return NextResponse.json({ intent: "unknown", message: "Mensagem vazia." });
  }

  type Turn = { role: "user" | "assistant"; content: string };
  const sanitizedHistory: Turn[] = (Array.isArray(conversationHistory) ? conversationHistory : [])
    .map((t): Turn => ({
      role: t?.role === "assistant" ? "assistant" : "user",
      content: typeof t?.content === "string" ? t.content.trim() : "",
    }))
    .filter(t => t.content.length > 0)
    .slice(-MAX_HISTORY_TURNS * 2);

  const lastAssistantTurn = [...sanitizedHistory].reverse().find(t => t.role === "assistant");
  const previousAssistantIntent = lastAssistantTurn
    ? extractIntentFromAssistantContent(lastAssistantTurn.content)
    : null;

  const intentHint = detectIntent(message, previousAssistantIntent);
  const needsContext = intentHint !== "launch";

  const today = todayStr();
  const yesterday = yesterdayStr();

  const categoriesTyped = categories as { id: string; name: string; type: string }[];
  const accountsTyped = accounts as { id: string; name: string }[];
  const cardsTyped = cards as { id: string; name: string; brand: string }[];

  const categoryIds = new Set(categoriesTyped.map(c => c.id));
  const accountIds = new Set(accountsTyped.map(a => a.id));
  const cardIds = new Set(cardsTyped.map(c => c.id));

  if (intentHint === "question" && isFinancialContext(financialContext) && isLocalAnswerCandidate(message)) {
    const local = tryLocalAnswer(message, financialContext);
    if (local) {
      console.info("[AI]", { uid, intentHint, local: true, ms: Date.now() - startedAt });
      return NextResponse.json({ intent: "question", answer: local, local: true });
    }
  }

  const categoriesList =
    categoriesTyped.map(c => buildCategoryListLine(c)).join("\n") || "  (nenhuma)";

  const accountsList = accountsTyped.map(a => `  id="${a.id}" | ${a.name}`).join("\n") || "  (nenhuma)";
  const cardsList = cardsTyped.map(c => `  id="${c.id}" | ${c.name} (${c.brand})`).join("\n") || "  (nenhum)";

  type ValidatedHint = { key: string; categoryId: string; accountId?: string; cardId?: string; confirmedCount: number };
  const validatedHints: ValidatedHint[] = Object.entries(hints || {})
    .map(([key, raw]) => ({
      key: typeof key === "string" ? key.toLowerCase().trim() : "",
      categoryId: typeof raw?.categoryId === "string" ? raw.categoryId : "",
      accountId: typeof raw?.accountId === "string" ? raw.accountId : "",
      cardId: typeof raw?.cardId === "string" ? raw.cardId : "",
      confirmedCount: typeof raw?.confirmedCount === "number" ? raw.confirmedCount : 0,
    }))
    .filter(
      h =>
        h.key &&
        h.confirmedCount >= 1 &&
        categoryIds.has(h.categoryId) &&
        (h.accountId ? accountIds.has(h.accountId) : true) &&
        (h.cardId ? cardIds.has(h.cardId) : true) &&
        (h.accountId || h.cardId),
    )
    .sort((a, b) => b.confirmedCount - a.confirmedCount)
    .slice(0, MAX_HINTS);

  const strongHints = validatedHints.filter(h => h.confirmedCount >= 2);

  const hintsList =
    validatedHints.length === 0
      ? ""
      : "\n\nPreferências do usuário (baseadas em histórico confirmado):\n" +
        validatedHints
          .map(h => {
            const cat = categoriesTyped.find(c => c.id === h.categoryId);
            const acc = h.accountId ? accountsTyped.find(a => a.id === h.accountId) : null;
            const card = h.cardId ? cardsTyped.find(c => c.id === h.cardId) : null;
            const dest = acc ? `conta: ${acc.name}` : card ? `cartão: ${card.name}` : "";
            const strong = h.confirmedCount >= 2 ? " [PREFERÊNCIA FORTE — use confidence high]" : "";
            return `- '${h.key}' → categoria: ${cat?.name ?? "?"}${dest ? `, ${dest}` : ""} (confirmado ${h.confirmedCount}x)${strong}`;
          })
          .join("\n");

  const historyBlock =
    sanitizedHistory.length === 0
      ? ""
      : "\n\nContexto recente da conversa:\n" +
        sanitizedHistory
          .map(turn => {
            const label = turn.role === "user" ? "Usuário" : "Assistente";
            const content = turn.role === "assistant" ? stripIntentPrefix(turn.content) : turn.content;
            return `${label}: ${content}`;
          })
          .join("\n");

  const financialContextBlock =
    needsContext && isFinancialContext(financialContext) ? formatFinancialContextBlock(financialContext) : "";

  const intentInstructions =
    intentHint === "launch"
      ? `\nTAREFA: extrair transação(ões) financeira(s) dessa mensagem. Preencha "transactions" com 1+ itens. Se a mensagem não contiver nenhuma transação clara, retorne transactions=[] e use "message" para explicar brevemente.`
      : intentHint === "question"
        ? `\nTAREFA: responder a pergunta do usuário sobre as finanças dele. Preencha SOMENTE o campo "answer" (markdown simples, pt-BR). Use APENAS o CONTEXTO FINANCEIRO ATUAL — não invente valores. Seja conciso: 1-3 parágrafos ou lista enxuta. Negrito com **texto**. Listas com "- ".`
        : intentHint === "action"
          ? `\nTAREFA: identificar ação(ões) solicitadas (apagar, editar ou remover compra). Preencha "actions" com 1+ itens. Use targetId dos lançamentos/compras listados no CONTEXTO FINANCEIRO (campo id=). Para update_tx, preencha "patch" só com campos mencionados. confidence=high apenas se o alvo for inequívoco.`
          : `\nTAREFA: extrair transação(ões) E responder à pergunta. Preencha "transactions" e "answer". No answer, considere que os lançamentos serão confirmados — use "Após esse lançamento, ...".`;

  const confidenceRules =
    strongHints.length > 0
      ? `\nREGRA DE CONFIDENCE: se a descrição bater com uma preferência confirmada 2+ vezes acima, use confidence="high" para categoryId e conta/cartão correspondentes.`
      : "";

  const prompt = `Você é um assistente financeiro pessoal brasileiro.

INSTRUÇÃO CRÍTICA: responda APENAS com JSON válido seguindo o schema. NUNCA texto livre.

Hoje: ${today} | Ontem: ${yesterday}

CATEGORIAS:
${categoriesList}

CONTAS:
${accountsList}

CARTÕES:
${cardsList}${historyBlock}

MENSAGEM ATUAL: "${message.trim()}"${financialContextBlock}
${intentInstructions}${confidenceRules}

REGRAS DE LANÇAMENTO:
- Bandeira ou "cartão" → card_purchase
- Parcelado → card_purchase, totalInstallments=X
- Banco sem "cartão" → transaction com accountId
- Receita/salário/pix recebido → transaction type=income
- "hoje"→${today} | "ontem"→${yesterday} | sem data→${today}
- Status: paid (padrão) | pending se "vou pagar"/"pendente"
- Máximo ${MAX_TX} transações por resposta

EXEMPLOS QUESTION:
"quanto gastei esse mês?" → total + top categorias
"falta quanto pro orçamento de alimentação?" → orçamento/gasto/restante
"resumo do mês" → receitas, despesas, saldo, alertas

EXEMPLOS ACTION:
"apaga o ifood de ontem" → delete_tx com targetId do lançamento matching
"corrige o valor do uber pra 35" → update_tx com patch.amount=35${hintsList}`;

  const responseSchema =
    intentHint === "launch"
      ? SCHEMA_LAUNCH
      : intentHint === "question"
        ? SCHEMA_QUESTION
        : intentHint === "action"
          ? SCHEMA_ACTION
          : SCHEMA_MIXED;

  const geminiBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.0,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const MAX_ATTEMPTS = 2;
  const TRANSIENT_HTTP = new Set([500, 502, 503, 504]);
  let geminiRes: Response | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: geminiBody,
        signal: AbortSignal.timeout(15000),
      });
      if (TRANSIENT_HTTP.has(res.status) && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 500 * attempt));
        continue;
      }
      geminiRes = res;
      break;
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === "TimeoutError";
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 500 * attempt));
        continue;
      }
      return NextResponse.json({
        intent: "error",
        code: isTimeout ? "TIMEOUT" : "NETWORK",
        message: isTimeout ? "Gemini não respondeu a tempo. Tente novamente." : "Erro de rede ao conectar com o Gemini.",
        retryAfterSec: 15,
      });
    }
  }

  if (!geminiRes) {
    return NextResponse.json({
      intent: "error",
      code: "HTTP_503",
      message: "O modelo está sobrecarregado no momento. Tente novamente em instantes.",
      retryAfterSec: 15,
    });
  }

  if (!geminiRes.ok) {
    const errBody = await geminiRes.text().catch(() => "");
    console.error(`[AI] HTTP ${geminiRes.status}:`, errBody.slice(0, 400));

    if (geminiRes.status === 429) {
      const reason = errBody.replace(/\s+/g, " ").trim().slice(0, 200);
      return NextResponse.json(
        { intent: "error", code: "HTTP_429", message: `Limite da API Gemini atingido. ${reason}`, retryAfterSec: 30 },
        { status: 429 },
      );
    }

    if (TRANSIENT_HTTP.has(geminiRes.status)) {
      return NextResponse.json({
        intent: "error",
        code: "HTTP_503",
        message: "O modelo está sobrecarregado no momento. Tente novamente em instantes.",
        retryAfterSec: 15,
      });
    }

    return NextResponse.json({
      intent: "error",
      code: `HTTP_${geminiRes.status}`,
      message: `Gemini retornou HTTP ${geminiRes.status}.`,
    });
  }

  const rawBody = await geminiRes.text();
  let geminiData: Record<string, unknown>;
  try {
    geminiData = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ intent: "error", code: "PARSE_ENVELOPE", message: "Resposta do Gemini corrompida." });
  }

  type GeminiCandidate = { content?: { parts?: { text?: string }[] }; finishReason?: string };
  const candidates = geminiData.candidates as GeminiCandidate[] | undefined;
  const rawText = candidates?.[0]?.content?.parts?.[0]?.text;
  const finishReason = candidates?.[0]?.finishReason;

  if (!rawText) {
    const reason =
      finishReason === "SAFETY"
        ? "Conteúdo bloqueado por filtros de segurança."
        : `Gemini retornou resposta vazia (${finishReason ?? "desconhecido"}).`;
    return NextResponse.json({ intent: "error", code: "EMPTY_RESPONSE", message: reason });
  }

  if (finishReason === "MAX_TOKENS") {
    return NextResponse.json({ intent: "error", code: "TRUNCATED", message: "Resposta truncada. Tente uma mensagem mais curta." });
  }

  let parsed: { transactions?: unknown[]; actions?: unknown[]; message?: string; answer?: string };
  try {
    parsed = JSON.parse(rawText.trim());
  } catch {
    console.warn("[AI] Gemini retornou texto não-JSON:", rawText.slice(0, 200));
    return NextResponse.json(
      { intent: "error", code: "INVALID_RESPONSE", message: "Resposta inválida do modelo." },
      { status: 422 },
    );
  }

  const rawAnswer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  const latencyMs = Date.now() - startedAt;

  if (intentHint === "question") {
    if (!rawAnswer) {
      return NextResponse.json({
        intent: "unknown",
        message: parsed.message || "Não consegui responder com os dados disponíveis. Tente reformular.",
      });
    }
    console.info("[AI]", { uid, intentHint, ms: latencyMs });
    return NextResponse.json({ intent: "question", answer: rawAnswer });
  }

  if (intentHint === "action") {
    const validTxIds = new Set(
      isFinancialContext(financialContext) ? financialContext.recentTransactions.map(t => t.id) : [],
    );
    const validPurchaseIds = new Set(
      isFinancialContext(financialContext) ? financialContext.recentPurchases.map(p => p.id) : [],
    );
    const actions = sanitizeActions({
      items: Array.isArray(parsed.actions) ? parsed.actions : [],
      validTxIds,
      validPurchaseIds,
    }).map(a => ({ intent: "action" as const, ...a }));

    if (actions.length === 0) {
      return NextResponse.json({
        intent: "unknown",
        message: parsed.message || "Não encontrei o lançamento para essa ação. Seja mais específico.",
      });
    }

    console.info("[AI]", { uid, intentHint, actions: actions.length, ms: latencyMs });
    return NextResponse.json({ intent: "action", actions, message: parsed.message });
  }

  const rawItems = Array.isArray(parsed.transactions) ? parsed.transactions : [];
  if (rawItems.length === 0) {
    if (intentHint === "mixed" && rawAnswer) {
      return NextResponse.json({ intent: "question", answer: rawAnswer });
    }
    return NextResponse.json({
      intent: "unknown",
      message: parsed.message || "Não consegui identificar nenhuma transação. Tente reformular.",
    });
  }

  const truncated = rawItems.length > MAX_TX;
  const firstAccountId = accountsTyped[0]?.id ?? "";
  const firstCardId = cardsTyped[0]?.id ?? "";

  const sanitized = sanitizeTransactions({
    items: rawItems,
    categoryIds,
    accountIds,
    cardIds,
    firstAccountId,
    firstCardId,
    today,
  });

  if (sanitized.length === 0) {
    if (intentHint === "mixed" && rawAnswer) {
      return NextResponse.json({ intent: "question", answer: rawAnswer });
    }
    return NextResponse.json({
      intent: "unknown",
      message: "Não consegui extrair nenhuma transação válida. Tente incluir os valores.",
    });
  }

  const highConf = sanitized.filter(s => s.confidence === "high").length;
  console.info("[AI]", { uid, intentHint, tx: sanitized.length, highConf, ms: latencyMs });

  if (intentHint === "mixed") {
    return NextResponse.json({
      intent: "mixed",
      transactions: sanitized,
      truncated,
      answer: rawAnswer || "",
    });
  }

  return NextResponse.json({
    intent: "launch",
    transactions: sanitized,
    truncated,
  });
}
