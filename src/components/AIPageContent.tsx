"use client";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { AIActionPreview } from "@/components/ai/AIActionPreview";
import { AIAnswerCard, AIChatThread } from "@/components/ai/AIChatThread";
import { AIDraftPreview } from "@/components/ai/AIDraftPreview";
import { AIInputBar } from "@/components/ai/AIInputBar";
import { EXAMPLE_PROMPTS, getContextualChips } from "@/components/ai/chips";
import { SparkleIcon } from "@/components/ai/shared";
import { useCopilot } from "@/components/ai/useCopilot";
import { useApp } from "@/context/AppContext";
import { useRouter } from "next/navigation";

export default function AIPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const fromPath = searchParams.get("from") ?? "/";
  const quickChips = getContextualChips(fromPath);
  const { state } = useApp();

  const copilot = useCopilot(initialQ);

  useEffect(() => {
    if (initialQ) {
      copilot.setMessage(initialQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  const categories = state.categories.filter(c => !c.isSystem);
  const accounts = state.accounts.filter(a => a.active);

  return (
    <>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--bg)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "0 16px 0 4px",
          height: "60px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-2)",
            cursor: "pointer",
            fontSize: "24px",
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          ‹
        </button>

        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: "var(--accent-10)",
              border: "1px solid var(--border-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent)",
              flexShrink: 0,
            }}
          >
            <SparkleIcon size={15} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)", lineHeight: 1.2 }}>Copiloto Financeiro</p>
            <p style={{ fontSize: "10.5px", color: "var(--accent)", fontWeight: 600 }}>Powered by Gemini</p>
          </div>
        </div>
      </div>

      <div ref={copilot.contentRef} style={{ padding: "20px 16px calc(130px + var(--bottom-nav-total, 48px))" }}>
        {copilot.flash && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", animation: "fadeIn 0.25s ease" }}>
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "var(--green-10)",
                border: "2px solid var(--green-20)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "28px",
                marginBottom: "14px",
                color: "var(--green)",
                fontWeight: 700,
              }}
            >
              ✓
            </div>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--green)" }}>{copilot.flashMessage}</p>
            <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>Voltando...</p>
          </div>
        )}

        <AIChatThread history={copilot.chatHistory} />

        {!copilot.loading && !copilot.result && !copilot.flash && copilot.chatHistory.length === 0 && (
          <>
            <p style={{ fontSize: "13px", color: "var(--text-3)", marginBottom: "14px", lineHeight: 1.6 }}>
              Diga o que aconteceu financeiramente que eu lanço, ou me pergunte sobre as suas finanças. Posso fazer as duas coisas na mesma mensagem.
            </p>
            <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>
              Sugestões rápidas
            </p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
              {quickChips.map(chip => (
                <button
                  key={chip.label}
                  onClick={() => {
                    copilot.setMessage(chip.text);
                    copilot.applyResult(null);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "9px 14px",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "20px",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--text-2)",
                    cursor: "pointer",
                    fontFamily: "inherit",
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
              {EXAMPLE_PROMPTS.map(ex => (
                <button
                  key={ex}
                  onClick={() => {
                    copilot.setMessage(ex);
                    copilot.applyResult(null);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 0",
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    color: "var(--accent)",
                    fontSize: "13px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  &quot;{ex}&quot;
                </button>
              ))}
            </div>
          </>
        )}

        {copilot.retryIn !== null && !copilot.loading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              padding: "20px 18px",
              background: "rgba(245,158,11,0.06)",
              border: "1px solid var(--amber-20)",
              borderRadius: "14px",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                background: "rgba(245,158,11,0.12)",
                border: "2px solid var(--amber-20)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                fontWeight: 700,
                color: "var(--amber)",
                flexShrink: 0,
              }}
            >
              {copilot.retryIn}
            </div>
            <div>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--amber)" }}>Limite da API atingido</p>
              <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px", lineHeight: 1.4 }}>
                Reenviando automaticamente em {copilot.retryIn}s
              </p>
              {copilot.retryReason && (
                <p style={{ fontSize: "10.5px", color: "var(--text-3)", marginTop: "4px", lineHeight: 1.35, wordBreak: "break-word", opacity: 0.85 }}>
                  {copilot.retryReason}
                </p>
              )}
            </div>
          </div>
        )}

        {copilot.loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "24px 0" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "12px",
                background: "var(--accent-10)",
                border: "1px solid var(--border-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent)",
                animation: "aiPulse 1.2s ease-in-out infinite",
              }}
            >
              <SparkleIcon size={18} />
            </div>
            <div>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-1)" }}>Interpretando...</p>
              <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "3px" }}>Analisando com Gemini IA</p>
            </div>
          </div>
        )}

        {copilot.hasError && copilot.result && !copilot.flash && (
          <div style={{ padding: "16px", background: "var(--red-10)", border: "1px solid var(--red-20)", borderRadius: "14px" }}>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--red)", marginBottom: "6px" }}>
              {copilot.result.intent === "error" ? `Erro · ${copilot.result.code}` : "Não entendi"}
            </p>
            <p style={{ fontSize: "12.5px", color: "var(--red)", opacity: 0.85, lineHeight: 1.5 }}>
              {(copilot.result.intent === "error" || copilot.result.intent === "unknown") ? copilot.result.message : ""}
            </p>
            <button
              onClick={() => copilot.applyResult(null)}
              style={{
                marginTop: "12px",
                padding: "8px 14px",
                background: "var(--red-10)",
                border: "1px solid var(--red-20)",
                borderRadius: "8px",
                color: "var(--red)",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {copilot.showQuestionCard && copilot.result?.intent === "question" && (
          <AIAnswerCard answer={copilot.result.answer} local={copilot.result.local} />
        )}

        {copilot.hasActions && copilot.result?.intent === "action" && !copilot.flash && (
          <AIActionPreview
            actions={copilot.pendingActions}
            onConfirm={copilot.handleConfirmActions}
            onDiscard={() => copilot.applyResult(null)}
          />
        )}

        {copilot.hasCards && !copilot.flash && (
          <AIDraftPreview
            drafts={copilot.drafts}
            mixedAnswer={copilot.result?.intent === "mixed" ? copilot.result.answer : undefined}
            truncated={copilot.truncated}
            categories={categories}
            accounts={accounts}
            cards={state.cards}
            canConfirm={copilot.canConfirm}
            onUpdateTx={copilot.updateTx}
            onUpdatePurchase={copilot.updatePurchase}
            onRemoveDraft={copilot.removeDraft}
            onConfirm={copilot.handleConfirmDrafts}
            onDiscard={() => {
              copilot.applyResult(null);
              copilot.setMessage("");
            }}
          />
        )}
      </div>

      <AIInputBar
        message={copilot.message}
        loading={copilot.loading}
        disabled={copilot.isBusy || copilot.flash}
        bottomOffset="var(--bottom-nav-total, 48px)"
        onChange={copilot.setMessage}
        onSend={copilot.handleSend}
      />
    </>
  );
}
