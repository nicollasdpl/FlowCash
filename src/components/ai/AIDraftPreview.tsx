"use client";
import { AlertTriangle, X } from "lucide-react";
import CategoryIcon, { iconLabel } from "@/components/CategoryIcon";
import type { AIItem } from "@/lib/ai/types";
import { Package } from "lucide-react";
import { AIMixedAnswerBanner } from "./AIChatThread";
import { SparkleIcon, fmt } from "./shared";

export type TxDraft = {
  amount: string;
  description: string;
  categoryId: string;
  accountId: string;
  paymentDate: string;
  status: "paid" | "pending";
};

export type PurchaseDraft = {
  amount: string;
  description: string;
  categoryId: string;
  cardId: string;
  purchaseDate: string;
  totalInstallments: string;
};

export type DraftItem =
  | { uid: string; intent: "transaction"; type: "income" | "expense"; tx: TxDraft }
  | { uid: string; intent: "card_purchase"; purchase: PurchaseDraft };

type DraftCardProps = {
  draft: DraftItem;
  categories: { id: string; name: string; type: "income" | "expense"; color: string; icon: string }[];
  accounts: { id: string; name: string; icon: string; active: boolean }[];
  cards: { id: string; name: string; brand: string }[];
  readOnly?: boolean;
  onUpdateTx: (patch: Partial<TxDraft>) => void;
  onUpdatePurchase: (patch: Partial<PurchaseDraft>) => void;
  onRemove: () => void;
};

