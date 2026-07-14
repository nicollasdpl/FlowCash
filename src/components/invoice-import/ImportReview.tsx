"use client";

import Link from "next/link";
import type {
  AppInvoiceLine,
  ImportDraftLine,
  ImportReviewMode,
  MatchResult,
} from "@/lib/invoiceImport/types";
import ImportLineEditor from "./ImportLineEditor";

interface CategoryOpt {
  id: string;
  name: string;
  icon: string;
}

interface Props {
  cardId: string;
  mode: ImportReviewMode;
  onModeChange: (m: ImportReviewMode) => void;
  match: MatchResult;
  drafts: ImportDraftLine[];
  onDraftChange: (key: string, next: ImportDraftLine) => void;
  categories: CategoryOpt[];
  onSelectAllOnlyBank: (selected: boolean) => void;
  onAddSelected: () => void;
  adding?: boolean;
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SectionTitle({ children, count, tone }: { children: React.ReactNode; count: number; tone?: string }) {
  return (
    <div
      style={{
        padding: "10px 16px",
        background: "var(--bg-elevated)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: tone ?? "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {children}
      </span>
      <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>{count}</span>
    </div>
  );
}

function AppLineRow({ line, cardId }: { line: AppInvoiceLine; cardId: string }) {
  return (
    <div
      style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{line.description}</div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
          {line.date ? line.date.split("-").reverse().join("/") : "—"}
          {" · "}
          {line.categoryName}
          {line.isSubscription
            ? " · Assinatura"
            : line.totalInstallments > 1
              ? ` · ${line.installmentNumber}/${line.totalInstallments}`
              : ""}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          R$ {fmt(line.amount)}
        </div>
        <Link
          href={`/cartoes/${cardId}/compras/${line.purchaseId}/editar`}
          style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}
        >
          Editar compra
        </Link>
      </div>
    </div>
  );
}

export default function ImportReview({
  cardId,
  mode,
  onModeChange,
  match,
  drafts,
  onDraftChange,
  categories,
  onSelectAllOnlyBank,
  onAddSelected,
  adding,
}: Props) {
  const selectedCount = drafts.filter(d => d.selected && !d.covered).length;
  const selectableCount = drafts.filter(d => !d.covered).length;

  return (
    <div style={{ paddingBottom: 120 }}>
      {/* Totais */}
      <div
        style={{
          margin: "12px 16px",
          padding: "14px 16px",
          borderRadius: 12,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
        }}
      >
        <Stat label="Extrato" value={match.totals.bank} />
        <Stat label="App" value={match.totals.app} />
        <Stat
          label="Diferença"
          value={match.totals.difference}
          highlight={match.totals.difference !== 0}
        />
      </div>

      <div style={{ display: "flex", gap: 4, padding: "0 16px 12px" }}>
        {(["compare", "import"] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: mode === m ? "1px solid var(--accent)" : "1px solid var(--border)",
              background: mode === m ? "var(--accent-10)" : "rgba(255,255,255,0.03)",
              color: mode === m ? "var(--accent)" : "var(--text-2)",
              fontWeight: 700,
              fontSize: 13,
              fontFamily: "inherit",
              cursor: "pointer",
              minHeight: 44,
            }}
          >
            {m === "compare" ? "Comparar" : "Importar faltantes"}
          </button>
        ))}
      </div>

      <SectionTitle count={match.matched.length} tone="var(--green)">
        Batendo
      </SectionTitle>
      {match.matched.length === 0 ? (
        <Empty>Nenhuma linha emparelhada automaticamente.</Empty>
      ) : (
        match.matched.map(pair => (
          <div
            key={pair.imported.id + pair.app.installmentId}
            style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{pair.app.description}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                  Extrato: {pair.imported.description}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  R$ {fmt(pair.imported.amount)}
                </div>
                <Link
                  href={`/cartoes/${cardId}/compras/${pair.app.purchaseId}/editar`}
                  style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}
                >
                  Editar
                </Link>
              </div>
            </div>
          </div>
        ))
      )}

      <SectionTitle count={drafts.length} tone="var(--amber)">
        Só no extrato
      </SectionTitle>
      {mode === "import" && selectableCount > 0 && (
        <div style={{ padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => onSelectAllOnlyBank(selectedCount < selectableCount)}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {selectedCount < selectableCount ? "Selecionar todos" : "Limpar seleção"}
          </button>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            {selectedCount} selecionado{selectedCount === 1 ? "" : "s"}
          </span>
        </div>
      )}
      {drafts.length === 0 ? (
        <Empty>Nada faltando no app.</Empty>
      ) : (
        drafts.map(d => (
          <ImportLineEditor
            key={d.key}
            draft={d}
            categories={categories}
            mode={mode}
            onChange={next => onDraftChange(d.key, next)}
          />
        ))
      )}

      {match.ambiguous.length > 0 && (
        <>
          <SectionTitle count={match.ambiguous.length} tone="var(--warning)">
            Ambíguos
          </SectionTitle>
          {match.ambiguous.map(a => (
            <div key={a.imported.id} style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {a.imported.description} · R$ {fmt(a.imported.amount)}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                {a.candidates.length} candidatos no app — resolva editando ou ignorando.
              </div>
            </div>
          ))}
        </>
      )}

      <SectionTitle count={match.onlyApp.length} tone="var(--text-2)">
        Só no app
      </SectionTitle>
      {match.onlyApp.length === 0 ? (
        <Empty>Nenhum lançamento a mais no app.</Empty>
      ) : (
        match.onlyApp.map(line => <AppLineRow key={line.installmentId} line={line} cardId={cardId} />)
      )}

      {mode === "import" && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
            background: "var(--bg)",
            borderTop: "1px solid var(--border)",
            zIndex: 20,
          }}
        >
          <button
            type="button"
            disabled={selectedCount === 0 || adding}
            onClick={onAddSelected}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 12,
              border: "none",
              background: selectedCount === 0 ? "rgba(255,255,255,0.06)" : "var(--green)",
              color: selectedCount === 0 ? "var(--text-3)" : "#000",
              fontWeight: 700,
              fontSize: 14,
              fontFamily: "inherit",
              cursor: selectedCount === 0 ? "not-allowed" : "pointer",
              minHeight: 48,
            }}
          >
            {adding
              ? "Adicionando…"
              : `Adicionar selecionados (${selectedCount})`}
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          marginTop: 4,
          color: highlight ? "var(--amber)" : "var(--text-1)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        R$ {fmt(value)}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ padding: "16px", fontSize: 13, color: "var(--text-3)", margin: 0 }}>
      {children}
    </p>
  );
}
