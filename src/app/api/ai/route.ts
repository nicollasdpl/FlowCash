import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { detectIntent, extractIntentFromAssistantContent, stripIntentPrefix } from "@/lib/intentDetection";

// ─── Config ───────────────────────────────────────────────────────────────────

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent";

// Permite até ~3 tentativas (retry/backoff) dentro do limite da function serverless.
export const maxDuration = 60;

const RL_MAX     = 60;       // máx. requests por janela
const RL_WIN_MS  = 60_000;   // janela de 60s
const MAX_TX     = 5;        // máx. transações por mensagem
const MAX_HINTS  = 20;       // máx. hints injetados no prompt
const MAX_HISTORY_TURNS = 2; // máx. turnos do histórico injetados (2 pares user+assistant = 4 mensagens)

// ─── Schema estruturado ───────────────────────────────────────────────────────

const TX_ITEM_SCHEMA = {
  type: "object",
  properties: {
    intent:            { type: "string", enum: ["transaction", "card_purchase"] },
    type:              { type: "string", enum: ["income", "expense"] },
    amount:            { type: "number" },
    description:       { type: "string" },
    categoryId:        { type: "string" },
    accountId:         { type: "string" },
    cardId:            { type: "string" },
    competenceDate:    { type: "string" },
    paymentDate:       { type: "string" },
    purchaseDate:      { type: "string" },
    status:            { type: "string", enum: ["paid", "pending", "overdue"] },
    totalInstallments: { type: "integer" },
    confidence:        { type: "string", enum: ["high", "low"] },
  },
  required: ["intent", "amount"],
};

// Schemas por intent — o intent final do payload é ditado pelo servidor (heurística).
// Gemini só precisa preencher o(s) campo(s) relevante(s); o schema enforça a forma
// e impede o modelo de "vazar" pra outro modo (ex: gerar transações quando é pergunta).
const SCHEMA_LAUNCH = {
  type: "object",
  properties: {
    transactions: { type: "array", items: TX_ITEM_SCHEMA },
    message:      { type: "string" }, // usado só quando launch falha (Gemini não achou transações)
  },
  required: ["transactions"],
};

const SCHEMA_QUESTION = {
  type: "object",
  properties: {
    answer:  { type: "string" },
    message: { type: "string" },
  },
  required: ["answer"],
};

