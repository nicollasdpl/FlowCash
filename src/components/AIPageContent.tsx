"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp, newId } from "@/context/AppContext";
import type { Transaction, CardPurchase } from "@/context/AppContext";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, increment } from "firebase/firestore";
import { Utensils, Car, Wallet, CreditCard, Fuel, Home, Package, X, AlertTriangle, Undo2 } from "lucide-react";
import CategoryIcon, { iconLabel } from "@/components/CategoryIcon";
import { detectIntent, extractIntentFromAssistantContent } from "@/lib/intentDetection";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type AITxItem = {
  intent: "transaction";
  type: "income" | "expense";
  amount: number;
  description: string;
  categoryId: string | null;
  accountId: string;
  competenceDate: string;
  paymentDate: string;
  status: "paid" | "pending" | "overdue";
  confidence: "high" | "low";
};

type AIPurchaseItem = {
  intent: "card_purchase";
  amount: number;
  description: string;
  categoryId: string | null;
  cardId: string;
  purchaseDate: string;
  totalInstallments: number;
  confidence: "high" | "low";
};

// ─── Memória de comportamento ─────────────────────────────────────────────────

type Hint = {
  categoryId: string;
  accountId?: string;
  cardId?: string;
  confirmedCount: number;
  lastUsed: string;
};
type Hints = Record<string, Hint>;

function normalizeHintKey(description: string): string {
  return description.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}

const AUTO_CONFIRM_MAX_AMOUNT = 500;
const AUTO_CONFIRM_SECONDS    = 5;

type AIItem = AITxItem | AIPurchaseItem;

type AILaunch   = { intent: "launch"; transactions: AIItem[]; truncated?: boolean };
type AIQuestion = { intent: "question"; answer: string };
type AIMixed    = { intent: "mixed"; transactions: AIItem[]; truncated?: boolean; answer: string };
type AIError    = { intent: "error"; code: string; message: string; retryAfterSec?: number };
type AIUnknown  = { intent: "unknown"; message: string };
type AIResult   = AILaunch | AIQuestion | AIMixed | AIError | AIUnknown;

type ChatTurn = { q: string; a: string };
const CHAT_HISTORY_MAX = 5;

// Histórico enviado ao Gemini (separado do chatHistory que é só display).
// Inclui launches puros também, para o modelo entender correções como
// "errado, foi 15". Limite rígido de 2 turnos (= 4 mensagens).
type ConversationTurn = { role: "user" | "assistant"; content: string };
const CONVERSATION_HISTORY_MAX = 4;

// Tipo do contexto financeiro enviado ao servidor (montado a partir do state local).
type FinancialContext = {
  month: string;
  summary: { income: number; expenses: number; balance: number };
  byCategory: { name: string; spent: number; budget?: number }[];
  recentTransactions: { description: string; amount: number; type: string; category: string; date: string }[];
};

type TxDraft = {
  amount: string;
  description: string;
  categoryId: string;
  accountId: string;
  paymentDate: string;
  status: "paid" | "pending";
};

type PurchaseDraft = {
  amount: string;
  description: string;
  categoryId: string;
  cardId: string;
  purchaseDate: string;
  totalInstallments: string;
};

type DraftItem =
  | { uid: string; intent: "transaction"; type: "income" | "expense"; tx: TxDraft }
  | { uid: string; intent: "card_purchase"; purchase: PurchaseDraft };

// ─── Chips de sugestão ────────────────────────────────────────────────────────

