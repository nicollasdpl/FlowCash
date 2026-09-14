"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import type {
  AppInvoiceLine,
  ImportDraftLine,
  ImportedLine,
  MatchResult,
  NearMatchPair,
} from "@/lib/invoiceImport/types";
import { nearAmountTolerance } from "@/lib/invoiceImport/matchInvoiceLines";
import { roundCents } from "@/lib/invoiceImport/csvShared";
import ImportLineEditor from "./ImportLineEditor";

interface CategoryOpt {
  id: string;
  name: string;
  icon: string;
}

type FocusTab = "attention" | "missing" | "extra" | "matched";

interface Props {
  cardId: string;
  match: MatchResult;
  drafts: ImportDraftLine[];
  onDraftChange: (key: string, next: ImportDraftLine) => void;
  categories: CategoryOpt[];
  onSelectAllOnlyBank: (selected: boolean) => void;
  onAddSelected: () => void;
  onManualLink?: (importedId: string, installmentId: string) => void;
  adding?: boolean;
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function compatibleAppLines(imported: ImportedLine, onlyApp: AppInvoiceLine[]): AppInvoiceLine[] {
  return onlyApp.filter(app => {
    const diff = Math.abs(roundCents(imported.amount) - roundCents(app.amount));
    return diff === 0 || diff <= nearAmountTolerance(imported.amount);
  });
}

function diagnosisText(match: MatchResult): { title: string; detail: string; tone: "ok" | "warn" } {
  const diff = roundCents(match.totals.difference);
  const missing = match.onlyBank.length + match.ambiguous.length;
  const extra = match.onlyApp.length;
  const near = match.nearMatches.length;

  if (diff === 0 && missing === 0 && extra === 0 && near === 0) {
    return {
      title: "Extrato e app batem",
      detail: `${match.matched.length} lançamento(s) conferidos. Nada a fazer.`,
      tone: "ok",
    };
  }

  if (diff > 0) {
    return {
      title: `Faltam R$ ${fmt(diff)} no app`,
      detail: [
        missing > 0 ? `${missing} no extrato ainda não lançado${missing === 1 ? "" : "s"}` : null,
        near > 0 ? `${near} com valor quase igual` : null,
        extra > 0 ? `${extra} só no app` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Confira as seções abaixo.",
      tone: "warn",
    };
  }

  if (diff < 0) {
    return {
      title: `App está R$ ${fmt(Math.abs(diff))} a mais`,
      detail: [
        extra > 0 ? `${extra} lançamento(s) só no app — revise ou apague` : null,
        near > 0 ? `${near} com valor diferente` : null,
        missing > 0 ? `${missing} no extrato sem par` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Confira as seções abaixo.",
      tone: "warn",
    };
  }

  return {
    title: "Valores iguais, mas há divergências",
    detail: [
      missing > 0 ? `${missing} só no extrato` : null,
      extra > 0 ? `${extra} só no app` : null,
      near > 0 ? `${near} quase batendo` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    tone: "warn",
  };
}

function LinkPicker({
  imported,
  targets,
  onLink,
}: {
  imported: ImportedLine;
  targets: AppInvoiceLine[];
  onLink: (importedId: string, installmentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (targets.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={secondaryBtn}>
        {open ? "Fechar" : "É o mesmo que…"} ({targets.length})
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {targets.map(t => (
            <button
              key={t.installmentId}
              type="button"
              onClick={() => {
                onLink(imported.id, t.installmentId);
                setOpen(false);
              }}
              style={pickerItem}
            >
              <span style={{ fontWeight: 600 }}>{t.description}</span>
              {" · "}
              R$ {fmt(t.amount)}
              {t.date ? ` · ${t.date.split("-").reverse().join("/")}` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AppLineRow({ line, cardId }: { line: AppInvoiceLine; cardId: string }) {
  return (
    <div style={row}>
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
          Editar / apagar
        </Link>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  hint,
  count,
  tone,
  action,
}: {
  title: string;
  hint?: string;
  count: number;
  tone: string;
  action?: ReactNode;
}) {
  return (
    <div style={sectionHead}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: tone }}>{title}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: tone,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 999,
              padding: "2px 8px",
            }}
          >
            {count}
          </span>
        </div>
        {hint && (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-3)", lineHeight: 1.35 }}>
            {hint}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export default function ImportReview({
  cardId,
  match,
  drafts,
  onDraftChange,
  categories,
  onSelectAllOnlyBank,
  onAddSelected,
  onManualLink,
  adding,
}: Props) {
  const selectedCount = drafts.filter(d => d.selected && !d.covered).length;
  const selectableCount = drafts.filter(d => !d.covered).length;
  const diagnosis = diagnosisText(match);

  const attentionCount =
    match.nearMatches.length +
    match.ambiguous.length +
    drafts.length +
    match.onlyApp.length;

  const defaultTab: FocusTab =
    match.onlyApp.length > 0 && match.totals.difference < 0
      ? "extra"
      : drafts.length > 0 || match.ambiguous.length > 0
        ? "missing"
        : match.nearMatches.length > 0
          ? "attention"
          : "matched";

  const [tab, setTab] = useState<FocusTab>(defaultTab);
  const [matchedOpen, setMatchedOpen] = useState(false);

  const tabs = useMemo(
    () =>
      [
        {
          id: "attention" as const,
          label: "Atenção",
          count: attentionCount,
          show: attentionCount > 0,
        },
        {
          id: "missing" as const,
          label: "Faltam no app",
          count: drafts.length + match.ambiguous.length,
          show: drafts.length + match.ambiguous.length > 0,
        },
        {
          id: "extra" as const,
          label: "A mais no app",
          count: match.onlyApp.length,
          show: match.onlyApp.length > 0,
        },
        {
          id: "matched" as const,
          label: "Já batem",
          count: match.matched.length,
          show: match.matched.length > 0,
        },
      ].filter(t => t.show),
    [attentionCount, drafts.length, match.ambiguous.length, match.onlyApp.length, match.matched.length],
  );

  const showNear = tab === "attention" || tab === "missing";
  const showAmbiguous = tab === "attention" || tab === "missing";
  const showMissing = tab === "attention" || tab === "missing";
  const showExtra = tab === "attention" || tab === "extra";
  const showMatched = tab === "matched";

  return (
    <div style={{ paddingBottom: selectedCount > 0 ? 120 : 32 }}>
      {/* Diagnóstico */}
      <div
        style={{
          margin: "12px 16px",
          padding: "16px",
          borderRadius: 14,
          background: diagnosis.tone === "ok" ? "var(--accent-10)" : "var(--amber-10)",
          border: `1px solid ${diagnosis.tone === "ok" ? "var(--border-accent)" : "rgba(245,158,11,0.35)"}`,
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: diagnosis.tone === "ok" ? "var(--green)" : "var(--amber)",
            lineHeight: 1.3,
          }}
        >
          {diagnosis.title}
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-2)", lineHeight: 1.4 }}>
          {diagnosis.detail}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <MiniStat label="Extrato" value={match.totals.bank} />
          <MiniStat label="App" value={match.totals.app} />
          <MiniStat
            label="Diferença"
            value={match.totals.difference}
            warn={match.totals.difference !== 0}
          />
        </div>
      </div>

      {/* Abas de foco */}
      {tabs.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "0 16px 12px",
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  flexShrink: 0,
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: active ? "var(--accent-10)" : "rgba(255,255,255,0.03)",
                  color: active ? "var(--accent)" : "var(--text-2)",
                  fontWeight: 700,
                  fontSize: 12,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  minHeight: 40,
                }}
              >
                {t.label} · {t.count}
              </button>
            );
          })}
        </div>
      )}

      {/* Quase batendo */}
      {showNear && match.nearMatches.length > 0 && (
        <>
          <SectionHeader
            title="Quase batendo"
            hint="Mesmo lançamento com valor diferente. Ajuste no app para o valor do extrato."
            count={match.nearMatches.length}
            tone="var(--amber)"
          />
          {match.nearMatches.map((pair: NearMatchPair) => (
            <div
              key={pair.imported.id + pair.app.installmentId}
              style={{ ...row, background: "var(--amber-10)" }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{pair.app.description}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                  Extrato: {pair.imported.description}
                </div>
                <div style={{ fontSize: 12, color: "var(--amber)", marginTop: 6, fontWeight: 600 }}>
                  App R$ {fmt(pair.app.amount)} → Extrato R$ {fmt(pair.imported.amount)}
                  {" · "}
                  diff R$ {fmt(Math.abs(pair.amountDiff))}
                </div>
              </div>
              <Link
                href={`/cartoes/${cardId}/compras/${pair.app.purchaseId}/editar`}
                style={{
                  flexShrink: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--accent)",
                  textDecoration: "none",
                  padding: "8px 10px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              >
                Corrigir
              </Link>
            </div>
          ))}
        </>
      )}

      {/* Ambíguos */}
      {showAmbiguous && match.ambiguous.length > 0 && (
        <>
          <SectionHeader
            title="Vincular manualmente"
            hint="O extrato tem mais de um candidato no app. Escolha o par certo."
            count={match.ambiguous.length}
            tone="var(--warning)"
          />
          {match.ambiguous.map(a => (
            <div key={a.imported.id} style={row}>
              <div style={{ width: "100%" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {a.imported.description} · R$ {fmt(a.imported.amount)}
                </div>
                {onManualLink && (
                  <LinkPicker imported={a.imported} targets={a.candidates} onLink={onManualLink} />
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Faltam no app */}
      {showMissing && (
        <>
          <SectionHeader
            title="Faltam no app"
            hint="Estão no extrato e ainda não foram lançados. Selecione e adicione."
            count={drafts.length}
            tone="var(--amber)"
            action={
              selectableCount > 0 ? (
                <button
                  type="button"
                  onClick={() => onSelectAllOnlyBank(selectedCount < selectableCount)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                  }}
                >
                  {selectedCount < selectableCount ? "Selecionar todos" : "Limpar"}
                </button>
              ) : undefined
            }
          />
          {drafts.length === 0 ? (
            <Empty>Nada faltando no app.</Empty>
          ) : (
            drafts.map(d => (
              <div key={d.key}>
                <ImportLineEditor
                  draft={d}
                  categories={categories}
                  onChange={next => onDraftChange(d.key, next)}
                />
                {onManualLink && (
                  <div style={{ padding: "0 16px 12px" }}>
                    <LinkPicker
                      imported={{
                        id: d.key,
                        date: d.date,
                        description: d.sourceDescription ?? d.description,
                        amount: d.amount,
                      }}
                      targets={compatibleAppLines(
                        {
                          id: d.key,
                          date: d.date,
                          description: d.sourceDescription ?? d.description,
                          amount: d.amount,
                        },
                        match.onlyApp,
                      )}
                      onLink={onManualLink}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}

      {/* A mais no app */}
      {showExtra && (
        <>
          <SectionHeader
            title="A mais no app"
            hint="Estão no app, mas não aparecem neste extrato. Se não deveriam estar aqui, edite ou apague."
            count={match.onlyApp.length}
            tone="var(--text-2)"
          />
          {match.onlyApp.length === 0 ? (
            <Empty>Nenhum lançamento a mais no app.</Empty>
          ) : (
            match.onlyApp.map(line => (
              <AppLineRow key={line.installmentId} line={line} cardId={cardId} />
            ))
          )}
        </>
      )}

      {/* Já batem — recolhido por padrão, só na aba matched */}
      {showMatched && (
        <>
          <SectionHeader
            title="Já batem"
            hint="Conferidos — geralmente não precisa mexer."
            count={match.matched.length}
            tone="var(--green)"
            action={
              match.matched.length > 8 ? (
                <button
                  type="button"
                  onClick={() => setMatchedOpen(v => !v)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {matchedOpen ? "Recolher" : "Ver lista"}
                </button>
              ) : undefined
            }
          />
          {match.matched.length === 0 ? (
            <Empty>Nenhuma linha emparelhada.</Empty>
          ) : (
            (matchedOpen || match.matched.length <= 8 ? match.matched : match.matched.slice(0, 0)).map(
              pair => (
                <div key={pair.imported.id + pair.app.installmentId} style={row}>
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
              ),
            )
          )}
          {!matchedOpen && match.matched.length > 8 && (
            <Empty>
              {match.matched.length} itens conferidos. Toque em “Ver lista” se quiser revisar.
            </Empty>
          )}
        </>
      )}

      {attentionCount === 0 && tab !== "matched" && match.matched.length > 0 && (
        <Empty>Tudo conferido. Abra “Já batem” se quiser revisar a lista.</Empty>
      )}

      {/* CTA fixo só quando há seleção */}
      {selectedCount > 0 && (
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
            disabled={adding}
            onClick={onAddSelected}
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
              cursor: adding ? "wait" : "pointer",
              minHeight: 48,
            }}
          >
            {adding ? "Adicionando…" : `Adicionar ${selectedCount} ao app`}
          </button>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          marginTop: 4,
          color: warn ? "var(--amber)" : "var(--text-1)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        R$ {fmt(value)}
      </div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p style={{ padding: "14px 16px", fontSize: 13, color: "var(--text-3)", margin: 0 }}>
      {children}
    </p>
  );
}

const row: CSSProperties = {
  padding: "12px 16px",
  borderTop: "1px solid var(--border)",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const sectionHead: CSSProperties = {
  padding: "12px 16px 8px",
  background: "var(--bg-elevated)",
  borderTop: "1px solid var(--border)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const secondaryBtn: CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  color: "var(--accent)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const pickerItem: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-input)",
  color: "var(--text-1)",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};
