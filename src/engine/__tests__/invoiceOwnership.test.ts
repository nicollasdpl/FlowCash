import { describe, expect, it } from "vitest";
import { generateInstallments } from "../invoiceEngine";
import { getInstallmentsForResponsible, getInvoiceOwnershipTotals } from "../invoiceOwnership";
import { getProjectedBalance } from "../financialEngine";
import { getSpentByCategory } from "../budgetEngine";
import type { Account, CardPurchase, CreditCard } from "@/types/financial";

const account: Account = {
  id: "account", name: "Conta", type: "checking", initialBalance: 1000,
  initialDate: "2026-01-01", color: "#000", icon: "Wallet", active: true,
};
const card: CreditCard = {
  id: "card", name: "Cartão", lastDigits: "1234", brand: "Visa", totalLimit: 5000,
  closingDay: 10, dueDay: 20, paymentAccountId: account.id, color: "#000", active: true,
};

function purchase(id: string, amount: number, responsiblePerson?: string, totalInstallments = 1): CardPurchase {
  return {
    id, cardId: card.id, amount, description: id, categoryId: "gasolina",
    purchaseDate: "2026-10-01", totalInstallments, responsiblePerson,
    createdAt: "2026-10-01T12:00:00.000Z",
  };
}

describe("responsável pela compra na fatura", () => {
  it("mantém o total bruto e separa apenas as parcelas de outra pessoa", () => {
    const mine = purchase("mine", 100);
    const mother = purchase("mother", 200, "Mãe", 2);
    const installments = [...generateInstallments(mine, card), ...generateInstallments(mother, card)];
    const october = getInvoiceOwnershipTotals(installments.filter(i => i.competenceMonth === "2026-10"), [mine, mother]);
    const november = getInvoiceOwnershipTotals(installments.filter(i => i.competenceMonth === "2026-11"), [mine, mother]);

    expect(october).toEqual({ total: 200, mine: 100, others: 100, byPerson: { Mãe: 100 } });
    expect(november).toEqual({ total: 100, mine: 0, others: 100, byPerson: { Mãe: 100 } });
    expect(october.mine + october.others).toBe(october.total);
  });

  it("projeta somente a minha parte na conta, sem perder o total da fatura", () => {
    const mine = purchase("mine", 100);
    const mother = purchase("mother", 200, "Mãe");
    const purchases = [mine, mother];
    const installments = purchases.flatMap(p => generateInstallments(p, card));

    expect(getInvoiceOwnershipTotals(installments, purchases).total).toBe(300);
    expect(getProjectedBalance(account, [], "2026-10-31", [card], installments, purchases)).toBe(900);
    expect(getProjectedBalance(account, [], "2026-10-31", [card], generateInstallments(mother, card), [mother])).toBe(1000);
    expect(getSpentByCategory("2026-10", [], installments, purchases)).toEqual({ gasolina: 100 });
  });

  it("trata compras antigas sem responsável como minhas", () => {
    const old = purchase("old", 75);
    expect(getInvoiceOwnershipTotals(generateInstallments(old, card), [old]).mine).toBe(75);
  });

  it("preserva os centavos de uma compra de terceiro parcelada", () => {
    const mother = purchase("mother", 200, "Mãe", 3);
    const installments = generateInstallments(mother, card);
    const months = installments.map(i => getInvoiceOwnershipTotals([i], [mother]));

    expect(months.map(m => m.others)).toEqual([66.67, 66.67, 66.66]);
    expect(months.reduce((sum, m) => sum + m.others, 0)).toBe(200);
    expect(months.every(m => m.mine === 0 && m.total === m.others)).toBe(true);
  });

  it("filtra todas as parcelas pela pessoa sem alterar os totais da fatura", () => {
    const mine = purchase("mine", 80);
    const mother = purchase("mother", 200, "Mãe", 2);
    const john = purchase("john", 30, "João");
    const purchases = [mine, mother, john];
    const october = purchases.flatMap(p => generateInstallments(p, card))
      .filter(i => i.competenceMonth === "2026-10");

    expect(getInstallmentsForResponsible(october, purchases, "Mãe").map(i => i.purchaseId)).toEqual(["mother"]);
    expect(getInstallmentsForResponsible(october, purchases, "").map(i => i.purchaseId)).toEqual(["mine"]);
    expect(getInstallmentsForResponsible(october, purchases, null)).toBe(october);
    expect(getInvoiceOwnershipTotals(october, purchases).total).toBe(210);
  });

  it("não exige categoria para uma compra integral de outra pessoa", () => {
    const mother = { ...purchase("mother", 200, "Mãe"), categoryId: "" };
    const installments = generateInstallments(mother, card);
    expect(getInvoiceOwnershipTotals(installments, [mother]).byPerson).toEqual({ Mãe: 200 });
    expect(getSpentByCategory("2026-10", [], installments, [mother])).toEqual({});
  });
});
