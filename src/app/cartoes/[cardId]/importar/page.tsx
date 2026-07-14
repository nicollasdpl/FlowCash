"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useApp, newId } from "@/context/AppContext";
import type { CardPurchase } from "@/context/AppContext";
import {
  getInstallmentsByMonth,
  getCompetenceMonth,
} from "@/engine/invoiceEngine";
import { parseImportText } from "@/lib/invoiceImport/parseImportFile";
import {
  buildAppInvoiceLines,
  matchInvoiceLines,
} from "@/lib/invoiceImport/matchInvoiceLines";
import { suggestCategoryId } from "@/lib/invoiceImport/suggestCategory";
import type {
  ImportDraftLine,
  ImportReviewMode,
  ImportedLine,
  MatchResult,
} from "@/lib/invoiceImport/types";
import ImportReview from "@/components/invoice-import/ImportReview";
import { Upload } from "lucide-react";

function emptyMatch(): MatchResult {
  return {
    matched: [],
    onlyBank: [],
    onlyApp: [],
    ambiguous: [],
    totals: { bank: 0, app: 0, difference: 0 },
  };
}

function draftsFromOnlyBank(
  lines: ImportedLine[],
  categories: Array<{ id: string; name: string; type: string; isSystem?: boolean }>,
  cardClosingDay: number,
  selectedMonth: string,
): ImportDraftLine[] {
  return lines.map(line => {
    const categoryId = suggestCategoryId(line.description, categories);
    let amount = line.amount;
    let installments = 1;
    let isSubscription = !!line.isSubscriptionHint;

    if (line.isSubscriptionHint) {
      isSubscription = true;
      installments = 1;
    } else if (line.installmentHint && line.installmentHint.total > 1) {
      // Parcela N/M: lança o valor da parcela à vista nesta fatura (editável).
      installments = 1;
      amount = line.amount;
    }

    const competence = getCompetenceMonth(line.date, cardClosingDay);
    const competenceWarning =
      competence !== selectedMonth
        ? `Com esta data a compra cai na fatura ${competence}, não em ${selectedMonth}.`
        : undefined;

    return {
      key: line.id,
      selected: true,
      date: line.date,
      description: line.description,
      amount,
      categoryId,
      totalInstallments: installments,
      isSubscription,
      competenceWarning,
    };
  });
}

