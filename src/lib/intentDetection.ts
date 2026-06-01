// Heurística leve para classificar a mensagem antes de chamar o Gemini.
// Usada tanto no servidor (route.ts) quanto no cliente (AIPageContent.tsx)
// — cliente decide se anexa financialContext, servidor decide qual prompt monta.

export type Intent = "launch" | "question" | "mixed";

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}

// O content do assistente no histórico vem prefixado com [launch], [question]
// ou [mixed]. Esses helpers parseiam o marcador e oferecem uma versão limpa
// pra injetar no prompt do Gemini.
const PREFIX_RE = /^\[(launch|question|mixed)\]\s*/;

export function extractIntentFromAssistantContent(content: string): Intent | null {
  const match = PREFIX_RE.exec(content);
  if (!match) return null;
  return match[1] as Intent;
}

export function stripIntentPrefix(content: string): string {
  return content.replace(PREFIX_RE, "");
}

export function detectIntent(
  message: string,
  previousAssistantIntent?: Intent | null,
): Intent {
  const m = normalize(message);
  if (!m) return "question"; // fallback conservador

  // ── Sinais de correção ─────────────────────────────────────────────────────
  // Só ativam quando o turno anterior do assistente foi launch ou mixed.
  // "errado, foi 15,50" sozinho não tem money signal, cairia em question —
  // mas se acabamos de identificar uma transação, é uma correção do valor.
  const lastWasTx = previousAssistantIntent === "launch" || previousAssistantIntent === "mixed";
  if (lastWasTx) {
    const correctionPatterns: RegExp[] = [
      /^errado\b/,
      /\bcorrige\b/,
      /\bcorrija\b/,
      /^nao foi isso\b/,
      /^nao,? foi\b/,
      /\bmuda pra\b/,
      /\bmuda para\b/,
      /\btroca pra\b/,
      /\btroca para\b/,
      /^na verdade\b/,
    ];
    if (correctionPatterns.some(p => p.test(m))) return "launch";
  }

  // ── Sinais de pergunta ────────────────────────────────────────────────────
  // "gastei esse mes" é uma pergunta — vem ANTES da detecção de "gastei" como verbo.
  const hasGasteiQuestion = m.includes("gastei esse mes") || m.includes("gastei este mes");
  const hasQuestion =
    m.includes("?")            ||
    m.includes("quanto")       ||
    m.includes("quantos")      ||
    m.includes("quanta")       ||
    m.includes("qual")         ||
    m.includes("quais")        ||
    m.includes("me mostra")    ||
    m.includes("me mostre")    ||
    m.includes("mostra ai")    ||
    m.includes("resumo")       ||
    m.includes("relatorio")    ||
    m.includes("falta")        ||
    m.includes("sobrou")       ||
    m.includes("sobra")        ||
    /\bcomo\b/.test(m)         || // word boundary para não casar "comprei"
    /\bonde\b/.test(m)         ||
    /\bquando\b/.test(m)       ||
    /\bpor que\b/.test(m)      ||
    /\bporque\b/.test(m)       ||
    hasGasteiQuestion;

  // ── Sinais de lançamento (valor monetário ou verbo de transação) ─────────
  // "gastei" só vale como sinal de lançamento se NÃO for parte de "gastei esse mês".
  const hasGasteiVerb = /\bgastei\b/.test(m) && !hasGasteiQuestion;

  // Valor monetário "solto" — cobre lançamentos sem verbo explícito:
  // "17,97 em comida no cartão Bradesco", "50 no mercado", "12,90 Spotify".
  const hasAmount =
    /(?:^|\s)\d+(?:[.,]\d{1,2})?(?=\s|$)/.test(m) ||  // token numérico isolado: 50 · 17,97 · 12,90
    /\d[.,]\d{1,2}\b/.test(m);                        // decimais mesmo grudados: "r$17,97"

  const hasMoney =
    m.includes("r$")           ||
    /\breais?\b/.test(m)       ||
    /\bpaguei\b/.test(m)       ||
    /\brecebi\b/.test(m)       ||
    /\bcomprei\b/.test(m)      ||
    /\bparcelei\b/.test(m)     ||
    hasGasteiVerb              ||
    hasAmount;

  if (hasQuestion && hasMoney) return "mixed";
  if (hasQuestion)             return "question";
  if (hasMoney)                return "launch";
  return "question"; // fallback conservador para mensagens ambíguas
}
