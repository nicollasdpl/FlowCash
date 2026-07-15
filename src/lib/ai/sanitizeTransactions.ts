import type { AIItem } from "./types";

export const MAX_TX = 5;

type RawItem = Record<string, unknown>;

export type SanitizeInput = {
  items: unknown[];
  categoryIds: Set<string>;
  accountIds: Set<string>;
  cardIds: Set<string>;
  firstAccountId: string;
  firstCardId: string;
  today: string;
  /** Quando o copiloto foi aberto na página de um cartão, despesas viram compras nele. */
  contextCardId?: string;
};

export function sanitizeTransactions(input: SanitizeInput): AIItem[] {
  const { items, categoryIds, accountIds, cardIds, firstAccountId, firstCardId, today, contextCardId } = input;
  const forcedCardId =
    contextCardId && cardIds.has(contextCardId) ? contextCardId : null;
  const sanitized: AIItem[] = [];

  for (const raw of items.slice(0, MAX_TX)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as RawItem;

    const intent = r.intent === "card_purchase" ? "card_purchase" : "transaction";

    let amount: number;
    if (typeof r.amount === "string") {
      const n = parseFloat(r.amount.replace(/\./g, "").replace(",", "."));
      amount = isNaN(n) ? 0 : n;
    } else if (typeof r.amount === "number") {
      amount = r.amount;
    } else {
      amount = 0;
    }
    if (!amount || amount <= 0) continue;

    const description = typeof r.description === "string" ? r.description : "";
    let confidence: "high" | "low" = r.confidence === "high" ? "high" : "low";

    const rawCategoryId = typeof r.categoryId === "string" ? r.categoryId : "";
    const categoryId = rawCategoryId && categoryIds.has(rawCategoryId) ? rawCategoryId : null;
    if (!categoryId) confidence = "low";

    if (intent === "transaction") {
      const type = r.type === "income" ? "income" : "expense";
      const paymentDate = typeof r.paymentDate === "string" && r.paymentDate ? r.paymentDate : today;
      const competenceDate =
        typeof r.competenceDate === "string" && r.competenceDate ? r.competenceDate : paymentDate;

      // Copiloto aberto no cartão: despesa → compra nesse cartão (não PIX/conta).
      if (forcedCardId && type === "expense") {
        const totalInstallments =
          typeof r.totalInstallments === "number" && r.totalInstallments > 0
            ? Math.floor(r.totalInstallments)
            : 1;
        sanitized.push({
          intent: "card_purchase",
          amount,
          description,
          categoryId,
          cardId: forcedCardId,
          purchaseDate: paymentDate,
          totalInstallments,
          confidence,
        });
        continue;
      }

      const rawAccountId = typeof r.accountId === "string" ? r.accountId : "";
      const validRawAccount = Boolean(rawAccountId) && accountIds.has(rawAccountId);
      const accountId = validRawAccount ? rawAccountId : firstAccountId;
      if (!validRawAccount) confidence = "low";

      const status = r.status === "pending" || r.status === "overdue" ? "pending" : "paid";

      sanitized.push({
        intent,
        type,
        amount,
        description,
        categoryId,
        accountId,
        competenceDate,
        paymentDate,
        status,
        confidence,
      });
    } else {
      const rawCardId = typeof r.cardId === "string" ? r.cardId : "";
      const validRawCard = Boolean(rawCardId) && cardIds.has(rawCardId);
      const purchaseDate = typeof r.purchaseDate === "string" && r.purchaseDate ? r.purchaseDate : today;
      const totalInstallments =
        typeof r.totalInstallments === "number" && r.totalInstallments > 0
          ? Math.floor(r.totalInstallments)
          : 1;

      // Fora da página do cartão: sem cardId válido, não inventa o 1º cartão —
      // vira despesa na conta (padrão do dashboard).
      if (!forcedCardId && !validRawCard) {
        sanitized.push({
          intent: "transaction",
          type: "expense",
          amount,
          description,
          categoryId,
          accountId: firstAccountId,
          competenceDate: purchaseDate,
          paymentDate: purchaseDate,
          status: "paid",
          confidence: "low",
        });
        continue;
      }

      const cardId = forcedCardId ?? (validRawCard ? rawCardId : firstCardId);
      if (!validRawCard && !forcedCardId) confidence = "low";

      sanitized.push({
        intent,
        amount,
        description,
        categoryId,
        cardId,
        purchaseDate,
        totalInstallments,
        confidence,
      });
    }
  }

  return sanitized;
}

export type SanitizeActionInput = {
  items: unknown[];
  validTxIds: Set<string>;
  validPurchaseIds: Set<string>;
};

export type SanitizedAction = {
  action: "delete_tx" | "update_tx" | "delete_purchase";
  targetId: string;
  targetDescription: string;
  targetDate?: string;
  targetAmount?: number;
  patch?: {
    amount?: number;
    description?: string;
    categoryId?: string;
    accountId?: string;
    paymentDate?: string;
    status?: "paid" | "pending";
  };
  confidence: "high" | "low";
};

export function sanitizeActions(input: SanitizeActionInput): SanitizedAction[] {
  const { items, validTxIds, validPurchaseIds } = input;
  const out: SanitizedAction[] = [];

  for (const raw of items.slice(0, 3)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as RawItem;

    const actionType = r.action;
    if (actionType !== "delete_tx" && actionType !== "update_tx" && actionType !== "delete_purchase") continue;

    const targetId = typeof r.targetId === "string" ? r.targetId : "";
    const valid =
      (actionType === "delete_purchase" && validPurchaseIds.has(targetId)) ||
      ((actionType === "delete_tx" || actionType === "update_tx") && validTxIds.has(targetId));
    if (!valid) continue;

    const targetDescription = typeof r.targetDescription === "string" ? r.targetDescription : "";
    const targetDate = typeof r.targetDate === "string" ? r.targetDate : undefined;
    const targetAmount = typeof r.targetAmount === "number" ? r.targetAmount : undefined;
    let confidence: "high" | "low" = r.confidence === "high" ? "high" : "low";
    if (!targetDescription) confidence = "low";

    let patch: SanitizedAction["patch"];
    if (actionType === "update_tx" && r.patch && typeof r.patch === "object") {
      const p = r.patch as RawItem;
      patch = {};
      if (typeof p.amount === "number" && p.amount > 0) patch.amount = p.amount;
      if (typeof p.description === "string") patch.description = p.description;
      if (typeof p.categoryId === "string") patch.categoryId = p.categoryId;
      if (typeof p.accountId === "string") patch.accountId = p.accountId;
      if (typeof p.paymentDate === "string") patch.paymentDate = p.paymentDate;
      if (p.status === "paid" || p.status === "pending") patch.status = p.status;
      if (Object.keys(patch).length === 0) patch = undefined;
    }

    out.push({
      action: actionType,
      targetId,
      targetDescription,
      targetDate,
      targetAmount,
      patch,
      confidence,
    });
  }

  return out;
}
