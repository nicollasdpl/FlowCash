"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp, newId } from "@/context/AppContext";
import type { CardPurchase, Transaction } from "@/context/AppContext";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, increment } from "firebase/firestore";
import { buildFinancialContext } from "@/lib/ai/buildFinancialContext";
import { detectIntent, extractIntentFromAssistantContent, isLocalAnswerCandidate } from "@/lib/intentDetection";
import { tryLocalAnswer } from "@/lib/ai/localAnswers";
import type {
  AIActionItem,
  AIItem,
  AIResult,
  ChatTurn,
  ConversationTurn,
  Hints,
} from "@/lib/ai/types";
import { itemToDraft, type DraftItem, type PurchaseDraft, type TxDraft } from "./AIDraftPreview";

const CHAT_HISTORY_MAX = 5;
const CONVERSATION_HISTORY_MAX = 4;

type CopilotOptions = {
  contextCardId?: string | null;
};

function coerceItemsForCardContext(items: AIItem[], contextCardId: string): AIItem[] {
  return items.map(item => {
    if (item.intent === "transaction" && item.type === "expense") {
      return {
        intent: "card_purchase" as const,
        amount: item.amount,
        description: item.description,
        categoryId: item.categoryId,
        cardId: contextCardId,
        purchaseDate: item.paymentDate,
        totalInstallments: 1,
        confidence: item.confidence,
      };
    }
    if (item.intent === "card_purchase") {
      return { ...item, cardId: contextCardId };
    }
    return item;
  });
}

function normalizeHintKey(description: string): string {
  return description.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}

