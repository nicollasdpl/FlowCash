import type { ChatTurn } from "@/lib/ai/types";
import { Markdown, SparkleIcon } from "./shared";

export function AIChatThread({ history }: { history: ChatTurn[] }) {
  if (history.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
      {history.map((turn, i) => {
        const prev = i > 0 ? history[i - 1] : null;
        const showUserBubble = !prev || prev.q !== turn.q;

        return (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {showUserBubble && (
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
          )}

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
        );
      })}
    </div>
  );
}