function DraftCard({
  draft,
  categories,
  accounts,
  cards,
  readOnly = false,
  onUpdateTx,
  onUpdatePurchase,
  onRemove,
}: DraftCardProps) {
  const isTx = draft.intent === "transaction";
  const categoryId = isTx ? draft.tx.categoryId : draft.purchase.categoryId;
  const editCat = categories.find(c => c.id === categoryId);
  const unknownCat = !categoryId;

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${unknownCat ? "var(--amber-20)" : "var(--border-accent)"}`,
        borderRadius: "16px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "7px 10px 7px 14px",
          background: unknownCat ? "var(--amber-10)" : "var(--accent-10)",
          borderBottom: `1px solid ${unknownCat ? "var(--amber-20)" : "var(--border-accent)"}`,
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {unknownCat ? (
          <AlertTriangle size={11} strokeWidth={1.5} color="var(--amber)" />
        ) : (
          <SparkleIcon size={11} />
        )}
        <span
          style={{
            flex: 1,
            fontSize: "10px",
            fontWeight: 700,
            color: unknownCat ? "var(--amber)" : "var(--accent)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {unknownCat ? "Categoria não reconhecida, selecione" : isTx ? "Lançamento" : "Compra no cartão"}
        </span>
        {!readOnly && (
          <button
            onClick={onRemove}
            aria-label="Remover este lançamento"
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "8px",
              background: "transparent",
              border: "none",
              color: "var(--text-3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      <fieldset disabled={readOnly} style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px", border: "none", margin: 0, minWidth: 0 }}>
        {draft.intent === "transaction" ? (
          (() => {
            const tx = draft.tx;
            const txCategories = categories.filter(c => c.type === draft.type);
            const parsedAmount = parseFloat(tx.amount.replace(",", "."));
            const isIncome = draft.type === "income";
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "13px",
                      flexShrink: 0,
                      background: editCat ? `${editCat.color}18` : "var(--bg-input)",
                      border: `1px solid ${editCat ? editCat.color + "28" : "var(--border)"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {editCat?.icon ? (
                      <CategoryIcon icon={editCat.icon} color={editCat.color} size={20} />
                    ) : (
                      <Package size={20} strokeWidth={1.5} color="var(--text-3)" />
                    )}
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
                  <input className="form-input" type="text" value={tx.description} onChange={e => onUpdateTx({ description: e.target.value })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Valor (R$)</label>
                  <input
                    className="form-input mono"
                    type="text"
                    inputMode="decimal"
                    value={tx.amount}
                    onChange={e => onUpdateTx({ amount: e.target.value.replace(/[^0-9.,]/g, "") })}
                    style={{ fontSize: "20px" }}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Categoria</label>
                  <select
                    className="form-input"
                    value={tx.categoryId}
                    onChange={e => onUpdateTx({ categoryId: e.target.value })}
                    style={unknownCat ? { borderColor: "var(--amber-20)" } : undefined}
                  >
                    <option value="">Selecione uma categoria</option>
                    {txCategories.map(c => (
                      <option key={c.id} value={c.id}>
                        {iconLabel(c.icon, c.name)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Conta</label>
                  <select className="form-input" value={tx.accountId} onChange={e => onUpdateTx({ accountId: e.target.value })}>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.icon} {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Data</label>
                  <input className="form-input" type="date" value={tx.paymentDate} onChange={e => onUpdateTx({ paymentDate: e.target.value })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Status</label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {(
                      [
                        { key: "paid" as const, label: "Pago", bg: "var(--green-10)", border: "var(--green-20)", color: "var(--green)" },
                        { key: "pending" as const, label: "A pagar", bg: "var(--amber-10)", border: "var(--amber-20)", color: "var(--amber)" },
                      ] as const
                    ).map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => onUpdateTx({ status: opt.key })}
                        style={{
                          flex: 1,
                          padding: "10px",
                          borderRadius: "10px",
                          background: tx.status === opt.key ? opt.bg : "var(--bg-input)",
                          border: `1px solid ${tx.status === opt.key ? opt.border : "var(--border)"}`,
                          color: tx.status === opt.key ? opt.color : "var(--text-3)",
                          fontWeight: 700,
                          fontSize: "13px",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          minHeight: "44px",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            );
          })()
        ) : (
          (() => {
            const purchase = draft.purchase;
            const expenseCategories = categories.filter(c => c.type === "expense");
            const parsedAmount = parseFloat(purchase.amount.replace(",", "."));
            const parsedInstallments = Math.max(1, parseInt(purchase.totalInstallments) || 1);
            const installmentValue = !isNaN(parsedAmount) && parsedInstallments > 1 ? parsedAmount / parsedInstallments : null;
            const editCard = cards.find(c => c.id === purchase.cardId);
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "13px",
                      flexShrink: 0,
                      background: editCat ? `${editCat.color}18` : "var(--bg-input)",
                      border: `1px solid ${editCat ? editCat.color + "28" : "var(--border)"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {editCat?.icon ? (
                      <CategoryIcon icon={editCat.icon} color={editCat.color} size={20} />
                    ) : (
                      <Package size={20} strokeWidth={1.5} color="var(--text-3)" />
                    )}
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
                  <input className="form-input" type="text" value={purchase.description} onChange={e => onUpdatePurchase({ description: e.target.value })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Valor total (R$)</label>
                  <input
                    className="form-input mono"
                    type="text"
                    inputMode="decimal"
                    value={purchase.amount}
                    onChange={e => onUpdatePurchase({ amount: e.target.value.replace(/[^0-9.,]/g, "") })}
                    style={{ fontSize: "20px" }}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Parcelas</label>
                  <input
                    className="form-input mono"
                    type="text"
                    inputMode="numeric"
                    value={purchase.totalInstallments}
                    onChange={e => onUpdatePurchase({ totalInstallments: e.target.value.replace(/[^0-9]/g, "") })}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Categoria</label>
                  <select
                    className="form-input"
                    value={purchase.categoryId}
                    onChange={e => onUpdatePurchase({ categoryId: e.target.value })}
                    style={unknownCat ? { borderColor: "var(--amber-20)" } : undefined}
                  >
                    <option value="">Selecione uma categoria</option>
                    {expenseCategories.map(c => (
                      <option key={c.id} value={c.id}>
                        {iconLabel(c.icon, c.name)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Cartão</label>
                  <select className="form-input" value={purchase.cardId} onChange={e => onUpdatePurchase({ cardId: e.target.value })}>
                    {cards.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.brand})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Data da compra</label>
                  <input className="form-input" type="date" value={purchase.purchaseDate} onChange={e => onUpdatePurchase({ purchaseDate: e.target.value })} />
                </div>
              </>
            );
          })()
        )}
      </fieldset>
    </div>
  );
}

type AIDraftPreviewProps = {
  drafts: DraftItem[];
  mixedAnswer?: string;
  truncated?: boolean;
  categories: DraftCardProps["categories"];
  accounts: DraftCardProps["accounts"];
  cards: DraftCardProps["cards"];
  canConfirm: boolean;
  onUpdateTx: (uid: string, patch: Partial<TxDraft>) => void;
  onUpdatePurchase: (uid: string, patch: Partial<PurchaseDraft>) => void;
  onRemoveDraft: (uid: string) => void;
  onConfirm: () => void;
  onDiscard: () => void;
};

export function AIDraftPreview({
  drafts,
  mixedAnswer,
  truncated,
  categories,
  accounts,
  cards,
  canConfirm,
  onUpdateTx,
  onUpdatePurchase,
  onRemoveDraft,
  onConfirm,
  onDiscard,
}: AIDraftPreviewProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", animation: "fadeIn 0.25s ease" }}>
      {mixedAnswer && <AIMixedAnswerBanner answer={mixedAnswer} />}

      {truncated && (
        <div
          style={{
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "var(--amber-10)",
            border: "1px solid var(--amber-20)",
            borderRadius: "12px",
          }}
        >
          <AlertTriangle size={16} strokeWidth={1.5} color="var(--amber)" />
          <p style={{ fontSize: "12px", color: "var(--amber)", fontWeight: 600, lineHeight: 1.4 }}>
            Limite de 5 transações por mensagem. As primeiras 5 foram processadas.
          </p>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 4px" }}>
        <SparkleIcon size={12} />
        <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {drafts.length === 1 ? "1 lançamento detectado" : `${drafts.length} lançamentos detectados`} — edite ou remova individualmente
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {drafts.map(draft => (
          <DraftCard
            key={draft.uid}
            draft={draft}
            categories={categories}
            accounts={accounts}
            cards={cards}
            onUpdateTx={patch => onUpdateTx(draft.uid, patch)}
            onUpdatePurchase={patch => onUpdatePurchase(draft.uid, patch)}
            onRemove={() => onRemoveDraft(draft.uid)}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px", paddingTop: "2px" }}>
        <button
          onClick={onConfirm}
          disabled={!canConfirm}
          style={{
            flex: 1,
            padding: "14px",
            background: canConfirm ? "var(--accent)" : "var(--bg-input)",
            border: canConfirm ? "none" : "1px solid var(--border)",
            borderRadius: "12px",
            color: canConfirm ? "#06100E" : "var(--text-3)",
            fontSize: "14px",
            fontWeight: 700,
            cursor: canConfirm ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          {drafts.length === 1 ? "Confirmar" : `Confirmar ${drafts.length}`}
        </button>
        <button
          onClick={onDiscard}
          style={{
            flex: 1,
            padding: "14px",
            background: "var(--bg-input)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            color: "var(--text-2)",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Descartar tudo
        </button>
      </div>
    </div>
  );
}

export function itemToDraft(item: AIItem, newId: () => string): DraftItem {
  const uid = newId();
  if (item.intent === "transaction") {
    return {
      uid,
      intent: "transaction",
      type: item.type,
      tx: {
        amount: String(item.amount),
        description: item.description,
        categoryId: item.categoryId ?? "",
        accountId: item.accountId,
        paymentDate: item.paymentDate,
        status: item.status === "overdue" ? "pending" : item.status,
      },
    };
  }
  return {
    uid,
    intent: "card_purchase",
    purchase: {
      amount: String(item.amount),
      description: item.description,
      categoryId: item.categoryId ?? "",
      cardId: item.cardId,
      purchaseDate: item.purchaseDate,
      totalInstallments: String(item.totalInstallments),
    },
  };
}
