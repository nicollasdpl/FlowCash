// Heurística leve para classificar a mensagem antes de chamar o Gemini.
// Usada tanto no servidor (route.ts) quanto no cliente (AIPageContent.tsx)

import type { Intent } from "./types";

export type { Intent };

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}

const PREFIX_RE = /^\[(launch|question|mixed|action)\]\s*/;

export function extractIntentFromAssistantContent(content: string): Intent | null {
  const match = PREFIX_RE.exec(content);
  if (!match) return null;
  return match[1] as Intent;
}

export function stripIntentPrefix(content: string): string {
  return content.replace(PREFIX_RE, "");
}

const ACTION_PATTERNS: RegExp[] = [
  /\bapaga\b/,
  /\bapagar\b/,
  /\bdeleta\b/,
  /\bdeletar\b/,
  /\bremove\b/,
  /\bremover\b/,
  /\bdesfaz\b/,
  /\bdesfazer\b/,
  /\bcancela\b/,
  /\bcancelar\b/,
  /\bexclui\b/,
  /\bexcluir\b/,
  /\bedita\b/,
  /\beditar\b/,
  /\batualiza\b/,
  /\bcorrige o lancamento\b/,
  /\bcorrige a compra\b/,
];

export function detectIntent(message: string, previousAssistantIntent?: Intent | null): Intent {
  const m = normalize(message);
  if (!m) return "question";

  if (ACTION_PATTERNS.some(p => p.test(m))) return "action";

  const lastWasTx =
    previousAssistantIntent === "launch" ||
    previousAssistantIntent === "mixed" ||
    previousAssistantIntent === "action";

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

  const hasGasteiQuestion =
    m.includes("gastei esse mes") || m.includes("gastei este mes");

  const hasQuestion =
    m.includes("?") ||
    m.includes("quanto") ||
    m.includes("quantos") ||
    m.includes("quanta") ||
    m.includes("qual") ||
    m.includes("quais") ||
    m.includes("me mostra") ||
    m.includes("me mostre") ||
    m.includes("mostra ai") ||
    m.includes("resumo") ||
    m.includes("relatorio") ||
    m.includes("falta") ||
    m.includes("sobrou") ||
    m.includes("sobra") ||
    (/\bcomo\b/.test(m) && !/\bcomo comprei\b/.test(m) && !/\bcomo gastei\b/.test(m)) ||
    /\bonde\b/.test(m) ||
    /\bquando\b/.test(m) ||
    /\bpor que\b/.test(m) ||
    /\bporque\b/.test(m) ||
    hasGasteiQuestion;

  const hasGasteiVerb = /\bgastei\b/.test(m) && !hasGasteiQuestion;

  const hasAmount =
    /(?:^|\s)\d+(?:[.,]\d{1,2})?(?=\s|$)/.test(m) || /\d[.,]\d{1,2}\b/.test(m);

  const hasMoney =
    m.includes("r$") ||
    /\breais?\b/.test(m) ||
    /\bpaguei\b/.test(m) ||
    /\brecebi\b/.test(m) ||
    /\bcomprei\b/.test(m) ||
    /\bparcelei\b/.test(m) ||
    /\bdeu\b/.test(m) ||
    /\bfoi\b/.test(m) ||
    /\bsaiu\b/.test(m) ||
    /\bentrou\b/.test(m) ||
    /\bpix de\b/.test(m) ||
    /\btransferi\b/.test(m) ||
    /\bpassei\b/.test(m) ||
    /\babasteci\b/.test(m) ||
    hasGasteiVerb ||
    hasAmount;

  if (hasQuestion && hasMoney) return "mixed";
  if (hasQuestion) return "question";
  if (hasMoney) return "launch";
  return "question";
}

/** Perguntas que podem ser respondidas localmente sem Gemini. */
export function isLocalAnswerCandidate(message: string): boolean {
  const m = normalize(message);
  return (
    m.includes("quanto gastei") ||
    m.includes("falta quanto") ||
    m.includes("quanto falta") ||
    m.includes("resumo do mes") ||
    m.includes("resumo desse mes") ||
    m === "resumo" ||
    m.includes("qual meu saldo") ||
    m.includes("quanto tenho") ||
    m.includes("saldo das contas") ||
    (m.includes("fatura") && m.includes("cartao"))
  );
}