function ImportarFaturaContent() {
  const { cardId } = useParams<{ cardId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { state, dispatch } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  const card = state.cards.find(c => c.id === cardId);
  const monthParam = searchParams.get("month");
  const competenceMonth =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : undefined;

  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [mode, setMode] = useState<ImportReviewMode>("compare");
  const [imported, setImported] = useState<ImportedLine[]>([]);
  const [formatLabel, setFormatLabel] = useState("");
  const [drafts, setDrafts] = useState<ImportDraftLine[]>([]);
  const [adding, setAdding] = useState(false);
  const [hasParsed, setHasParsed] = useState(false);

  const installmentsThisMonth = useMemo(() => {
    if (!card || !competenceMonth) return [];
    return getInstallmentsByMonth(state.installments, card.id, competenceMonth);
  }, [card, state.installments, competenceMonth]);

  const expenseCategories = useMemo(
    () => state.categories.filter(c => c.type === "expense" && !c.isSystem),
    [state.categories],
  );

  const appLines = useMemo(
    () =>
      buildAppInvoiceLines(
        installmentsThisMonth,
        state.purchases,
        state.categories,
      ),
    [installmentsThisMonth, state.purchases, state.categories],
  );

  const match = useMemo(() => {
    if (!hasParsed) return emptyMatch();
    return matchInvoiceLines(imported, appLines);
  }, [imported, appLines, hasParsed]);

  useEffect(() => {
    if (!card || !hasParsed || !competenceMonth) return;
    setDrafts(prev => {
      const prevMap = new Map(prev.map(d => [d.key, d]));
      const next = draftsFromOnlyBank(
        match.onlyBank,
        state.categories,
        card.closingDay,
        competenceMonth,
      );
      return next.map(d => {
        const old = prevMap.get(d.key);
        if (!old) return d;
        return {
          ...d,
          selected: old.covered ? false : old.selected,
          description: old.description,
          date: old.date,
          amount: old.amount,
          categoryId: old.categoryId || d.categoryId,
          totalInstallments: old.totalInstallments,
          isSubscription: old.isSubscription,
          covered: old.covered,
          competenceWarning: d.competenceWarning,
        };
      });
    });
  }, [match.onlyBank, card, hasParsed, state.categories, competenceMonth]);

  const applyText = useCallback(
    (text: string) => {
      setError("");
      setInfo("");
      if (!text.trim()) {
        setError("Cole o texto do extrato ou escolha um arquivo.");
        return;
      }
      const year = competenceMonth
        ? Number(competenceMonth.slice(0, 4))
        : new Date().getFullYear();
      const { format, lines } = parseImportText(text, { referenceYear: year });
      if (lines.length === 0) {
        setError(
          "Não encontrei lançamentos. Use o CSV exportado pelo FlowCash ou cole o texto do extrato Bradesco.",
        );
        setHasParsed(false);
        setImported([]);
        return;
      }
      setImported(lines);
      setHasParsed(true);
      setFormatLabel(
        format === "flowcash_csv"
          ? "CSV FlowCash"
          : format === "bradesco"
            ? "Extrato Bradesco"
            : "Formato detectado",
      );
      setInfo(`${lines.length} lançamento(s) lido(s).`);
      setMode("compare");
    },
    [competenceMonth],
  );

  async function onFile(file: File) {
    setError("");
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf")) {
      setError(
        "PDF: abra o arquivo, selecione todo o texto (Ctrl+A) e cole abaixo. Em breve suporte direto a PDF.",
      );
      return;
    }
    const text = await file.text();
    setPaste(text);
    applyText(text);
  }

  function handleDraftChange(key: string, next: ImportDraftLine) {
    setDrafts(prev => prev.map(d => (d.key === key ? next : d)));
  }

  function handleSelectAll(selected: boolean) {
    setDrafts(prev => prev.map(d => (d.covered ? d : { ...d, selected })));
  }

  function handleAddSelected() {
    if (!card) return;
    const toAdd = drafts.filter(d => d.selected && !d.covered);
    if (toAdd.length === 0) return;

    setAdding(true);
    try {
      for (const d of toAdd) {
        if (!d.description.trim() || d.amount <= 0) continue;
        const purchase: CardPurchase = {
          id: newId(),
          cardId: card.id,
          amount: d.amount,
          description: d.description.trim(),
          categoryId: d.categoryId || expenseCategories[0]?.id || "",
          purchaseDate: d.date,
          totalInstallments: d.isSubscription
            ? 1
            : Math.max(1, d.totalInstallments),
          isSubscription: d.isSubscription || undefined,
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: "ADD_PURCHASE", payload: { purchase, card } });
      }
      const addedKeys = new Set(toAdd.map(d => d.key));
      setImported(prev => prev.filter(l => !addedKeys.has(l.id)));
      setDrafts(prev => prev.filter(d => !addedKeys.has(d.key)));
      setInfo(`${toAdd.length} compra(s) adicionada(s).`);
      setMode("compare");
    } finally {
      setAdding(false);
    }
  }

  if (!card) {
    return (
      <div style={{ padding: 24, color: "var(--text-3)" }}>Cartão não encontrado.</div>
    );
  }

  if (!competenceMonth) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: "var(--text-2)" }}>Mês da fatura não informado.</p>
        <button
          type="button"
          onClick={() => router.push(`/cartoes/${card.id}`)}
          style={{
            marginTop: 12,
            color: "var(--accent)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          Voltar ao cartão
        </button>
      </div>
    );
  }

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
          gap: 4,
          padding: "0 8px 0 4px",
          height: 60,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => router.push(`/cartoes/${card.id}`)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-2)",
            cursor: "pointer",
            fontSize: 24,
            width: 48,
            height: 48,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ‹
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-1)" }}>
            Importar extrato
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>
            {card.name} · {competenceMonth}
            {formatLabel ? ` · ${formatLabel}` : ""}
          </div>
        </div>
      </div>

      {!hasParsed ? (
        <div style={{ padding: "20px 16px 40px" }}>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-2)",
              lineHeight: 1.5,
              marginBottom: 16,
            }}
          >
            Envie o CSV exportado pelo FlowCash ou cole o texto do extrato Bradesco
            para comparar com esta fatura e adicionar o que faltar.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain,.pdf"
            style={{ display: "none" }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 12,
              border: "1px dashed var(--border-accent)",
              background: "var(--accent-10)",
              color: "var(--accent)",
              fontWeight: 700,
              fontSize: 14,
              fontFamily: "inherit",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              minHeight: 52,
              marginBottom: 16,
            }}
          >
            <Upload size={18} strokeWidth={1.75} />
            Escolher CSV ou TXT
          </button>

          <label
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              display: "block",
              marginBottom: 6,
            }}
          >
            Ou cole o texto do extrato
          </label>
          <textarea
            value={paste}
            onChange={e => setPaste(e.target.value)}
            rows={10}
            placeholder={"08/07 EDCAS COMERCIO...\n08/07 JUPIARA..."}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--bg-input)",
              color: "var(--text-1)",
              fontSize: 12,
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              resize: "vertical",
              marginBottom: 12,
            }}
          />

          {error && (
            <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => applyText(paste)}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 12,
              border: "none",
              background: "var(--green)",
              color: "#000",
              fontWeight: 700,
              fontSize: 14,
              fontFamily: "inherit",
              cursor: "pointer",
              minHeight: 48,
            }}
          >
            Analisar extrato
          </button>
        </div>
      ) : (
        <>
          {info && (
            <p
              style={{
                padding: "8px 16px 0",
                fontSize: 12,
                color: "var(--green)",
                margin: 0,
              }}
            >
              {info}
            </p>
          )}
          <div style={{ padding: "8px 16px", display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setHasParsed(false);
                setImported([]);
                setDrafts([]);
                setInfo("");
                setError("");
              }}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                color: "var(--text-2)",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Trocar arquivo
            </button>
          </div>
          <ImportReview
            cardId={card.id}
            mode={mode}
            onModeChange={setMode}
            match={match}
            drafts={drafts}
            onDraftChange={handleDraftChange}
            categories={expenseCategories.map(c => ({
              id: c.id,
              name: c.name,
              icon: c.icon,
            }))}
            onSelectAllOnlyBank={handleSelectAll}
            onAddSelected={handleAddSelected}
            adding={adding}
          />
        </>
      )}
    </>
  );
}

export default function ImportarFaturaPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "var(--text-3)" }}>Carregando…</div>}>
      <ImportarFaturaContent />
    </Suspense>
  );
}