export function useCopilot(initialMessage = "", options: CopilotOptions = {}) {
  const { state, dispatch } = useApp();
  const contextCardId = options.contextCardId ?? null;

  const [message, setMessage] = useState(initialMessage);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [pendingActions, setPendingActions] = useState<AIActionItem[]>([]);
  const [flash, setFlash] = useState(false);
  const [flashCount, setFlashCount] = useState(0);
  const [flashMessage, setFlashMessage] = useState("");
  const [retryIn, setRetryIn] = useState<number | null>(null);
  const [retryReason, setRetryReason] = useState("");
  const [hints, setHints] = useState<Hints>({});
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);

  const contentRef = useRef<HTMLDivElement>(null);
  const pendingMsg = useRef("");
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const buildContext = useCallback(
    () =>
      buildFinancialContext({
        accounts: state.accounts,
        transactions: state.transactions,
        categories: state.categories,
        budgets: state.budgets,
        cards: state.cards,
        installments: state.installments,
        purchases: state.purchases,
        goals: state.goals,
      }),
    [state],
  );

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) {
        setHints({});
        return;
      }
      try {
        const ref = doc(db, "users", user.uid, "app", "aiMemory");
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

  function applyResult(next: AIResult | null) {
    setResult(next);
    setPendingActions(next?.intent === "action" ? next.actions : []);

    if (next?.intent === "launch" || next?.intent === "mixed") {
      let items = next.transactions;
      if (contextCardId && state.cards.some(c => c.id === contextCardId)) {
        items = coerceItemsForCardContext(items, contextCardId);
      }
      setDrafts(items.map(t => itemToDraft(t, newId)));
    } else {
      setDrafts([]);
    }
  }

  function discardPending() {
    setChatHistory(prev => {
      const last = prev[prev.length - 1];
      if (last?.kind === "message" && !last.a) return prev.slice(0, -1);
      return prev;
    });
    applyResult(null);
  }

  async function persistHints(items: DraftItem[]) {
    const user = auth.currentUser;
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];

    type Bucket = { categoryId: string; accountId?: string; cardId?: string; count: number };
    const buckets: Record<string, Bucket> = {};

    for (const d of items) {
      const description = d.intent === "transaction" ? d.tx.description : d.purchase.description;
      const categoryId = d.intent === "transaction" ? d.tx.categoryId : d.purchase.categoryId;
      const destination = d.intent === "transaction" ? d.tx.accountId : d.purchase.cardId;
      const isCard = d.intent === "card_purchase";
      const key = normalizeHintKey(description);
      if (!key || !categoryId || !destination) continue;
      const b = buckets[key] ?? { categoryId, count: 0 };
      b.categoryId = categoryId;
      if (isCard) b.cardId = destination;
      else b.accountId = destination;
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
      if (b.cardId) entry.cardId = b.cardId;
      hintsPayload[key] = entry;
    }

    try {
      const ref = doc(db, "users", user.uid, "app", "aiMemory");
      await setDoc(ref, { hints: hintsPayload }, { merge: true });
      setHints(prev => {
        const updated = { ...prev };
        for (const [key, b] of Object.entries(buckets)) {
          const existing = updated[key];
          updated[key] = {
            categoryId: b.categoryId,
            accountId: b.accountId ?? existing?.accountId,
            cardId: b.cardId ?? existing?.cardId,
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

  function summarizeLaunch(items: AIItem[]): string {
    return items
      .map(t => {
        const cat = state.categories.find(c => c.id === t.categoryId);
        const amount = t.amount.toFixed(2).replace(".", ",");
        return `R$ ${amount} ${t.description || cat?.name || "lançamento"}`;
      })
      .join(" · ");
  }

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
        return `${prefix} Identifiquei: ${lines}. Respondi: ${data.answer.slice(0, 120)}`;
      }
      return `${prefix} Identifiquei: ${lines}`;
    }
    if (data.intent === "question") {
      return `[question] Respondi: ${data.answer.slice(0, 200)}`;
    }
    if (data.intent === "action") {
      return `[action] ${data.actions.map(a => `${a.action}:${a.targetDescription}`).join("; ")}`;
    }
    return "";
  }

  function pushHistory(msg: string, data: AIResult) {
    if (data.intent === "question" || data.intent === "mixed") {
      setChatHistory(prev =>
        [...prev, { kind: "message" as const, q: msg, a: data.answer ?? "" }].slice(-CHAT_HISTORY_MAX),
      );
    } else if (data.intent === "launch" || data.intent === "action") {
      // Mostra a mensagem do usuário enquanto o preview de confirmação aparece
      setChatHistory(prev =>
        [...prev, { kind: "message" as const, q: msg, a: "" }].slice(-CHAT_HISTORY_MAX),
      );
    }

    if (data.intent === "launch" || data.intent === "question" || data.intent === "mixed" || data.intent === "action") {
      const summary = summarizeAssistantResponse(data);
      if (summary) {
        setConversationHistory(prev =>
          [...prev, { role: "user" as const, content: msg }, { role: "assistant" as const, content: summary }].slice(
            -CONVERSATION_HISTORY_MAX,
          ),
        );
      }
    }
  }

  function startRetry(msg: string, seconds = 30) {
    pendingMsg.current = msg;
    setRetryIn(seconds);
    retryTimerRef.current = setInterval(() => {
      setRetryIn(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(retryTimerRef.current!);
          retryTimerRef.current = null;
          applyResult(null);
          void sendMessage(msg);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  const handleConfirmDrafts = useCallback(() => {
    if (drafts.length === 0) return;

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
    const savedItems: AIItem[] = [];

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
        savedItems.push({
          intent: "transaction",
          type: d.type,
          amount,
          description: tx.description,
          categoryId: d.tx.categoryId,
          accountId: d.tx.accountId,
          competenceDate: d.tx.paymentDate,
          paymentDate: d.tx.paymentDate,
          status: d.tx.status,
          confidence: "high",
        });
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
        savedItems.push({
          intent: "card_purchase",
          amount,
          description: purchase.description,
          categoryId: d.purchase.categoryId,
          cardId: d.purchase.cardId,
          purchaseDate: d.purchase.purchaseDate,
          totalInstallments,
          confidence: "high",
        });
        saved++;
      }
    }

    void persistHints(drafts);

    const lastQ = conversationHistory.filter(t => t.role === "user").slice(-1)[0]?.content ?? message;
    setChatHistory(prev => {
      const last = prev[prev.length - 1];
      const withoutPending =
        last?.kind === "message" && last.q === lastQ && !last.a ? prev.slice(0, -1) : prev;
      return [...withoutPending, { kind: "launch" as const, q: lastQ, summary: summarizeLaunch(savedItems) }].slice(
        -CHAT_HISTORY_MAX,
      );
    });

    setFlashCount(saved);
    setFlashMessage(saved > 1 ? `${saved} lançamentos com sucesso!` : "Lançado com sucesso!");
    setFlash(true);
    applyResult(null);
    setMessage("");
    setTimeout(() => {
      setFlash(false);
      contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: "smooth" });
    }, 1200);
  }, [drafts, dispatch, state.cards, conversationHistory, message]);

  const handleConfirmActions = useCallback(() => {
    if (pendingActions.length === 0) return;

    for (const action of pendingActions) {
      if (action.action === "delete_tx") {
        dispatch({ type: "DEL_TX", payload: action.targetId });
      } else if (action.action === "delete_purchase") {
        dispatch({ type: "DEL_PURCHASE", payload: action.targetId });
      } else if (action.action === "update_tx") {
        const existing = state.transactions.find(t => t.id === action.targetId);
        if (!existing || !action.patch) continue;
        const updated: Transaction = {
          ...existing,
          ...(action.patch.amount !== undefined ? { amount: action.patch.amount } : {}),
          ...(action.patch.description !== undefined ? { description: action.patch.description } : {}),
          ...(action.patch.categoryId !== undefined ? { categoryId: action.patch.categoryId } : {}),
          ...(action.patch.accountId !== undefined ? { accountId: action.patch.accountId } : {}),
          ...(action.patch.paymentDate !== undefined
            ? { paymentDate: action.patch.paymentDate, competenceDate: action.patch.paymentDate }
            : {}),
          ...(action.patch.status !== undefined ? { status: action.patch.status } : {}),
        };
        dispatch({ type: "UPD_TX", payload: updated });
      }
    }

    setFlashCount(pendingActions.length);
    setFlashMessage("Ação concluída!");
    setFlash(true);

    const lastQ = conversationHistory.filter(t => t.role === "user").slice(-1)[0]?.content ?? message;
    setChatHistory(prev => {
      const last = prev[prev.length - 1];
      const withoutPending =
        last?.kind === "message" && last.q === lastQ && !last.a ? prev.slice(0, -1) : prev;
      return [
        ...withoutPending,
        { kind: "launch" as const, q: lastQ, summary: "Ação concluída" },
      ].slice(-CHAT_HISTORY_MAX);
    });

    applyResult(null);
    setMessage("");
    setTimeout(() => {
      setFlash(false);
      contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: "smooth" });
    }, 1200);
  }, [pendingActions, dispatch, state.transactions, conversationHistory, message]);

  const sendMessage = useCallback(
    async (msg: string) => {
      setLoading(true);
      setChatHistory(prev => {
        const last = prev[prev.length - 1];
        if (last?.kind === "message" && !last.a) return prev.slice(0, -1);
        return prev;
      });
      applyResult(null);
      setRetryIn(null);

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

      const lastAssistant = [...conversationHistory].reverse().find(t => t.role === "assistant");
      const previousIntent = lastAssistant ? extractIntentFromAssistantContent(lastAssistant.content) : null;
      const clientIntentHint = detectIntent(msg, previousIntent);
      const financialContext = buildContext();

      if (clientIntentHint === "question" && isLocalAnswerCandidate(msg)) {
        const local = tryLocalAnswer(msg, financialContext);
        if (local) {
          const data: AIResult = { intent: "question", answer: local, local: true };
          applyResult(data);
          pushHistory(msg, data);
          setLoading(false);
          setTimeout(() => {
            contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: "smooth" });
          }, 80);
          return;
        }
      }

      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            message: msg,
            categories: state.categories.filter(c => !c.isSystem),
            accounts: state.accounts.filter(a => a.active),
            cards: state.cards,
            hints,
            conversationHistory,
            financialContext,
            ...(contextCardId ? { contextCardId } : {}),
          }),
        });

        if (res.status === 422) {
          setLoading(false);
          applyResult({ intent: "error", code: "INVALID_RESPONSE", message: "Não entendi, tente novamente." });
          return;
        }

        const data: AIResult = await res.json();

        // 429 (cota da IA esgotada): NÃO faz retry automático. Reenviar em loop
        // só queima mais cota e, se for o limite diário, nunca recupera (reseta
        // só no dia seguinte). Mostra erro claro e deixa o usuário decidir.
        if (data.intent === "error" && data.code === "HTTP_429") {
          setLoading(false);
          applyResult({
            intent: "error",
            code: "HTTP_429",
            message:
              typeof data.message === "string" && data.message
                ? data.message
                : "Limite da IA atingido. Tente novamente mais tarde.",
          });
          return;
        }

        // 503/timeout: sobrecarga temporária do modelo — aqui o retry automático
        // faz sentido, pois costuma se resolver em segundos.
        if (data.intent === "error" && (data.code === "HTTP_503" || data.code === "TIMEOUT")) {
          setLoading(false);
          setRetryReason(typeof data.message === "string" ? data.message : "");
          const secs = data.retryAfterSec ?? 15;
          startRetry(msg, secs);
          return;
        }

        applyResult(data);

        pushHistory(msg, data);

        setTimeout(() => {
          contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: "smooth" });
        }, 80);
      } catch {
        applyResult({ intent: "error", code: "NETWORK", message: "Sem conexão. Verifique sua internet." });
      } finally {
        setLoading(false);
      }
    },
    [buildContext, conversationHistory, contextCardId, hints, state.accounts, state.cards, state.categories],
  );

  function handleSend() {
    const msg = message.trim();
    if (!msg || loading || retryIn !== null) return;
    setMessage("");
    void sendMessage(msg);
  }

  function updateTx(uid: string, patch: Partial<TxDraft>) {
    setDrafts(prev =>
      prev.map(d => (d.uid === uid && d.intent === "transaction" ? { ...d, tx: { ...d.tx, ...patch } } : d)),
    );
  }

  function updatePurchase(uid: string, patch: Partial<PurchaseDraft>) {
    setDrafts(prev =>
      prev.map(d =>
        d.uid === uid && d.intent === "card_purchase" ? { ...d, purchase: { ...d.purchase, ...patch } } : d,
      ),
    );
  }

  function removeDraft(uid: string) {
    setDrafts(prev => {
      const next = prev.filter(d => d.uid !== uid);
      if (next.length === 0) setResult(null);
      return next;
    });
  }

  const canConfirm =
    drafts.length > 0 &&
    drafts.every(d => {
      if (d.intent === "transaction") {
        const n = parseFloat(d.tx.amount.replace(",", "."));
        return Boolean(d.tx.categoryId) && n > 0;
      }
      const n = parseFloat(d.purchase.amount.replace(",", "."));
      return Boolean(d.purchase.categoryId) && n > 0;
    });

  const isBusy = loading || retryIn !== null;
  const hasCards = (result?.intent === "launch" || result?.intent === "mixed") && drafts.length > 0;
  const hasActions = result?.intent === "action" && pendingActions.length > 0;
  const hasError = result?.intent === "error" || result?.intent === "unknown";
  const truncated = (result?.intent === "launch" || result?.intent === "mixed") && result.truncated === true;

  return {
    message,
    setMessage,
    loading,
    result,
    drafts,
    pendingActions,
    flash,
    flashCount,
    flashMessage,
    retryIn,
    retryReason,
    chatHistory,
    contentRef,
    isBusy,
    hasCards,
    hasActions,
    hasError,
    truncated,
    canConfirm,
    contextCardId,
    handleSend,
    handleConfirmDrafts,
    handleConfirmActions,
    updateTx,
    updatePurchase,
    removeDraft,
    applyResult,
    discardPending,
    sendMessage,
  };
}
