import { describe, expect, it } from "vitest";
import { sanitizeActions, sanitizeTransactions } from "../sanitizeTransactions";

describe("sanitizeTransactions", () => {
  const base = {
    categoryIds: new Set(["cat1"]),
    accountIds: new Set(["acc1"]),
    cardIds: new Set(["card1"]),
    firstAccountId: "acc1",
    firstCardId: "card1",
    today: "2026-06-16",
  };

  it("sanitiza transação válida", () => {
    const items = sanitizeTransactions({
      ...base,
      items: [
        {
          intent: "transaction",
          type: "expense",
          amount: 50,
          description: "iFood",
          categoryId: "cat1",
          accountId: "acc1",
          confidence: "high",
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.intent).toBe("transaction");
    if (items[0]?.intent === "transaction") {
      expect(items[0].amount).toBe(50);
      expect(items[0].confidence).toBe("high");
    }
  });

  it("rebaixa confidence quando categoria inválida", () => {
    const items = sanitizeTransactions({
      ...base,
      items: [{ intent: "transaction", amount: 20, categoryId: "invalid", accountId: "acc1", confidence: "high" }],
    });

    expect(items[0]?.confidence).toBe("low");
    expect(items[0]?.categoryId).toBeNull();
  });

  it("com contextCardId, despesa vira compra no cartão", () => {
    const items = sanitizeTransactions({
      ...base,
      contextCardId: "card1",
      items: [
        {
          intent: "transaction",
          type: "expense",
          amount: 80,
          description: "Mercado",
          categoryId: "cat1",
          accountId: "acc1",
          confidence: "high",
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.intent).toBe("card_purchase");
    if (items[0]?.intent === "card_purchase") {
      expect(items[0].cardId).toBe("card1");
      expect(items[0].amount).toBe(80);
    }
  });

  it("com contextCardId, receita permanece transação", () => {
    const items = sanitizeTransactions({
      ...base,
      contextCardId: "card1",
      items: [
        {
          intent: "transaction",
          type: "income",
          amount: 100,
          description: "Pix",
          categoryId: "cat1",
          accountId: "acc1",
          confidence: "high",
        },
      ],
    });

    expect(items[0]?.intent).toBe("transaction");
    if (items[0]?.intent === "transaction") {
      expect(items[0].type).toBe("income");
    }
  });

  it("sem contextCardId, card_purchase sem cardId vira transaction na conta", () => {
    const items = sanitizeTransactions({
      ...base,
      items: [
        {
          intent: "card_purchase",
          amount: 40,
          description: "iFood",
          categoryId: "cat1",
          confidence: "high",
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.intent).toBe("transaction");
    if (items[0]?.intent === "transaction") {
      expect(items[0].type).toBe("expense");
      expect(items[0].accountId).toBe("acc1");
    }
  });

  it("sem contextCardId, card_purchase com cardId válido permanece compra", () => {
    const items = sanitizeTransactions({
      ...base,
      items: [
        {
          intent: "card_purchase",
          amount: 40,
          description: "iFood no cartão",
          categoryId: "cat1",
          cardId: "card1",
          confidence: "high",
        },
      ],
    });

    expect(items[0]?.intent).toBe("card_purchase");
    if (items[0]?.intent === "card_purchase") {
      expect(items[0].cardId).toBe("card1");
    }
  });

  it("ignora amount inválido", () => {
    const items = sanitizeTransactions({
      ...base,
      items: [{ intent: "transaction", amount: 0, categoryId: "cat1", accountId: "acc1" }],
    });
    expect(items).toHaveLength(0);
  });
});

describe("sanitizeActions", () => {
  it("aceita delete_tx com id válido", () => {
    const actions = sanitizeActions({
      items: [
        {
          action: "delete_tx",
          targetId: "tx1",
          targetDescription: "iFood",
          targetAmount: 50,
          confidence: "high",
        },
      ],
      validTxIds: new Set(["tx1"]),
      validPurchaseIds: new Set(),
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]?.action).toBe("delete_tx");
  });

  it("descarta id inválido", () => {
    const actions = sanitizeActions({
      items: [{ action: "delete_tx", targetId: "tx999", targetDescription: "iFood" }],
      validTxIds: new Set(["tx1"]),
      validPurchaseIds: new Set(),
    });
    expect(actions).toHaveLength(0);
  });
});
