"use client";
import { useState, type ReactNode } from "react";
import type { Account, Category, CreditCard } from "@/types/financial";
import { auth } from "@/lib/firebase";
import { Sparkles } from "lucide-react";

function renderInline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4
      ? <strong key={i} style={{ color: "var(--text-1)" }}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  );
}

function Markdown({ text }: { text: string }) {
  type Block = { kind: "p" | "ul"; lines: string[] };
  const blocks: Block[] = [];
  let current = null as Block | null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (current) { blocks.push(current); current = null; }
      continue;
    }
    const listMatch = /^\s*-\s+(.*)$/.exec(line);
    const kind = listMatch ? "ul" : "p";
    if (current?.kind !== kind) {
      if (current) blocks.push(current);
      current = { kind, lines: [] };
    }
    current.lines.push(listMatch ? listMatch[1] : line);
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

export default function AIInsights({ buildContext, categories, accounts, cards }: {
  /** Texto com os números já calculados do relatório (sem "R$"). */
  buildContext: () => string;
  categories: Category[];
  accounts: Account[];
  cards: CreditCard[];
}) {
  const [insights, setInsights] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchInsights() {
    setLoading(true);
    setError("");

    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      setError("Faça login para gerar insights.");
      return;
    }
    let idToken: string;
    try { idToken = await user.getIdToken(); }
    catch {
      setLoading(false);
      setError("Não consegui validar sua sessão.");
      return;
    }

    // Sem "R$" nem verbos monetários: detectIntent precisa classificar como "question".
    const message =
      `Analise meu relatório financeiro abaixo e me diga, em no máximo 4 tópicos curtos, ` +
      `quais decisões tomar neste mês e nos próximos. Use os números exatos, priorize o maior problema ` +
      `e termine com uma ação concreta com valor.\n\n${buildContext()}`;

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          message,
          categories: categories.filter(c => !c.isSystem),
          accounts: accounts.filter(a => a.active),
          cards,
        }),
      });
      const data = await res.json();
      if (data.intent === "question" && typeof data.answer === "string" && data.answer.trim()) {
        setInsights(data.answer.trim());
      } else if (data.intent === "error") {
        setError(data.message || "Erro ao gerar insights.");
      } else if (data.intent === "unknown") {
        setError(data.message || "Não consegui gerar insights com os dados disponíveis.");
      } else {
        setError("Resposta inesperada da IA.");
      }
    } catch {
      setError("Sem conexão. Verifique sua internet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "12px 14px 14px" }}>
      {!insights && !loading && !error && (
        <p style={{ fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.5, marginBottom: "12px" }}>
          A IA recebe os números deste relatório (espaço livre, excessos, orçamentos, parcelas e recorrências)
          e sugere o que decidir. Só gera quando você pedir.
        </p>
      )}

      {loading && (
        <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5 }}>Analisando seus dados...</p>
      )}

      {error && (
        <div style={{
          padding: "10px 12px", marginBottom: "12px",
          background: "var(--red-10)", border: "1px solid var(--red-20)", borderRadius: "10px",
        }}>
          <p style={{ fontSize: "12.5px", color: "var(--red)", lineHeight: 1.4 }}>{error}</p>
        </div>
      )}

      {insights && !loading && (
        <div style={{ fontSize: "13px", color: "var(--text-2)", marginBottom: "14px" }}>
          <Markdown text={insights} />
        </div>
      )}

      {!loading && (
        <button
          type="button"
          onClick={fetchInsights}
          style={{
            padding: "10px 16px", minHeight: "44px",
            background: "var(--accent)", border: "none", borderRadius: "10px",
            color: "#06100E", fontSize: "13px", fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", touchAction: "manipulation",
            display: "inline-flex", alignItems: "center", gap: "6px",
          }}
        >
          <Sparkles size={13} strokeWidth={1.5} />
          {insights ? "Atualizar insights" : "Gerar insights"}
        </button>
      )}
    </div>
  );
}
