"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp, newId } from "@/context/AppContext";
import type { Transaction, CardPurchase } from "@/context/AppContext";
import { Utensils, Car, Wallet, CreditCard, Fuel, Home, Package } from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type AITransaction = {
  intent: "transaction";
  type: "income" | "expense";
  amount: number;
  description: string;
  categoryId: string;
  accountId: string;
  competenceDate: string;
  paymentDate: string;
  status: "paid" | "pending" | "overdue";
  confidence: number;
};

type AICardPurchase = {
  intent: "card_purchase";
  amount: number;
  description: string;
  categoryId: string;
  cardId: string;
  purchaseDate: string;
  totalInstallments: number;
  confidence: number;
};

type AIError   = { intent: "error"; code: string; message: string; retryAfterSec?: number };
type AIUnknown = { intent: "unknown"; message: string };
type AIResult  = AITransaction | AICardPurchase | AIError | AIUnknown;

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

// ─── Componente ───────────────────────────────────────────────────────────────

export default function AIPageContent() {
  const router = useRouter();
  const { state, dispatch } = useApp();

  const [message, setMessage]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<AIResult | null>(null);
  const [flash, setFlash]       = useState(false);
  const [retryIn, setRetryIn]   = useState<number | null>(null);

  const [txDraft, setTxDraft]             = useState<TxDraft | null>(null);
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseDraft | null>(null);

  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const contentRef     = useRef<HTMLDivElement>(null);
  const pendingMsg     = useRef<string>("");
  const retryTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (result?.intent === "transaction") {
      setTxDraft({
        amount: String(result.amount),
        description: result.description,
        categoryId: result.categoryId,
        accountId: result.accountId,
        paymentDate: result.paymentDate,
        status: result.status === "overdue" ? "pending" : result.status,
      });
      setPurchaseDraft(null);
    } else if (result?.intent === "card_purchase") {
      setPurchaseDraft({
        amount: String(result.amount),
        description: result.description,
        categoryId: result.categoryId,
        cardId: result.cardId,
        purchaseDate: result.purchaseDate,
        totalInstallments: String(result.totalInstallments),
      });
      setTxDraft(null);
    } else {
      setTxDraft(null);
      setPurchaseDraft(null);
    }
  }, [result]);

  // ── Retry automático (429) ─────────────────────────────────────────────────
  function startRetry(msg: string, seconds = 30) {
    pendingMsg.current = msg;
    setRetryIn(seconds);
    retryTimerRef.current = setInterval(() => {
      setRetryIn(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(retryTimerRef.current!);
          retryTimerRef.current = null;
          setResult(null);
          sendMessage(msg);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // ── Enviar ────────────────────────────────────────────────────────────────
  async function sendMessage(msg: string) {
    setLoading(true);
    setResult(null);
    setRetryIn(null);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          categories: state.categories,
          accounts: state.accounts.filter(a => a.active),
          cards: state.cards,
        }),
      });
      const data: AIResult = await res.json();

      if (data.intent === "error" && data.code === "HTTP_429") {
        setLoading(false);
        const secs = (data as AIError).retryAfterSec ?? 30;
        startRetry(msg, secs);
        return;
      }

      setResult(data);
      setTimeout(() => {
        contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: "smooth" });
      }, 80);
    } catch {
      setResult({ intent: "error", code: "NETWORK", message: "Sem conexão. Verifique sua internet." });
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    const msg = message.trim();
    if (!msg || loading || retryIn !== null) return;
    sendMessage(msg);
  }

  // ── Confirmar ─────────────────────────────────────────────────────────────
  function handleConfirm() {
    if (!result || result.intent === "unknown" || result.intent === "error") return;

    if (result.intent === "transaction" && txDraft) {
      const amount = parseFloat(txDraft.amount.replace(",", "."));
      if (!amount || amount <= 0) return;
      const tx: Transaction = {
        id: newId(),
        accountId: txDraft.accountId,
        type: result.type,
        amount,
        description: txDraft.description.trim() || result.description,
        categoryId: txDraft.categoryId,
        competenceDate: txDraft.paymentDate,
        paymentDate: txDraft.paymentDate,
        status: txDraft.status,
        isRecurring: false,
        origin: "manual",
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: "ADD_TX", payload: tx });

    } else if (result.intent === "card_purchase" && purchaseDraft) {
      const card = state.cards.find(c => c.id === purchaseDraft.cardId);
      if (!card) return;
      const amount = parseFloat(purchaseDraft.amount.replace(",", "."));
      if (!amount || amount <= 0) return;
      const totalInstallments = Math.max(1, parseInt(purchaseDraft.totalInstallments) || 1);
      const purchase: CardPurchase = {
        id: newId(),
        cardId: purchaseDraft.cardId,
        amount,
        description: purchaseDraft.description.trim() || result.description,
        categoryId: purchaseDraft.categoryId,
        purchaseDate: purchaseDraft.purchaseDate,
        totalInstallments,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: "ADD_PURCHASE", payload: { purchase, card } });
    }

    setFlash(true);
    setResult(null);
    setMessage("");
    setTimeout(() => {
      setFlash(false);
      router.back();
    }, 1400);
  }

  function handleChip(text: string) {
    setMessage(text);
    setResult(null);
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

  const hasPreview = result?.intent === "transaction" || result?.intent === "card_purchase";
  const hasError   = result?.intent === "error" || result?.intent === "unknown";
  const isBusy     = loading || retryIn !== null;

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
            <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--green)" }}>Lançado com sucesso!</p>
            <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>Voltando...</p>
          </div>
        )}

        {/* Estado inicial */}
        {!loading && !result && !flash && (
          <>
            <p style={{ fontSize: "13px", color: "var(--text-3)", marginBottom: "14px", lineHeight: 1.6 }}>
              Diga o que aconteceu financeiramente e eu lanço automaticamente.
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
                "recebi salário de 3000",
                "100 de gasolina no cartão nubank",
                "comprei tênis 400 em 4x no cartão",
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
              onClick={() => { setResult(null); inputRef.current?.focus(); }}
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

        {/* ── Preview card editável ─────────────────────────────────────────── */}
        {hasPreview && result && !flash && (
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border-accent)",
            borderRadius: "16px", overflow: "hidden", animation: "fadeIn 0.25s ease",
          }}>
            <div style={{
              padding: "7px 14px", background: "var(--accent-10)",
              borderBottom: "1px solid var(--border-accent)",
              display: "flex", alignItems: "center", gap: "6px",
            }}>
              <SparkleIcon size={11} />
              <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Confirmar lançamento — edite se necessário
              </span>
            </div>

            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>

              {/* ── TRANSAÇÃO ── */}
              {result.intent === "transaction" && txDraft && (() => {
                const editCat = state.categories.find(c => c.id === txDraft.categoryId);
                const txCategories = state.categories.filter(c => c.type === result.type);
                const parsedAmount = parseFloat(txDraft.amount.replace(",", "."));
                const isIncome = result.type === "income";
                return (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{
                        width: "44px", height: "44px", borderRadius: "13px", flexShrink: 0,
                        background: editCat ? `${editCat.color}18` : "var(--bg-input)",
                        border: `1px solid ${editCat ? editCat.color + "28" : "var(--border)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px",
                      }}>
                        {editCat?.icon || <Package size={20} strokeWidth={1.5} color="var(--text-3)" />}
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
                      <input className="form-input" type="text" value={txDraft.description}
                        onChange={e => setTxDraft(d => d ? { ...d, description: e.target.value } : d)}
                        autoComplete="off" autoCorrect="off" />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Valor (R$)</label>
                      <input className="form-input mono" type="text" inputMode="decimal" value={txDraft.amount}
                        onChange={e => setTxDraft(d => d ? { ...d, amount: e.target.value.replace(/[^0-9.,]/g, "") } : d)}
                        style={{ fontSize: "20px" }} autoComplete="off" />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Categoria</label>
                      <select className="form-input" value={txDraft.categoryId}
                        onChange={e => setTxDraft(d => d ? { ...d, categoryId: e.target.value } : d)}>
                        {txCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Conta</label>
                      <select className="form-input" value={txDraft.accountId}
                        onChange={e => setTxDraft(d => d ? { ...d, accountId: e.target.value } : d)}>
                        {state.accounts.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Data</label>
                      <input className="form-input" type="date" value={txDraft.paymentDate}
                        onChange={e => setTxDraft(d => d ? { ...d, paymentDate: e.target.value } : d)} />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Status</label>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {[
                          { key: "paid" as const, label: "✓ Pago", bg: "var(--green-10)", border: "var(--green-20)", color: "var(--green)" },
                          { key: "pending" as const, label: "A pagar", bg: "var(--amber-10)", border: "var(--amber-20)", color: "var(--amber)" },
                        ].map(opt => (
                          <button key={opt.key}
                            onClick={() => setTxDraft(d => d ? { ...d, status: opt.key } : d)}
                            style={{
                              flex: 1, padding: "10px", borderRadius: "10px",
                              background: txDraft.status === opt.key ? opt.bg : "var(--bg-input)",
                              border: `1px solid ${txDraft.status === opt.key ? opt.border : "var(--border)"}`,
                              color: txDraft.status === opt.key ? opt.color : "var(--text-3)",
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
              })()}

              {/* ── COMPRA NO CARTÃO ── */}
              {result.intent === "card_purchase" && purchaseDraft && (() => {
                const editCat = state.categories.find(c => c.id === purchaseDraft.categoryId);
                const expenseCategories = state.categories.filter(c => c.type === "expense");
                const parsedAmount = parseFloat(purchaseDraft.amount.replace(",", "."));
                const parsedInstallments = Math.max(1, parseInt(purchaseDraft.totalInstallments) || 1);
                const installmentValue = !isNaN(parsedAmount) && parsedInstallments > 1 ? parsedAmount / parsedInstallments : null;
                const editCard = state.cards.find(c => c.id === purchaseDraft.cardId);
                return (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{
                        width: "44px", height: "44px", borderRadius: "13px", flexShrink: 0,
                        background: editCat ? `${editCat.color}18` : "var(--bg-input)",
                        border: `1px solid ${editCat ? editCat.color + "28" : "var(--border)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px",
                      }}>
                        {editCat?.icon || <Package size={20} strokeWidth={1.5} color="var(--text-3)" />}
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
                      <input className="form-input" type="text" value={purchaseDraft.description}
                        onChange={e => setPurchaseDraft(d => d ? { ...d, description: e.target.value } : d)}
                        autoComplete="off" autoCorrect="off" />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Valor total (R$)</label>
                      <input className="form-input mono" type="text" inputMode="decimal" value={purchaseDraft.amount}
                        onChange={e => setPurchaseDraft(d => d ? { ...d, amount: e.target.value.replace(/[^0-9.,]/g, "") } : d)}
                        style={{ fontSize: "20px" }} autoComplete="off" />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Parcelas</label>
                      <input className="form-input mono" type="text" inputMode="numeric" value={purchaseDraft.totalInstallments}
                        onChange={e => setPurchaseDraft(d => d ? { ...d, totalInstallments: e.target.value.replace(/[^0-9]/g, "") } : d)}
                        autoComplete="off" />
                      {installmentValue && (
                        <p style={{ fontSize: "12px", color: "var(--accent)", fontWeight: 600, marginTop: "6px" }}>
                          → {parsedInstallments}x de R$ {fmt(installmentValue)}
                        </p>
                      )}
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Categoria</label>
                      <select className="form-input" value={purchaseDraft.categoryId}
                        onChange={e => setPurchaseDraft(d => d ? { ...d, categoryId: e.target.value } : d)}>
                        {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Cartão</label>
                      <select className="form-input" value={purchaseDraft.cardId}
                        onChange={e => setPurchaseDraft(d => d ? { ...d, cardId: e.target.value } : d)}>
                        {state.cards.map(c => <option key={c.id} value={c.id}>{c.name} ({c.brand})</option>)}
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Data da compra</label>
                      <input className="form-input" type="date" value={purchaseDraft.purchaseDate}
                        onChange={e => setPurchaseDraft(d => d ? { ...d, purchaseDate: e.target.value } : d)} />
                    </div>
                  </>
                );
              })()}

              {/* Botões */}
              <div style={{ display: "flex", gap: "8px", paddingTop: "2px" }}>
                <button onClick={handleConfirm} style={{
                  flex: 1, padding: "14px", background: "var(--accent)", border: "none",
                  borderRadius: "12px", color: "#06100E", fontSize: "14px", fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit", touchAction: "manipulation",
                }}>
                  ✓ Confirmar
                </button>
                <button onClick={() => { setResult(null); setMessage(""); inputRef.current?.focus(); }} style={{
                  flex: 1, padding: "14px", background: "var(--bg-input)", border: "1px solid var(--border)",
                  borderRadius: "12px", color: "var(--text-2)", fontSize: "14px", fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit", touchAction: "manipulation",
                }}>
                  Descartar
                </button>
              </div>
            </div>
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
          onKeyDown={handleKey}
          placeholder="Ex: gastei 50 no iFood hoje…"
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