const QUICK_CHIPS = [
  { Icon: Utensils,   label: "iFood",    text: "gastei R$  no iFood hoje" },
  { Icon: Car,        label: "Uber",     text: "paguei Uber R$ " },
  { Icon: Wallet,     label: "Salário",  text: "recebi salário de R$ " },
  { Icon: CreditCard, label: "Cartão",   text: "comprei no cartão " },
  { Icon: Fuel,       label: "Gasolina", text: "abasteci R$  de gasolina" },
  { Icon: Home,       label: "Moradia",  text: "paguei aluguel R$ " },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Context builder (a partir do state do AppContext) ────────────────────────
// Não toca em Firestore — só agrega o que já está em memória.
// Card purchases ficam de fora: dependem do engine (off-limits) para cálculo
// correto de fatura/parcelamento.

type CtxAccount  = { id: string; initialBalance: number; active: boolean };
type CtxTx       = { accountId: string; type: string; amount: number; description: string; categoryId: string;
                     competenceDate: string; paymentDate: string; status: string };
type CtxCategory = { id: string; name: string };
type CtxBudget   = { categoryId: string; month: string; limitAmount: number };

function buildFinancialContext(
  accounts:   CtxAccount[],
  transactions: CtxTx[],
  categories: CtxCategory[],
  budgets:    CtxBudget[],
): FinancialContext {
  const today = new Date();
  const month = today.toISOString().slice(0, 7); // YYYY-MM

  const paidThisMonth = transactions.filter(t => t.status === "paid" && t.competenceDate.startsWith(month));
  const income   = paidThisMonth.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expenses = paidThisMonth.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  // Saldo aproximado: soma de initialBalance + (pagos income − pagos expense) por conta ativa.
  // Não considera fatura de cartão (engine off-limits) — é estimativa pra dar contexto ao Gemini.
  const balance = accounts.filter(a => a.active).reduce((sum, acc) => {
    const accTxs = transactions.filter(t => t.accountId === acc.id && t.status === "paid");
    const acin   = accTxs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const acex   = accTxs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return sum + acc.initialBalance + acin - acex;
  }, 0);

  const byCatMap: Record<string, number> = {};
  for (const t of paidThisMonth.filter(t => t.type === "expense")) {
    byCatMap[t.categoryId] = (byCatMap[t.categoryId] ?? 0) + t.amount;
  }
  const byCategory = Object.entries(byCatMap)
    .map(([categoryId, spent]) => {
      const cat    = categories.find(c => c.id === categoryId);
      const budget = budgets.find(b => b.categoryId === categoryId && b.month === month);
      return {
        name: cat?.name ?? "—",
        spent,
        budget: budget?.limitAmount,
      };
    })
    .sort((a, b) => b.spent - a.spent);

  const recentTransactions = [...transactions]
    .sort((a, b) => (b.paymentDate || "").localeCompare(a.paymentDate || ""))
    .slice(0, 10)
    .map(t => ({
      description: t.description,
      amount:      t.amount,
      type:        t.type,
      category:    categories.find(c => c.id === t.categoryId)?.name ?? "—",
      date:        t.paymentDate,
    }));

  return {
    month,
    summary: { income, expenses, balance },
    byCategory,
    recentTransactions,
  };
}

// ─── Markdown mínimo (sem lib externa): negrito **x** + listas "- " ──────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
      return <strong key={i} style={{ color: "var(--text-1)" }}>{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

function Markdown({ text }: { text: string }) {
  type Block = { kind: "p" | "ul"; lines: string[] };
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (current) { blocks.push(current); current = null; }
      continue;
    }
    const listMatch = /^\s*-\s+(.*)$/.exec(line);
    if (listMatch) {
      if (current?.kind !== "ul") {
        if (current) blocks.push(current);
        current = { kind: "ul", lines: [] };
      }
      current.lines.push(listMatch[1]);
    } else {
      if (current?.kind !== "p") {
        if (current) blocks.push(current);
        current = { kind: "p", lines: [] };
      }
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);

  return (
    <>
      {blocks.map((b, i) => b.kind === "ul" ? (
        <ul key={i} style={{ margin: "6px 0 0", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "3px" }}>
          {b.lines.map((l, j) => <li key={j} style={{ lineHeight: 1.5 }}>{renderInline(l)}</li>)}
        </ul>
      ) : (
        <p key={i} style={{ margin: i === 0 ? 0 : "8px 0 0", lineHeight: 1.5 }}>{renderInline(b.lines.join(" "))}</p>
      ))}
    </>
  );
}

function SparkleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L13.9 9.1L21 11L13.9 12.9L12 20L10.1 12.9L3 11L10.1 9.1L12 2Z" />
      <circle cx="19" cy="4" r="1.5" opacity="0.5" />
      <circle cx="5"  cy="18" r="1"   opacity="0.4" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function itemToDraft(item: AIItem): DraftItem {
  const uid = newId();
  if (item.intent === "transaction") {
    return {
      uid,
      intent: "transaction",
      type: item.type,
      tx: {
        amount: String(item.amount),
        description: item.description,
        categoryId: item.categoryId ?? "",
        accountId: item.accountId,
        paymentDate: item.paymentDate,
        status: item.status === "overdue" ? "pending" : item.status,
      },
    };
  }
  return {
    uid,
    intent: "card_purchase",
    purchase: {
      amount: String(item.amount),
      description: item.description,
      categoryId: item.categoryId ?? "",
      cardId: item.cardId,
      purchaseDate: item.purchaseDate,
      totalInstallments: String(item.totalInstallments),
    },
  };
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function AIPageContent() {
  const router = useRouter();
  const { state, dispatch } = useApp();

  const [message, setMessage]         = useState("");
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<AIResult | null>(null);
  const [drafts, setDrafts]           = useState<DraftItem[]>([]);
  const [flash, setFlash]             = useState(false);
  const [flashCount, setFlashCount]   = useState(0);
  const [retryIn, setRetryIn]         = useState<number | null>(null);
  const [hints, setHints]             = useState<Hints>({});
  const [autoConfirmIn, setAutoConfirmIn] = useState<number | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);

  const inputRef            = useRef<HTMLTextAreaElement>(null);
  const contentRef          = useRef<HTMLDivElement>(null);
  const pendingMsg          = useRef<string>("");
  const retryTimerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoConfirmTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current)       clearInterval(retryTimerRef.current);
      if (autoConfirmTimerRef.current) clearInterval(autoConfirmTimerRef.current);
    };
  }, []);

  // ── Carregar memória de comportamento ao logar ─────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) {
        setHints({});
        return;
      }
      try {
        const ref  = doc(db, "users", user.uid, "app", "aiMemory");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (data?.hints && typeof data.hints === "object") {
            setHints(data.hints as Hints);
          }
        }
      } catch (err) {
        console.warn("[aiMemory] falha ao carregar hints:", err);
      }
    });
    return () => unsub();
  }, []);

  // ── Auto-confirm: avalia se TODAS as transações batem nas condições ──────
  function shouldAutoConfirm(items: AIItem[]): boolean {
    if (items.length === 0) return false;
    const validCategoryIds = new Set(state.categories.map(c => c.id));
    const validAccountIds  = new Set(state.accounts.filter(a => a.active).map(a => a.id));
    const validCardIds     = new Set(state.cards.map(c => c.id));

    return items.every(item => {
      if (item.confidence !== "high") return false;
      if (!item.categoryId || !validCategoryIds.has(item.categoryId)) return false;
      if (item.amount <= 0 || item.amount > AUTO_CONFIRM_MAX_AMOUNT) return false;
      if (item.intent === "transaction") {
        return Boolean(item.accountId) && validAccountIds.has(item.accountId);
      }
      // card_purchase: cardId válido e totalInstallments >= 1
      return Boolean(item.cardId) && validCardIds.has(item.cardId) && item.totalInstallments >= 1;
    });
  }

  function stopAutoConfirm() {
    if (autoConfirmTimerRef.current) {
      clearInterval(autoConfirmTimerRef.current);
      autoConfirmTimerRef.current = null;
    }
    setAutoConfirmIn(null);
  }

  function startAutoConfirm() {
    setAutoConfirmIn(AUTO_CONFIRM_SECONDS);
    autoConfirmTimerRef.current = setInterval(() => {
      setAutoConfirmIn(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(autoConfirmTimerRef.current!);
          autoConfirmTimerRef.current = null;
          handleConfirm();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // Helper que mantém result + drafts em sincronia + dispara auto-confirm.
  // Mixed nunca auto-confirma: usuário pediu engajamento, deve ler a resposta.
  function applyResult(next: AIResult | null) {
    stopAutoConfirm();
    setResult(next);
    if (next?.intent === "launch" || next?.intent === "mixed") {
      setDrafts(next.transactions.map(itemToDraft));
      if (next.intent === "launch" && shouldAutoConfirm(next.transactions)) {
        startAutoConfirm();
      }
    } else {
      setDrafts([]);
    }
  }

  // ── Salvar memória após confirmar ───────────────────────────────────────────
  async function persistHints(items: DraftItem[]) {
    const user = auth.currentUser;
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];

    // Agrupa por key normalizada pra que múltiplas ocorrências no mesmo batch
    // resultem num único increment(N).
    type Bucket = { categoryId: string; accountId?: string; cardId?: string; count: number };
    const buckets: Record<string, Bucket> = {};

    for (const d of items) {
      const description = d.intent === "transaction" ? d.tx.description : d.purchase.description;
      const categoryId  = d.intent === "transaction" ? d.tx.categoryId  : d.purchase.categoryId;
      const destination = d.intent === "transaction" ? d.tx.accountId   : d.purchase.cardId;
      const isCard      = d.intent === "card_purchase";
      const key = normalizeHintKey(description);
      if (!key || !categoryId || !destination) continue;
      const b = buckets[key] ?? { categoryId, count: 0 };
      b.categoryId = categoryId;
      if (isCard) b.cardId    = destination;
      else        b.accountId = destination;
      b.count += 1;
      buckets[key] = b;
    }

    if (Object.keys(buckets).length === 0) return;

    const hintsPayload: Record<string, Record<string, unknown>> = {};
    for (const [key, b] of Object.entries(buckets)) {
      const entry: Record<string, unknown> = {
        categoryId: b.categoryId,
        confirmedCount: increment(b.count),
        lastUsed: today,
      };
      if (b.accountId) entry.accountId = b.accountId;
      if (b.cardId)    entry.cardId    = b.cardId;
      hintsPayload[key] = entry;
    }

    try {
      const ref = doc(db, "users", user.uid, "app", "aiMemory");
      await setDoc(ref, { hints: hintsPayload }, { merge: true });

      // Atualiza estado local pra que o próximo prompt já reflita o aprendizado
      // (sem precisar reler do Firestore).
      setHints(prev => {
        const updated = { ...prev };
        for (const [key, b] of Object.entries(buckets)) {
          const existing = updated[key];
          updated[key] = {
            categoryId: b.categoryId,
            accountId: b.accountId ?? existing?.accountId,
            cardId:    b.cardId    ?? existing?.cardId,
            confirmedCount: (existing?.confirmedCount ?? 0) + b.count,
            lastUsed: today,
          };
        }
        return updated;
      });
    } catch (err) {
      console.warn("[aiMemory] falha ao salvar hints:", err);
    }
  }

  // ── Retry automático (429) ─────────────────────────────────────────────────
  function startRetry(msg: string, seconds = 30) {
    pendingMsg.current = msg;
    setRetryIn(seconds);
    retryTimerRef.current = setInterval(() => {
      setRetryIn(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(retryTimerRef.current!);
          retryTimerRef.current = null;
          applyResult(null);
          sendMessage(msg);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // ── Summarizer pra o histórico enviado ao Gemini ─────────────────────────
  // Resume com nomes legíveis (categoria, conta/cartão). Prefixa com o intent
  // para que ambos lados leiam o tipo da última troca via extractIntentFromAssistantContent.
  function summarizeAssistantResponse(data: AIResult): string {
    if (data.intent === "launch" || data.intent === "mixed") {
      const lines = data.transactions.map(t => {
        const cat = state.categories.find(c => c.id === t.categoryId);
        const catLabel = cat?.name ?? "categoria não reconhecida";
        const amount = t.amount.toFixed(2).replace(".", ",");
        if (t.intent === "transaction") {
          const acc = state.accounts.find(a => a.id === t.accountId);
          const accLabel = acc?.name ?? "conta padrão";
          const dir = t.type === "income" ? "recebido" : "gasto";
          return `R$ ${amount} ${dir} em ${catLabel} (conta ${accLabel})`;
        }
        const card = state.cards.find(c => c.id === t.cardId);
        const cardLabel = card?.name ?? "cartão padrão";
        const parc = t.totalInstallments > 1 ? ` em ${t.totalInstallments}x` : "";
        return `R$ ${amount} em ${catLabel} (cartão ${cardLabel}${parc})`;
      }).join("; ");
      const prefix = data.intent === "mixed" ? "[mixed]" : "[launch]";
      if (data.intent === "mixed") {
        const answer = data.answer.slice(0, 120);
        return `${prefix} Identifiquei: ${lines}. Respondi: ${answer}`;
      }
      return `${prefix} Identifiquei: ${lines}`;
    }
    if (data.intent === "question") {
      return `[question] Respondi: ${data.answer.slice(0, 200)}`;
    }
    return "";
  }

  // ── Enviar ────────────────────────────────────────────────────────────────
  async function sendMessage(msg: string) {
    setLoading(true);
    applyResult(null);
    setRetryIn(null);

    // Obter ID token do usuário autenticado
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      applyResult({ intent: "error", code: "NOT_AUTHENTICATED", message: "Faça login para usar o assistente." });
      return;
    }

    let idToken: string;
    try {
      idToken = await user.getIdToken();
    } catch {
      setLoading(false);
      applyResult({ intent: "error", code: "TOKEN_FAILED", message: "Não consegui validar sua sessão. Tente recarregar." });
      return;
    }

    // Mesma heurística do servidor — cliente decide se vale anexar o contexto.
    // Usa o último turno do assistente pra detectar correções ("errado, foi 15").
    const lastAssistant = [...conversationHistory].reverse().find(t => t.role === "assistant");
    const previousIntent = lastAssistant
      ? extractIntentFromAssistantContent(lastAssistant.content)
      : null;
    const clientIntentHint = detectIntent(msg, previousIntent);
    const financialContext = clientIntentHint !== "launch"
      ? buildFinancialContext(state.accounts, state.transactions, state.categories, state.budgets)
      : undefined;

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          message: msg,
          categories: state.categories,
          accounts: state.accounts.filter(a => a.active),
          cards: state.cards,
          hints,
          conversationHistory,
          ...(financialContext ? { financialContext } : {}),
        }),
      });

      // 422 → modelo retornou texto não-JSON. Mostra mensagem amigável.
      if (res.status === 422) {
        setLoading(false);
        applyResult({
          intent: "error",
          code: "INVALID_RESPONSE",
          message: "Não entendi, tente novamente.",
        });
        return;
      }

      const data: AIResult = await res.json();

      if (data.intent === "error" && data.code === "HTTP_429") {
        setLoading(false);
        const secs = (data as AIError).retryAfterSec ?? 30;
        startRetry(msg, secs);
        return;
      }

      applyResult(data);

      // Empurra Q+A pro chat history (display) quando houver resposta textual.
      if (data.intent === "question" || data.intent === "mixed") {
        setChatHistory(prev => [...prev, { q: msg, a: data.answer ?? "" }].slice(-CHAT_HISTORY_MAX));
      }

      // Atualiza o histórico de conversa enviado ao Gemini (inclui launches).
      // Limitado a 2 turnos (4 mensagens). Erros e unknowns NÃO entram.
      if (data.intent === "launch" || data.intent === "question" || data.intent === "mixed") {
        const summary = summarizeAssistantResponse(data);
        if (summary) {
          const userTurn:      ConversationTurn = { role: "user",      content: msg };
          const assistantTurn: ConversationTurn = { role: "assistant", content: summary };
          setConversationHistory(prev =>
            [...prev, userTurn, assistantTurn].slice(-CONVERSATION_HISTORY_MAX),
          );
        }
      }

      setTimeout(() => {
        contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: "smooth" });
      }, 80);
    } catch {
      applyResult({ intent: "error", code: "NETWORK", message: "Sem conexão. Verifique sua internet." });
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    const msg = message.trim();
    if (!msg || loading || retryIn !== null) return;
    sendMessage(msg);
  }

  // ── Mutações de drafts ─────────────────────────────────────────────────────
  function updateTx(uid: string, patch: Partial<TxDraft>) {
    setDrafts(prev => prev.map(d =>
      d.uid === uid && d.intent === "transaction" ? { ...d, tx: { ...d.tx, ...patch } } : d
    ));
  }

  function updatePurchase(uid: string, patch: Partial<PurchaseDraft>) {
    setDrafts(prev => prev.map(d =>
      d.uid === uid && d.intent === "card_purchase" ? { ...d, purchase: { ...d.purchase, ...patch } } : d
    ));
  }

  function removeDraft(uid: string) {
    setDrafts(prev => {
      const next = prev.filter(d => d.uid !== uid);
      if (next.length === 0) setResult(null); // drafts já vazio aqui, evita loop
      return next;
    });
  }

  // ── Confirmar tudo ─────────────────────────────────────────────────────────
  function handleConfirm() {
    if (drafts.length === 0) return;

    // Validação: todos devem ter categoria e valor > 0
    for (const d of drafts) {
      if (d.intent === "transaction") {
        if (!d.tx.categoryId) return;
        const n = parseFloat(d.tx.amount.replace(",", "."));
        if (!n || n <= 0) return;
      } else {
        if (!d.purchase.categoryId) return;
        const n = parseFloat(d.purchase.amount.replace(",", "."));
        if (!n || n <= 0) return;
      }
    }

    let saved = 0;
    for (const d of drafts) {
      if (d.intent === "transaction") {
        const amount = parseFloat(d.tx.amount.replace(",", "."));
        const tx: Transaction = {
          id: newId(),
          accountId: d.tx.accountId,
          type: d.type,
          amount,
          description: d.tx.description.trim() || "Lançamento IA",
          categoryId: d.tx.categoryId,
          competenceDate: d.tx.paymentDate,
          paymentDate: d.tx.paymentDate,
          status: d.tx.status,
          isRecurring: false,
          origin: "manual",
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: "ADD_TX", payload: tx });
        saved++;
      } else {
        const card = state.cards.find(c => c.id === d.purchase.cardId);
        if (!card) continue;
        const amount = parseFloat(d.purchase.amount.replace(",", "."));
        const totalInstallments = Math.max(1, parseInt(d.purchase.totalInstallments) || 1);
        const purchase: CardPurchase = {
          id: newId(),
          cardId: d.purchase.cardId,
          amount,
          description: d.purchase.description.trim() || "Compra IA",
          categoryId: d.purchase.categoryId,
          purchaseDate: d.purchase.purchaseDate,
          totalInstallments,
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: "ADD_PURCHASE", payload: { purchase, card } });
        saved++;
      }
    }

    // Memoriza a associação description→cat/account|card pra próximas inferências.
    // Fire-and-forget — não bloqueia o flash de sucesso se Firestore demorar.
    persistHints(drafts);

    setFlashCount(saved);
    setFlash(true);
    applyResult(null);
    setMessage("");
    setTimeout(() => {
      setFlash(false);
      router.back();
    }, 1400);
  }

  function handleChip(text: string) {
    setMessage(text);
    applyResult(null);
    setTimeout(() => {
      inputRef.current?.focus();
      const len = text.length;
      inputRef.current?.setSelectionRange(len, len);
    }, 40);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const hasCards   = (result?.intent === "launch" || result?.intent === "mixed") && drafts.length > 0;
  const hasError   = result?.intent === "error" || result?.intent === "unknown";
  const isBusy     = loading || retryIn !== null;
  const truncated  = (result?.intent === "launch" || result?.intent === "mixed") && result.truncated === true;

  // Pode confirmar? Todos os drafts têm categoria e valor válido.
  const canConfirm = drafts.length > 0 && drafts.every(d => {
    if (d.intent === "transaction") {
      const n = parseFloat(d.tx.amount.replace(",", "."));
      return Boolean(d.tx.categoryId) && n > 0;
    }
    const n = parseFloat(d.purchase.amount.replace(",", "."));
    return Boolean(d.purchase.categoryId) && n > 0;
  });

  return (
    <>
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--bg)", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: "4px",
        padding: "0 16px 0 4px", height: "60px", flexShrink: 0,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: "none", border: "none", color: "var(--text-2)",
            cursor: "pointer", fontSize: "24px",
            width: "48px", height: "48px", borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
        >‹</button>

        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "10px",
            background: "var(--accent-10)", border: "1px solid var(--border-accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--accent)", flexShrink: 0,
          }}>
            <SparkleIcon size={15} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)", lineHeight: 1.2 }}>
              Copiloto Financeiro
            </p>
            <p style={{ fontSize: "10.5px", color: "var(--accent)", fontWeight: 600 }}>
              ✦ Powered by Gemini
            </p>
          </div>
        </div>
      </div>

      {/* ── Conteúdo principal ────────────────────────────────────────────── */}
      <div ref={contentRef} style={{ padding: "20px 16px 130px" }}>

        {/* Flash de sucesso */}
        {flash && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "40px 0", animation: "fadeIn 0.25s ease",
          }}>
            <div style={{
              width: "64px", height: "64px", borderRadius: "50%",
              background: "var(--green-10)", border: "2px solid var(--green-20)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "28px", marginBottom: "14px",
            }}>✓</div>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--green)" }}>
              {flashCount > 1 ? `${flashCount} lançamentos com sucesso!` : "Lançado com sucesso!"}
            </p>
            <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>Voltando...</p>
          </div>
        )}

        {/* Histórico de conversa (display local, não enviado ao Gemini) */}
        {chatHistory.length > 0 && !flash && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
            {chatHistory.map((turn, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {/* Bolha do usuário (alinhada à direita) */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{
                    maxWidth: "82%",
                    padding: "9px 13px",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    borderRadius: "14px 14px 4px 14px",
                    fontSize: "13px", color: "var(--text-1)", lineHeight: 1.5,
                    wordBreak: "break-word",
                  }}>
                    {turn.q}
                  </div>
                </div>
                {/* Bolha do assistente (alinhada à esquerda) */}
                {turn.a && (
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <div style={{
                      width: "28px", height: "28px", borderRadius: "9px", flexShrink: 0,
                      background: "var(--accent-10)", border: "1px solid var(--border-accent)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "var(--accent)", marginTop: "2px",
                    }}>
                      <SparkleIcon size={12} />
                    </div>
                    <div style={{
                      flex: 1, minWidth: 0,
                      padding: "10px 14px",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px 14px 14px 14px",
                      fontSize: "13px", color: "var(--text-2)",
                      wordBreak: "break-word",
                    }}>
                      <Markdown text={turn.a} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Estado inicial — só quando não há resultado nem histórico */}
        {!loading && !result && !flash && chatHistory.length === 0 && (
          <>
            <p style={{ fontSize: "13px", color: "var(--text-3)", marginBottom: "14px", lineHeight: 1.6 }}>
              Diga o que aconteceu financeiramente que eu lanço, ou me pergunte sobre as suas finanças. Posso fazer as duas coisas na mesma mensagem.
            </p>
            <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>
              Sugestões rápidas
            </p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
              {QUICK_CHIPS.map(chip => (
                <button
                  key={chip.label}
                  onClick={() => handleChip(chip.text)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    padding: "9px 14px",
                    background: "var(--bg-card)", border: "1px solid var(--border)",
                    borderRadius: "20px", fontSize: "13px", fontWeight: 600,
                    color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit",
                    touchAction: "manipulation",
                  }}
                >
                  <chip.Icon size={14} strokeWidth={1.5} />
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
            <div style={{ padding: "14px 16px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", marginBottom: "8px", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Exemplos
              </p>
              {[
                "gastei 50 no iFood hoje",
                "100 de gasolina e paguei netflix 39,90",
                "comprei tênis 400 em 4x no cartão",
                "quanto gastei esse mês?",
                "falta quanto pro orçamento de alimentação?",
              ].map(ex => (
                <button
                  key={ex}
                  onClick={() => handleChip(ex)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "8px 0", background: "none", border: "none",
                    borderBottom: "1px solid var(--border)",
                    color: "var(--accent)", fontSize: "13px",
                    cursor: "pointer", fontFamily: "inherit", touchAction: "manipulation",
                  }}
                >
                  &quot;{ex}&quot;
                </button>
              ))}
            </div>
          </>
        )}

        {/* Retry countdown (429) */}
        {retryIn !== null && !loading && (
          <div style={{
            display: "flex", alignItems: "center", gap: "14px",
            padding: "20px 18px",
            background: "rgba(245,158,11,0.06)", border: "1px solid var(--amber-20)",
            borderRadius: "14px", animation: "fadeIn 0.2s ease",
          }}>
            <div style={{
              width: "44px", height: "44px", borderRadius: "50%",
              background: "rgba(245,158,11,0.12)", border: "2px solid var(--amber-20)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "18px", fontWeight: 700, color: "var(--amber)", flexShrink: 0,
            }}>
              {retryIn}
            </div>
            <div>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--amber)" }}>Limite da API atingido</p>
              <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px", lineHeight: 1.4 }}>
                Reenviando automaticamente em {retryIn}s
              </p>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{
            display: "flex", alignItems: "center", gap: "14px",
            padding: "24px 0", animation: "fadeIn 0.2s ease",
          }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "12px",
              background: "var(--accent-10)", border: "1px solid var(--border-accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--accent)", flexShrink: 0,
              animation: "aiPulse 1.2s ease-in-out infinite",
            }}>
              <SparkleIcon size={18} />
            </div>
            <div>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-1)" }}>Interpretando...</p>
              <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "3px" }}>Analisando com Gemini IA</p>
            </div>
          </div>
        )}

        {/* Erro */}
        {hasError && result && !flash && (
          <div style={{
            padding: "16px", background: "var(--red-10)", border: "1px solid var(--red-20)",
            borderRadius: "14px", animation: "fadeIn 0.2s ease",
          }}>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--red)", marginBottom: "6px" }}>
              {result.intent === "error" ? `Erro · ${result.code}` : "Não entendi"}
            </p>
            <p style={{ fontSize: "12.5px", color: "var(--red)", opacity: 0.85, lineHeight: 1.5 }}>
              {result.message}
            </p>
            <button
              onClick={() => { applyResult(null); inputRef.current?.focus(); }}
              style={{
                marginTop: "12px", padding: "8px 14px",
                background: "var(--red-10)", border: "1px solid var(--red-20)",
                borderRadius: "8px", color: "var(--red)",
                fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* ── Preview multi-card (launch ou mixed) ─────────────────────────── */}
        {hasCards && !flash && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", animation: "fadeIn 0.25s ease" }}>
            {/* Banner de truncamento */}
            {truncated && (
              <div style={{
                padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px",
                background: "var(--amber-10)", border: "1px solid var(--amber-20)",
                borderRadius: "12px",
              }}>
                <AlertTriangle size={16} strokeWidth={1.5} color="var(--amber)" />
                <p style={{ fontSize: "12px", color: "var(--amber)", fontWeight: 600, lineHeight: 1.4 }}>
                  Limite de 5 transações por mensagem. As primeiras 5 foram processadas.
                </p>
              </div>
            )}

            {/* Banner de auto-confirm (ativo durante a contagem regressiva) */}
            {autoConfirmIn !== null && (
              <button
                onClick={stopAutoConfirm}
                aria-label="Cancelar lançamento automático"
                style={{
                  padding: "12px 14px",
                  background: "var(--accent-10)",
                  border: "1px solid var(--border-accent)",
                  borderRadius: "14px",
                  display: "flex", alignItems: "center", gap: "12px",
                  cursor: "pointer", textAlign: "left",
                  fontFamily: "inherit", width: "100%",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div style={{
                  width: "40px", height: "40px", borderRadius: "50%",
                  background: "var(--accent-10)", border: "2px solid var(--border-accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "16px", fontWeight: 700, color: "var(--accent)", flexShrink: 0,
                }}>
                  {autoConfirmIn}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--accent)" }}>
                    Lançando automaticamente
                  </p>
                  <p style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "2px", lineHeight: 1.4 }}>
                    Toque para desfazer e revisar
                  </p>
                </div>
                <Undo2 size={18} strokeWidth={1.5} color="var(--accent)" />
              </button>
            )}

            {/* Cabeçalho contagem (oculto durante auto-confirm) */}
            {autoConfirmIn === null && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 4px" }}>
                <SparkleIcon size={12} />
                <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {drafts.length === 1 ? "1 lançamento detectado" : `${drafts.length} lançamentos detectados`} — edite ou remova individualmente
                </p>
              </div>
            )}

            <div style={{
              display: "flex", flexDirection: "column", gap: "14px",
              opacity: autoConfirmIn !== null ? 0.7 : 1,
              transition: "opacity 0.2s",
            }}>
              {drafts.map(draft => (
                <DraftCard
                  key={draft.uid}
                  draft={draft}
                  categories={state.categories}
                  accounts={state.accounts.filter(a => a.active)}
                  cards={state.cards}
                  readOnly={autoConfirmIn !== null}
                  onUpdateTx={patch => updateTx(draft.uid, patch)}
                  onUpdatePurchase={patch => updatePurchase(draft.uid, patch)}
                  onRemove={() => removeDraft(draft.uid)}
                />
              ))}
            </div>

            {/* Botões manuais (escondidos durante auto-confirm) */}
            {autoConfirmIn === null && (
              <div style={{ display: "flex", gap: "8px", paddingTop: "2px" }}>
                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  style={{
                    flex: 1, padding: "14px",
                    background: canConfirm ? "var(--accent)" : "var(--bg-input)",
                    border: canConfirm ? "none" : "1px solid var(--border)",
                    borderRadius: "12px",
                    color: canConfirm ? "#06100E" : "var(--text-3)",
                    fontSize: "14px", fontWeight: 700,
                    cursor: canConfirm ? "pointer" : "not-allowed",
                    fontFamily: "inherit", touchAction: "manipulation",
                  }}
                >
                  {drafts.length === 1 ? "✓ Confirmar" : `✓ Confirmar ${drafts.length}`}
                </button>
                <button
                  onClick={() => { applyResult(null); setMessage(""); inputRef.current?.focus(); }}
                  style={{
                    flex: 1, padding: "14px", background: "var(--bg-input)", border: "1px solid var(--border)",
                    borderRadius: "12px", color: "var(--text-2)", fontSize: "14px", fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit", touchAction: "manipulation",
                  }}
                >
                  Descartar tudo
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Input fixo no fundo ────────────────────────────────────────────── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
        background: "var(--bg)", borderTop: "1px solid var(--border)",
        padding: "10px 12px",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
        display: "flex", alignItems: "flex-end", gap: "8px",
      }}>
        <textarea
          ref={inputRef}
          value={message}
          onChange={e => {
            setMessage(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px";
          }}
          onPaste={() => {
            setTimeout(() => {
              if (!inputRef.current) return;
              const val = inputRef.current.value;
              setMessage(val);
              inputRef.current.style.height = "auto";
              inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 96) + "px";
            }, 0);
          }}
          onKeyDown={handleKey}
          placeholder="Ex: gastei 50 no iFood e 30 de uber…"
          disabled={isBusy || flash}
          rows={1}
          style={{
            flex: 1, background: "var(--bg-input)", border: "1px solid var(--border)",
            borderRadius: "14px", padding: "11px 14px", fontSize: "14px",
            color: "var(--text-1)", fontFamily: "inherit", resize: "none", outline: "none",
            lineHeight: 1.4, minHeight: "44px", maxHeight: "96px", overflowY: "auto",
            transition: "border-color 0.2s", WebkitTapHighlightColor: "transparent",
            opacity: isBusy ? 0.5 : 1,
          }}
          onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = "var(--accent)"; }}
          onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = "var(--border)"; }}
        />
        <button
          onClick={handleSend}
          disabled={!message.trim() || isBusy || flash}
          style={{
            width: "44px", height: "44px", flexShrink: 0, borderRadius: "13px",
            background: message.trim() && !isBusy ? "var(--accent)" : "var(--bg-input)",
            border: `1px solid ${message.trim() && !isBusy ? "transparent" : "var(--border)"}`,
            color: message.trim() && !isBusy ? "#06100E" : "var(--text-3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: message.trim() && !isBusy ? "pointer" : "default",
            transition: "all 0.18s", touchAction: "manipulation",
            fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
          }}
        >
          {loading ? (
            <div style={{
              width: "15px", height: "15px", border: "2px solid var(--accent)",
              borderTopColor: "transparent", borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }} />
          ) : (
            <SendIcon />
          )}
        </button>
      </div>
    </>
  );
}