const SCHEMA_MIXED = {
  type: "object",
  properties: {
    transactions: { type: "array", items: TX_ITEM_SCHEMA },
    answer:       { type: "string" },
    message:      { type: "string" },
  },
  required: ["transactions", "answer"],
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
  return name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
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

function unauthorized(message: string) {
  return NextResponse.json(
    { intent: "error", code: "UNAUTHORIZED", message },
    { status: 401 }
  );
}

// ─── Autenticação ─────────────────────────────────────────────────────────────

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

// ─── Rate limit em Firestore (atômico) ────────────────────────────────────────
// Doc: users/{uid}/app/rateLimit { requestsThisMinute, windowStart }
// Roda em transação para evitar race entre invocações serverless concorrentes.

async function checkRateLimit(uid: string): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const ref = adminDb().doc(`users/${uid}/app/rateLimit`);
  return adminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const now  = Date.now();
    const data = snap.exists ? snap.data() : null;

    const windowStart = typeof data?.windowStart === "number" ? data.windowStart : 0;
    const count       = typeof data?.requestsThisMinute === "number" ? data.requestsThisMinute : 0;

    // Janela expirou ou doc inexistente → reset.
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

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {

  // ── 1. Autenticar ────────────────────────────────────────────────────────────
  let uid: string | null;
  try {
    uid = await verifyUid(req);
  } catch (e) {
    console.error("[AI] Admin SDK indisponível:", e);
    return NextResponse.json(
      { intent: "error", code: "ADMIN_INIT", message: "Configuração de autenticação ausente no servidor." },
      { status: 500 }
    );
  }
  if (!uid) {
    return unauthorized("Sessão expirada. Faça login novamente.");
  }

  // ── 2. Rate limit em Firestore ───────────────────────────────────────────────
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
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  // ── 3. Validar API key ───────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      intent: "error",
      code: "NO_API_KEY",
      message: "GEMINI_API_KEY não configurada.",
    }, { status: 500 });
  }

  // ── 4. Validar body ──────────────────────────────────────────────────────────
  type HintIn = { categoryId?: unknown; accountId?: unknown; cardId?: unknown; confirmedCount?: unknown; lastUsed?: unknown };
  type FinancialContextIn = {
    month?: string;
    summary?: { income?: number; expenses?: number; balance?: number };
    byCategory?: { name?: string; spent?: number; budget?: number }[];
    recentTransactions?: { description?: string; amount?: number; type?: string; category?: string; date?: string }[];
  };
  type TurnIn = { role?: unknown; content?: unknown };
  let body: {
    message?: string;
    categories?: unknown[];
    accounts?: unknown[];
    cards?: unknown[];
    hints?: Record<string, HintIn>;
    financialContext?: FinancialContextIn;
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

  // ── 4b. Sanitizar histórico ──────────────────────────────────────────────────
  // Aceita só {role, content} com strings, limita a últimos N turnos (cada turno
  // = 1 user + 1 assistant), descarta o resto.
  type Turn = { role: "user" | "assistant"; content: string };
  const sanitizedHistory: Turn[] = (Array.isArray(conversationHistory) ? conversationHistory : [])
    .map((t): Turn => ({
      role:    t?.role === "assistant" ? "assistant" : "user",
      content: typeof t?.content === "string" ? t.content.trim() : "",
    }))
    .filter(t => t.content.length > 0)
    .slice(-MAX_HISTORY_TURNS * 2);

  // Última fala do assistente (carrega o prefixo [launch]/[question]/[mixed])
  const lastAssistantTurn = [...sanitizedHistory].reverse().find(t => t.role === "assistant");
  const previousAssistantIntent = lastAssistantTurn
    ? extractIntentFromAssistantContent(lastAssistantTurn.content)
    : null;

  // ── 4c. Classificar intenção (heurística + contexto do turno anterior) ──────
  const intentHint = detectIntent(message, previousAssistantIntent);
  const needsContext = intentHint !== "launch";

  const today     = todayStr();
  const yesterday = yesterdayStr();

  // Conjuntos de IDs válidos do usuário (para sanitização de categoryId/accountId/cardId).
  const categoriesTyped = categories as { id: string; name: string; type: string }[];
  const accountsTyped   = accounts   as { id: string; name: string }[];
  const cardsTyped      = cards      as { id: string; name: string; brand: string }[];

  const categoryIds = new Set(categoriesTyped.map(c => c.id));
  const accountIds  = new Set(accountsTyped.map(a => a.id));
  const cardIds     = new Set(cardsTyped.map(c => c.id));

  // ── 5. Montar prompt ─────────────────────────────────────────────────────────
  const categoriesList = categoriesTyped
    .map(c => {
      const kw = CATEGORY_KEYWORDS[normalizeKey(c.name)];
      return `  id="${c.id}" | ${c.name} (${c.type})${kw ? ` → ${kw}` : ""}`;
    })
    .join("\n") || "  (nenhuma)";

  const accountsList = accountsTyped
    .map(a => `  id="${a.id}" | ${a.name}`)
    .join("\n") || "  (nenhuma)";

  const cardsList = cardsTyped
    .map(c => `  id="${c.id}" | ${c.name} (${c.brand})`)
    .join("\n") || "  (nenhum)";

  // ── 5b. Hints (memória de comportamento) ─────────────────────────────────────
  // Valida cada hint: descarta os que apontam pra IDs que o usuário não tem mais.
  // Ordena por confirmedCount desc e corta no topo MAX_HINTS.
  type ValidatedHint = { key: string; categoryId: string; accountId?: string; cardId?: string; confirmedCount: number };
  const validatedHints: ValidatedHint[] = Object.entries(hints || {})
    .map(([key, raw]) => {
      const categoryId      = typeof raw?.categoryId      === "string" ? raw.categoryId      : "";
      const rawAccountId    = typeof raw?.accountId       === "string" ? raw.accountId       : "";
      const rawCardId       = typeof raw?.cardId          === "string" ? raw.cardId          : "";
      const confirmedCount  = typeof raw?.confirmedCount  === "number" ? raw.confirmedCount  : 0;
      const normKey = typeof key === "string" ? key.toLowerCase().trim() : "";
      return { key: normKey, categoryId, accountId: rawAccountId, cardId: rawCardId, confirmedCount };
    })
    .filter(h =>
      h.key &&
      h.confirmedCount >= 1 &&
      categoryIds.has(h.categoryId) &&
      (h.accountId ? accountIds.has(h.accountId) : true) &&
      (h.cardId    ? cardIds.has(h.cardId)       : true) &&
      (h.accountId || h.cardId)
    )
    .sort((a, b) => b.confirmedCount - a.confirmedCount)
    .slice(0, MAX_HINTS);

  const hintsList = validatedHints.length === 0 ? "" :
    "\n\nPreferências do usuário (baseadas em histórico confirmado):\n" +
    validatedHints.map(h => {
      const cat  = categoriesTyped.find(c => c.id === h.categoryId);
      const acc  = h.accountId ? accountsTyped.find(a => a.id === h.accountId) : null;
      const card = h.cardId    ? cardsTyped.find(c => c.id === h.cardId)       : null;
      const dest = acc ? `conta: ${acc.name}` : card ? `cartão: ${card.name}` : "";
      return `- '${h.key}' → categoria: ${cat?.name ?? "?"}${dest ? `, ${dest}` : ""} (confirmado ${h.confirmedCount}x)`;
    }).join("\n");

  // ── 5b2. Bloco de histórico recente ─────────────────────────────────────────
  // Prefixos [launch]/[question]/[mixed] são strip antes de mostrar pro Gemini.
  const historyBlock = sanitizedHistory.length === 0 ? "" :
    "\n\nContexto recente da conversa:\n" + sanitizedHistory.map(turn => {
      const label   = turn.role === "user" ? "Usuário" : "Assistente";
      const content = turn.role === "assistant" ? stripIntentPrefix(turn.content) : turn.content;
      return `${label}: ${content}`;
    }).join("\n");

  // ── 5c. Bloco de contexto financeiro (apenas se intent != launch) ────────────
  function fmtBRL(n: number): string {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  let financialContextBlock = "";
  if (needsContext && financialContext) {
    const { month, summary, byCategory, recentTransactions } = financialContext;
    const incomeStr   = typeof summary?.income   === "number" ? fmtBRL(summary.income)   : "—";
    const expensesStr = typeof summary?.expenses === "number" ? fmtBRL(summary.expenses) : "—";
    const balanceStr  = typeof summary?.balance  === "number" ? fmtBRL(summary.balance)  : "—";

    const byCatLines = (byCategory ?? [])
      .filter(c => typeof c?.name === "string" && typeof c?.spent === "number")
      .map(c => {
        const budget = typeof c.budget === "number" ? ` / orçamento ${fmtBRL(c.budget)}` : "";
        return `  - ${c.name}: ${fmtBRL(c.spent as number)}${budget}`;
      })
      .join("\n") || "  (sem gastos no mês)";

    const recentLines = (recentTransactions ?? [])
      .filter(t => typeof t?.description === "string" && typeof t?.amount === "number")
      .map(t => `  - ${t.date ?? "—"} | ${t.type === "income" ? "+" : "−"}${fmtBRL(t.amount as number)} | ${t.description} (${t.category ?? "—"})`)
      .join("\n") || "  (sem lançamentos recentes)";

    financialContextBlock = `

CONTEXTO FINANCEIRO ATUAL:
Mês: ${month ?? "—"}
Resumo do mês: receitas ${incomeStr} | despesas ${expensesStr} | saldo atual ${balanceStr}
Gastos por categoria (mês):
${byCatLines}
Últimos lançamentos:
${recentLines}`;
  }

  // ── 5d. Instruções específicas por intent ────────────────────────────────────
  // O responseSchema selecionado já enforça os campos; aqui só explicamos a TAREFA.
  const intentInstructions = intentHint === "launch"
    ? `\nTAREFA: extrair transação(ões) financeira(s) dessa mensagem. Preencha "transactions" com 1+ itens. Se a mensagem não contiver nenhuma transação clara, retorne transactions=[] e use "message" para explicar brevemente.`
    : intentHint === "question"
    ? `\nTAREFA: responder a pergunta do usuário sobre as finanças dele. Preencha SOMENTE o campo "answer" (string em markdown simples, em português brasileiro). Use APENAS o CONTEXTO FINANCEIRO ATUAL acima como fonte de verdade — não invente valores. Seja conciso e direto: 1-3 parágrafos curtos, ou uma lista enxuta. Negrito com **texto**. Listas com "- ". Se a pergunta não puder ser respondida com os dados disponíveis, diga isso brevemente no próprio answer (NÃO retorne answer vazio).`
    : `\nTAREFA: extrair transação(ões) E responder à pergunta na mesma mensagem. Preencha "transactions" com os lançamentos identificados E "answer" com a resposta em markdown simples. No "answer", considere que as transações extraídas vão ser confirmadas em seguida — use formulações como "Após esse lançamento, ...". Use APENAS o CONTEXTO FINANCEIRO ATUAL como fonte de verdade.`;

  const prompt = `Você é um assistente financeiro pessoal brasileiro. Extraia dados financeiros e responda perguntas sobre as finanças do usuário.

INSTRUÇÃO CRÍTICA: você DEVE responder APENAS com JSON válido seguindo o schema fornecido. NUNCA responda em texto livre. NUNCA confirme lançamentos em texto (ex: "Lançamento realizado com sucesso", "Valor: R$ X"). Toda resposta DEVE ser um objeto JSON parseável. Se não souber o que fazer, devolva o JSON com os campos vazios — mas devolva JSON.

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
${cardsList}${historyBlock}

MENSAGEM ATUAL: "${message.trim()}"${financialContextBlock}
${intentInstructions}

A mensagem do usuário pode conter MÚLTIPLAS transações (ex: "gastei 50 no ifood e 30 de uber" → 2 itens).
Cada item da array tem os campos:
- intent: "transaction" | "card_purchase"
- type: "income" | "expense" (transaction)
- amount: número decimal
- description: texto curto
- categoryId: id da categoria mais provável (string vazia se nenhuma se encaixa)
- accountId: id da conta (transaction)
- cardId: id do cartão (card_purchase)
- competenceDate, paymentDate: YYYY-MM-DD (transaction)
- purchaseDate: YYYY-MM-DD (card_purchase)
- status: "paid" | "pending" (transaction)
- totalInstallments: int (card_purchase, 1 = à vista)
- confidence: "high" | "low"
  - "high": categoryId, accountId/cardId e amount foram identificados sem ambiguidade — usuário mencionou explicitamente OU bate com uma preferência confirmada (ver bloco "Preferências do usuário" abaixo, se houver). Parcelas (se aplicável) também foram especificadas.
  - "low": qualquer campo foi inferido por default (primeira conta/cartão da lista quando não há menção, categoria adivinhada por keyword fraca, valor ambíguo, parcelas mencionadas mas sem número, mensagem com ruído).

REGRAS:
- Menciona bandeira (Visa/Mastercard/Elo/Amex) ou palavra "cartão" → intent=card_purchase
- Parcelado/"em X vezes"/"X parcelas" → card_purchase, totalInstallments=X
- Banco (Bradesco/Nubank/Itaú/Inter/C6) sem "cartão" → transaction com accountId
- Gasto sem cartão → transaction, type=expense
- Receita/salário/freela/pix recebido → transaction, type=income
- Mensagem sem nenhuma transação clara → intent="unknown", transactions=[]
- "hoje" → ${today} | "ontem" → ${yesterday} | sem data → ${today}
- Status padrão: "paid" | "vou pagar"/"pendente"/"devo" → "pending"
- Sem conta → primeiro id da lista | Sem cartão → primeiro id da lista
- VALOR: converta para número decimal. "49,75"→49.75 | "R$50"→50 | "1.200,00"→1200 | "mil reais"→1000 | "cinquenta"→50
- Máximo ${MAX_TX} transações por resposta.

EXEMPLOS DE LAUNCH:
"passei 30 no mercadão" → 1 item: Alimentação, expense, 30
"gastei 50 no ifood e 30 de uber" → 2 itens: [iFood/Alimentação 50, Uber/Transporte 30]
"100 de gasolina e paguei netflix 39,90" → 2 itens: [Gasolina/Transporte 100, Netflix/Assinatura 39.90]
"recebi salário 3000 e paguei aluguel 1200" → 2 itens: [Salário income 3000, Aluguel/Moradia expense 1200]
"comprei tênis 400 em 4x no cartão" → 1 item card_purchase, 400, 4 parcelas
"boteco ontem, 80 conto" → 1 item: Bebida, expense, 80, ontem
"oi tudo bem" → intent=unknown, transactions=[]

EXEMPLO DE CORREÇÃO (lê o "Contexto recente da conversa" acima):
Histórico:
  Usuário: "8,25 em lazer cartão Bradesco"
  Assistente: R$ 8,25 em Lazer (cartão Bradesco)
Mensagem atual: "errado, foi 15,50"
→ 1 item: card_purchase de Lazer no cartão Bradesco, amount=15.50, totalInstallments=1, mesmos demais campos da identificação anterior.

Outra correção típica:
Histórico:
  Usuário: "gastei 50 no ifood"
  Assistente: R$ 50,00 em Alimentação (conta Nubank)
Mensagem atual: "na verdade foi no Bradesco"
→ 1 item: transaction de Alimentação, amount=50, accountId do Bradesco.

EXEMPLOS DE QUESTION (use o CONTEXTO FINANCEIRO acima — não invente valores):
"quanto gastei esse mês?" → answer: "Você gastou **R$ 1.240** em maio. Sua maior categoria foi **Alimentação** com R$ 480."
"falta quanto pro limite de alimentação?" → answer: "Seu orçamento de Alimentação é **R$ 600**. Você já gastou **R$ 480**, faltam **R$ 120**."
"resumo do mês" → answer: "Em maio:\\n- Receitas: **R$ 5.000**\\n- Despesas: **R$ 2.300**\\n- Saldo das contas: **R$ 3.200**"

EXEMPLOS DE MIXED:
"gastei 50 no iFood, como tá o orçamento de alimentação?" →
transactions: [iFood/Alimentação 50] + answer: "Após esse lançamento, você terá gasto **R$ 530** de **R$ 600** no orçamento de Alimentação."${hintsList}`;

  // ── 6. Chamar Gemini ─────────────────────────────────────────────────────────
  const responseSchema =
    intentHint === "launch"   ? SCHEMA_LAUNCH   :
    intentHint === "question" ? SCHEMA_QUESTION :
                                SCHEMA_MIXED;

  const geminiBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.0,
      maxOutputTokens: 2048,
      // gemini-2.0-flash-001 NÃO é "thinking" — sem thinkingConfig (evita 400 e o
      // consumo de tokens de raciocínio que truncava o JSON no 2.5-flash).
    },
  });

  // 503/500/502/504 e timeout/rede são transitórios (modelo sobrecarregado/lento)
  // → re-tenta com backoff antes de desistir. 429 (rate limit) NÃO entra aqui.
  const MAX_ATTEMPTS = 3;
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
      // HTTP transitório: re-tenta se ainda há tentativas; senão o bloco 7 trata.
      if (TRANSIENT_HTTP.has(res.status) && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 500 * attempt)); // 500ms, 1000ms
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
        message: isTimeout
          ? "Gemini não respondeu a tempo. Tente novamente."
          : "Erro de rede ao conectar com o Gemini.",
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

  // ── 7. Tratar erros HTTP ─────────────────────────────────────────────────────
  if (!geminiRes.ok) {
    const errBody = await geminiRes.text().catch(() => "");
    console.error(`[AI] HTTP ${geminiRes.status}:`, errBody.slice(0, 400));

    if (geminiRes.status === 429) {
      return NextResponse.json(
        { intent: "error", code: "HTTP_429", message: "Limite da API Gemini atingido. Aguarde alguns segundos.", retryAfterSec: 30 },
        { status: 429 }
      );
    }

    // 503/500/502/504 que sobreviveram às tentativas → erro retentável pelo cliente.
    if (TRANSIENT_HTTP.has(geminiRes.status)) {
      return NextResponse.json({
        intent: "error",
        code: "HTTP_503",
        message: "O modelo está sobrecarregado no momento. Tente novamente em instantes.",
        retryAfterSec: 15,
      });
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

  // ── 8. Parsear envelope ──────────────────────────────────────────────────────
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

  let parsed: { intent?: string; transactions?: unknown[]; message?: string; answer?: string };
  try {
    parsed = JSON.parse(rawText.trim());
  } catch {
    // Gemini ignorou o responseSchema e devolveu texto livre — devolve 422 pra
    // que o cliente trate como "resposta inválida" sem travar o input.
    console.warn("[AI] Gemini retornou texto não-JSON:", rawText.slice(0, 200));
    return NextResponse.json(
      { intent: "error", code: "INVALID_RESPONSE", message: "Resposta inválida do modelo." },
      { status: 422 },
    );
  }

  // ── 9. Resposta-only (intent question) ───────────────────────────────────────
  // Não precisamos validar o `parsed.intent` aqui — quem dita o intent final é a
  // heurística do servidor (`intentHint`). O Gemini só fornece os dados.
  const rawAnswer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";

  if (intentHint === "question") {
    if (!rawAnswer) {
      return NextResponse.json({
        intent: "unknown",
        message: parsed.message || "Não consegui responder com os dados disponíveis. Tente reformular.",
      });
    }
    return NextResponse.json({ intent: "question", answer: rawAnswer });
  }

  // ── 10. Sanitizar transações (intent launch ou mixed) ───────────────────────
  const rawItems = Array.isArray(parsed.transactions) ? parsed.transactions : [];
  if (rawItems.length === 0) {
    // Sem transações: se era "mixed" mas a resposta veio, degrade para "question";
    // se era "launch" puro, é unknown.
    if (intentHint === "mixed" && rawAnswer) {
      return NextResponse.json({ intent: "question", answer: rawAnswer });
    }
    return NextResponse.json({
      intent: "unknown",
      message: parsed.message || "Não consegui identificar nenhuma transação. Tente reformular.",
    });
  }

  const truncated = rawItems.length > MAX_TX;
  const items     = rawItems.slice(0, MAX_TX);

  const firstAccountId = accountsTyped[0]?.id ?? "";
  const firstCardId    = cardsTyped[0]?.id ?? "";

  type SanitizedItem = {
    intent: "transaction" | "card_purchase";
    type?: "income" | "expense";
    amount: number;
    description: string;
    categoryId: string | null;     // null = não reconhecida, escolher manualmente
    accountId?: string;
    cardId?: string;
    competenceDate?: string;
    paymentDate?: string;
    purchaseDate?: string;
    status?: "paid" | "pending";
    totalInstallments?: number;
    confidence: "high" | "low";
  };

  const sanitized: SanitizedItem[] = [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;

    const intent = r.intent === "card_purchase" ? "card_purchase" : "transaction";

    // amount: aceita number ou string com vírgula
    let amount: number;
    if (typeof r.amount === "string") {
      const n = parseFloat(r.amount.replace(/\./g, "").replace(",", "."));
      amount = isNaN(n) ? 0 : n;
    } else if (typeof r.amount === "number") {
      amount = r.amount;
    } else {
      amount = 0;
    }
    if (!amount || amount <= 0) continue; // item inválido, pula

    const description = typeof r.description === "string" ? r.description : "";

    // confidence: começa pelo que o Gemini disse; servidor rebaixa pra "low" se detectar fallback.
    let confidence: "high" | "low" = r.confidence === "high" ? "high" : "low";

    // categoryId: null se não bater com nenhuma categoria do usuário (força low)
    const rawCategoryId = typeof r.categoryId === "string" ? r.categoryId : "";
    const categoryId    = rawCategoryId && categoryIds.has(rawCategoryId) ? rawCategoryId : null;
    if (!categoryId) confidence = "low";

    if (intent === "transaction") {
      const type = r.type === "income" ? "income" : "expense";

      const rawAccountId = typeof r.accountId === "string" ? r.accountId : "";
      const validRawAccount = Boolean(rawAccountId) && accountIds.has(rawAccountId);
      const accountId    = validRawAccount ? rawAccountId : firstAccountId;
      // Se Gemini não trouxe accountId válido e caímos no default, rebaixa confidence.
      if (!validRawAccount) confidence = "low";

      const paymentDate    = typeof r.paymentDate    === "string" && r.paymentDate    ? r.paymentDate    : today;
      const competenceDate = typeof r.competenceDate === "string" && r.competenceDate ? r.competenceDate : paymentDate;
      const status         = r.status === "pending" || r.status === "overdue" ? "pending" : "paid";

      sanitized.push({
        intent, type, amount, description, categoryId,
        accountId, competenceDate, paymentDate, status, confidence,
      });
    } else {
      const rawCardId = typeof r.cardId === "string" ? r.cardId : "";
      const validRawCard = Boolean(rawCardId) && cardIds.has(rawCardId);
      const cardId    = validRawCard ? rawCardId : firstCardId;
      // Mesmo motivo do accountId: fallback derruba confidence.
      if (!validRawCard) confidence = "low";

      const purchaseDate      = typeof r.purchaseDate === "string" && r.purchaseDate ? r.purchaseDate : today;
      const totalInstallments = typeof r.totalInstallments === "number" && r.totalInstallments > 0
        ? Math.floor(r.totalInstallments) : 1;
      // Parcelamento ambíguo é detectado pelo próprio Gemini via confidence "low".
      // Aqui não rebaixamos: totalInstallments=1 ausente significa à vista, não ambiguidade.

      sanitized.push({
        intent, amount, description, categoryId,
        cardId, purchaseDate, totalInstallments, confidence,
      });
    }
  }

  if (sanitized.length === 0) {
    if (intentHint === "mixed" && rawAnswer) {
      return NextResponse.json({ intent: "question", answer: rawAnswer });
    }
    return NextResponse.json({
      intent: "unknown",
      message: "Não consegui extrair nenhuma transação válida. Tente incluir os valores.",
    });
  }

  // Resposta final: "launch" puro ou "mixed" (com answer).
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
