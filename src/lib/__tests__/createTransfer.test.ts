import { describe, expect, it } from "vitest";
import type { Account, Transaction } from "@/types/financial";
import { SEED_INTERNAL_TRANSFER_CATEGORY_ID } from "@/types/financial";
import { buildTransferTransaction, validateTransferAmount } from "@/lib/createTransfer";

const checking: Account = {
  id: "acc_checking",
  name: "Corrente",
  type: "checking",
  initialBalance: 1000,
  initialDate: "2026-01-01",
  color: "#22D47A",
  icon: "🏦",
  active: true,
};

const box: Account = {
  id: "acc_box",
  name: "Viagem",
  type: "investment",
  initialBalance: 0,
  initialDate: "2026-01-01",
  color: "#00E5C3",
  icon: "📈",
  active: true,
};

describe("createTransfer", () => {
  it("bloqueia valor maior que o saldo da origem", () => {
    const err = validateTransferAmount(1500, checking, []);
    expect(err).toMatch(/Saldo insuficiente/);
  });

  it("aceita valor dentro do saldo", () => {
    expect(validateTransferAmount(500, checking, [])).toBeNull();
  });

  it("monta transferência com categoria de sistema", () => {
    const tx = buildTransferTransaction({
      id: "tx1",
      fromAccountId: checking.id,
      toAccountId: box.id,
      amount: 200,
      date: "2026-03-14",
      description: "Guardar em Viagem",
      createdAt: "2026-03-14T12:00:00.000Z",
    });

    expect(tx).toMatchObject({
      type: "transfer",
      accountId: checking.id,
      transferToAccountId: box.id,
      amount: 200,
      status: "paid",
      categoryId: SEED_INTERNAL_TRANSFER_CATEGORY_ID,
      origin: "manual",
    } satisfies Partial<Transaction>);
  });
});
