import type { ReactNode } from "react";

export function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
      return <strong key={i} style={{ color: "var(--text-1)" }}>{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

export function Markdown({ text }: { text: string }) {
  type Block = { kind: "p" | "ul"; lines: string[] };
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (current) {
        blocks.push(current);
        current = null;
      }
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
      {blocks.map((b, i) =>
        b.kind === "ul" ? (
          <ul
            key={i}
            style={{ margin: "6px 0 0", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "3px" }}
          >
            {b.lines.map((l, j) => (
              <li key={j} style={{ lineHeight: 1.5 }}>
                {renderInline(l)}
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} style={{ margin: i === 0 ? 0 : "8px 0 0", lineHeight: 1.5 }}>
            {renderInline(b.lines.join(" "))}
          </p>
        ),
      )}
    </>
  );
}

export function SparkleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L13.9 9.1L21 11L13.9 12.9L12 20L10.1 12.9L3 11L10.1 9.1L12 2Z" />
      <circle cx="19" cy="4" r="1.5" opacity="0.5" />
      <circle cx="5" cy="18" r="1" opacity="0.4" />
    </svg>
  );
}

export function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
