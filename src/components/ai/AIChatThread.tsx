import type { ChatTurn } from "@/lib/ai/types";
import { Markdown, SparkleIcon } from "./shared";

export function AIChatThread({ history }: { history: ChatTurn[] }) {
  if (history.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
      {history.map((turn, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div
              style={{
                maxWidth: "82%",
                padding: "9px 13px",
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                borderRadius: "14px 14px 4px 14px",
                fontSize: "13px",
                color: "var(--text-1)",
                lineHeight: 1.5,
                wordBreak: "break-word",
              }}
            >
              {turn.q}
            </div>
          </div>

          {turn.kind === "message" && turn.a && (
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "9px",
                  flexShrink: 0,
                  background: "var(--accent-10)",
                  border: "1px solid var(--border-accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--accent)",
                  marginTop: "2px",
                }}
              >
                <SparkleIcon size={12} />
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "10px 14px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px 14px 14px 14px",
                  fontSize: "13px",
                  color: "var(--text-2)",
                  wordBreak: "break-word",
                }}
              >
                <Markdown text={turn.a} />
              </div>
            </div>
          )}

          {turn.kind === "launch" && (
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "9px",
                  flexShrink: 0,
                  background: "var(--green-10)",
                  border: "1px solid var(--green-20)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--green)",
                  marginTop: "2px",
                  fontSize: "14px",
                  fontWeight: 700,
                }}
              >
                ✓
              </div>
              <div
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--green-20)",
                  borderRadius: "4px 14px 14px 14px",
                  fontSize: "13px",
                  color: "var(--green)",
                  fontWeight: 600,
                  lineHeight: 1.5,
                }}
              >
                {turn.summary}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function AIAnswerCard({ answer, local }: { answer: string; local?: boolean }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-accent)",
        borderRadius: "14px",
        marginBottom: "14px",
        animation: "fadeIn 0.25s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <SparkleIcon size={12} />
        <p
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: "var(--accent)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Resposta{local ? " · instantânea" : ""}
        </p>
      </div>
      <div style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.55 }}>
        <Markdown text={answer} />
      </div>
    </div>
  );
}

export function AIMixedAnswerBanner({ answer }: { answer: string }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-accent)",
        borderRadius: "12px",
        marginBottom: "4px",
      }}
    >
      <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--accent)", marginBottom: "6px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        Resposta
      </p>
      <div style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5 }}>
        <Markdown text={answer} />
      </div>
    </div>
  );
}
