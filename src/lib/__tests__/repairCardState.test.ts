import { describe, expect, it } from "vitest";
import { repairCardState, isCorruptedPurchaseAmount, recoverCorruptedAmount } from "../repairCardState";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";
import type { CardInstallment, CardPurchase, CreditCard, Transaction } from "@/types/financial";
import { getProjectedBalance } from "@/engine/financialEngine";

const card: CreditCard = {
  id: "card1",
  name: "Bradesco Signature",
  brand: "Visa",
  totalLimit: 5000,
  closingDay: 25,
  dueDay: 5,
  paymentAccountId: "acc1",
  active: true,
  createdAt: "2026-01-01",
};

const purchase: CardPurchase = {
  id: "c89a9264-c025-4e8e-bc39-65765a10bb71",
  cardId: "card1",
  amount: 1.24,
  description: "Empréstimo PicPay",
  categoryId: "loan_expense",
  purchaseDate: "2026-04-20",
  totalInstallments: 6,
  createdAt: "2026-04-20",
};

function inst(n: number, month: string, amount = 0.21, paid = false): CardInstallment {
  return {
    id: `${purchase.id}_inst_${n}`,
    purchaseId: purchase.id,
    cardId: "card1",
    installmentNumber: n,
    totalInstallments: 6,
    amount,
    competenceMonth: month,
    paid,
  };
}

describe("repairCardState", () => {
  it("detecta valor corrompido pelo parse pt-BR", () => {
    const installments = [1, 2, 3, 4, 5, 6].map(n => inst(n, `2026-0${n}`));
    expect(isCorruptedPurchaseAmount(purchase, installments)).toBe(true);
    expect(recoverCorruptedAmount(1.24)).toBe(1240);
  });

  it("restaura total e marca fatura já liquidada como paga", () => {
    const installments = [
      inst(1, "2026-05"),
      inst(2, "2026-06"),
      inst(3, "2026-07"),
      inst(4, "2026-08"),
      inst(5, "2026-09"),
      inst(6, "2026-10"),
    ];
    // Competência 2026-06 → vence 2026-07-05 → label Jul/26
    const transactions: Transaction[] = [
      {
        id: "pay1",
        accountId: "acc1",
        type: "expense",
        amount: 2000,
        description: "Pagamento Fatura Bradesco Signature Jul/26",
        categoryId: SEED_INVOICE_PAYMENT_CATEGORY_ID,
        competenceDate: "2026-07-05",
        paymentDate: "2026-07-05",
        status: "paid",
        isRecurring: false,
        origin: "invoice",
        createdAt: "2026-07-05",
      },
    ];

    const { state, changed } = repairCardState({
      cards: [card],
      purchases: [purchase],
      installments,
      transactions,
    });

    expect(changed).toBe(true);
    expect(state.purchases[0].amount).toBe(1240.62);
    const jun = state.installments.filter(i => i.competenceMonth === "2026-06");
    expect(jun.length).toBeGreaterThan(0);
    expect(jun.every(i => i.paid)).toBe(true);
    const jul = state.installments.filter(i => i.competenceMonth === "2026-07");
    expect(jul.every(i => !i.paid)).toBe(true);
  });

  it("projetado nao desconta fatura ja paga no extrato", () => {
    const account = {
      id: "acc1",
      name: "Nubank",
      type: "checking" as const,
      initialBalance: 2300,
      active: true,
      createdAt: "2026-01-01",
    };
    const installments = [inst(2, "2026-06", 206.77, false)];
    const transactions: Transaction[] = [
      {
        id: "pay1",
        accountId: "acc1",
        type: "expense",
        amount: 2000,
        description: "Pagamento Fatura Bradesco Signature Jul/26",
        categoryId: SEED_INVOICE_PAYMENT_CATEGORY_ID,
        competenceDate: "2026-07-05",
        paymentDate: "2026-07-05",
        status: "paid",
        isRecurring: false,
        origin: "invoice",
        createdAt: "2026-07-05",
      },
    ];
    const projected = getProjectedBalance(account, transactions, "2026-07-31", [card], installments);
    // 2300 - 2000 (pagamento já no extrato) = 300; sem descontar de novo os 206,77 "unpaid"
    expect(projected).toBe(300);

    const withoutGuard = getProjectedBalance(
      account,
      // remove matching payment → deve descontar a parcela unpaid
      transactions.map(t => ({ ...t, description: "Outro pagamento" })),
      "2026-07-31",
      [card],
      installments,
    );
    expect(withoutGuard).toBe(300 - 206.77);
  });
});