// ─── Subcomponente: card individual de draft ─────────────────────────────────

type DraftCardProps = {
  draft: DraftItem;
  categories: { id: string; name: string; type: "income" | "expense"; color: string; icon: string }[];
  accounts: { id: string; name: string; icon: string; active: boolean }[];
  cards: { id: string; name: string; brand: string }[];
  readOnly?: boolean;   // true durante o countdown de auto-confirm — inputs travados
  onUpdateTx: (patch: Partial<TxDraft>) => void;
  onUpdatePurchase: (patch: Partial<PurchaseDraft>) => void;
  onRemove: () => void;
};

function DraftCard({ draft, categories, accounts, cards, readOnly = false, onUpdateTx, onUpdatePurchase, onRemove }: DraftCardProps) {
  const isTx       = draft.intent === "transaction";
  const categoryId = isTx ? draft.tx.categoryId : draft.purchase.categoryId;
  const editCat    = categories.find(c => c.id === categoryId);
  const unknownCat = !categoryId;

  return (
    <div style={{
      background: "var(--bg-card)",
      border: `1px solid ${unknownCat ? "var(--amber-20)" : "var(--border-accent)"}`,
      borderRadius: "16px", overflow: "hidden",
    }}>
      <div style={{
        padding: "7px 10px 7px 14px",
        background: unknownCat ? "var(--amber-10)" : "var(--accent-10)",
        borderBottom: `1px solid ${unknownCat ? "var(--amber-20)" : "var(--border-accent)"}`,
        display: "flex", alignItems: "center", gap: "6px",
      }}>
        {unknownCat
          ? <AlertTriangle size={11} strokeWidth={1.5} color="var(--amber)" />
          : <SparkleIcon size={11} />}
        <span style={{
          flex: 1,
          fontSize: "10px", fontWeight: 700,
          color: unknownCat ? "var(--amber)" : "var(--accent)",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {unknownCat ? "Categoria não reconhecida, selecione" : (isTx ? "Lançamento" : "Compra no cartão")}
        </span>
        {!readOnly && (
          <button
            onClick={onRemove}
            aria-label="Remover este lançamento"
            style={{
              width: "26px", height: "26px", borderRadius: "8px",
              background: "transparent", border: "none", color: "var(--text-3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", touchAction: "manipulation",
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      <fieldset
        disabled={readOnly}
        style={{
          padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px",
          border: "none", margin: 0, minWidth: 0,
        }}
      >
        {draft.intent === "transaction" ? (() => {
          const tx = draft.tx;
          const txCategories = categories.filter(c => c.type === draft.type);
          const parsedAmount = parseFloat(tx.amount.replace(",", "."));
          const isIncome = draft.type === "income";
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "44px", height: "44px", borderRadius: "13px", flexShrink: 0,
                  background: editCat ? `${editCat.color}18` : "var(--bg-input)",
                  border: `1px solid ${editCat ? editCat.color + "28" : "var(--border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {editCat?.icon
                    ? <CategoryIcon icon={editCat.icon} color={editCat.color} size={20} />
                    : <Package size={20} strokeWidth={1.5} color="var(--text-3)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 600 }}>
                    {isIncome ? "↑ Receita" : "↓ Despesa"} · {editCat?.name ?? "—"}
                  </p>
                </div>
                <p className="mono" style={{ fontSize: "20px", fontWeight: 700, flexShrink: 0, color: isIncome ? "var(--green)" : "var(--text-1)" }}>
                  {isIncome ? "+" : "−"}R$ {isNaN(parsedAmount) ? "—" : fmt(parsedAmount)}
                </p>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Descrição</label>
                <input className="form-input" type="text" value={tx.description}
                  onChange={e => onUpdateTx({ description: e.target.value })}
                  autoComplete="off" autoCorrect="off" />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Valor (R$)</label>
                <input className="form-input mono" type="text" inputMode="decimal" value={tx.amount}
                  onChange={e => onUpdateTx({ amount: e.target.value.replace(/[^0-9.,]/g, "") })}
                  style={{ fontSize: "20px" }} autoComplete="off" />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Categoria</label>
                <select
                  className="form-input"
                  value={tx.categoryId}
                  onChange={e => onUpdateTx({ categoryId: e.target.value })}
                  style={unknownCat ? { borderColor: "var(--amber-20)" } : undefined}
                >
                  <option value="">Selecione uma categoria</option>
                  {txCategories.map(c => <option key={c.id} value={c.id}>{iconLabel(c.icon, c.name)}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Conta</label>
                <select className="form-input" value={tx.accountId}
                  onChange={e => onUpdateTx({ accountId: e.target.value })}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Data</label>
                <input className="form-input" type="date" value={tx.paymentDate}
                  onChange={e => onUpdateTx({ paymentDate: e.target.value })} />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Status</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[
                    { key: "paid"    as const, label: "✓ Pago",  bg: "var(--green-10)", border: "var(--green-20)", color: "var(--green)" },
                    { key: "pending" as const, label: "A pagar", bg: "var(--amber-10)", border: "var(--amber-20)", color: "var(--amber)" },
                  ].map(opt => (
                    <button key={opt.key}
                      onClick={() => onUpdateTx({ status: opt.key })}
                      style={{
                        flex: 1, padding: "10px", borderRadius: "10px",
                        background: tx.status === opt.key ? opt.bg : "var(--bg-input)",
                        border: `1px solid ${tx.status === opt.key ? opt.border : "var(--border)"}`,
                        color: tx.status === opt.key ? opt.color : "var(--text-3)",
                        fontWeight: 700, fontSize: "13px", cursor: "pointer",
                        fontFamily: "inherit", minHeight: "44px",
                        touchAction: "manipulation", transition: "all 0.15s",
                      }}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
            </>
          );
        })() : (() => {
          const purchase = draft.purchase;
          const expenseCategories = categories.filter(c => c.type === "expense");
          const parsedAmount = parseFloat(purchase.amount.replace(",", "."));
          const parsedInstallments = Math.max(1, parseInt(purchase.totalInstallments) || 1);
          const installmentValue = !isNaN(parsedAmount) && parsedInstallments > 1 ? parsedAmount / parsedInstallments : null;
          const editCard = cards.find(c => c.id === purchase.cardId);
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "44px", height: "44px", borderRadius: "13px", flexShrink: 0,
                  background: editCat ? `${editCat.color}18` : "var(--bg-input)",
                  border: `1px solid ${editCat ? editCat.color + "28" : "var(--border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {editCat?.icon
                    ? <CategoryIcon icon={editCat.icon} color={editCat.color} size={20} />
                    : <Package size={20} strokeWidth={1.5} color="var(--text-3)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 600 }}>
                    {editCard?.name ?? "Cartão"} · {editCat?.name ?? "—"}
                  </p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p className="mono" style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-1)" }}>
                    −R$ {isNaN(parsedAmount) ? "—" : fmt(parsedAmount)}
                  </p>
                  {installmentValue && (
                    <p className="mono" style={{ fontSize: "12px", color: "var(--accent)", fontWeight: 700, marginTop: "2px" }}>
                      {parsedInstallments}x R$ {fmt(installmentValue)}
                    </p>
                  )}
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Descrição</label>
                <input className="form-input" type="text" value={purchase.description}
                  onChange={e => onUpdatePurchase({ description: e.target.value })}
                  autoComplete="off" autoCorrect="off" />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Valor total (R$)</label>
                <input className="form-input mono" type="text" inputMode="decimal" value={purchase.amount}
                  onChange={e => onUpdatePurchase({ amount: e.target.value.replace(/[^0-9.,]/g, "") })}
                  style={{ fontSize: "20px" }} autoComplete="off" />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Parcelas</label>
                <input className="form-input mono" type="text" inputMode="numeric" value={purchase.totalInstallments}
                  onChange={e => onUpdatePurchase({ totalInstallments: e.target.value.replace(/[^0-9]/g, "") })}
                  autoComplete="off" />
                {installmentValue && (
                  <p style={{ fontSize: "12px", color: "var(--accent)", fontWeight: 600, marginTop: "6px" }}>
                    → {parsedInstallments}x de R$ {fmt(installmentValue)}
                  </p>
                )}
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Categoria</label>
                <select
                  className="form-input"
                  value={purchase.categoryId}
                  onChange={e => onUpdatePurchase({ categoryId: e.target.value })}
                  style={unknownCat ? { borderColor: "var(--amber-20)" } : undefined}
                >
                  <option value="">Selecione uma categoria</option>
                  {expenseCategories.map(c => <option key={c.id} value={c.id}>{iconLabel(c.icon, c.name)}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Cartão</label>
                <select className="form-input" value={purchase.cardId}
                  onChange={e => onUpdatePurchase({ cardId: e.target.value })}>
                  {cards.map(c => <option key={c.id} value={c.id}>{c.name} ({c.brand})</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Data da compra</label>
                <input className="form-input" type="date" value={purchase.purchaseDate}
                  onChange={e => onUpdatePurchase({ purchaseDate: e.target.value })} />
              </div>
            </>
          );
        })()}
      </fieldset>
    </div>
  );
}
