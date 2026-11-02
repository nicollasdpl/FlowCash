import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as XLSX from "xlsx";
import {
  SHEET_NAMES,
  buildAnalysisWorkbook,
  getAnalysisSheetNames,
} from "../buildAnalysisWorkbook";

describe("buildAnalysisWorkbook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gera todas as abas esperadas", () => {
    const wb = buildAnalysisWorkbook({
      accounts: [
        {
          id: "acc1",
          name: "Nubank",
          type: "checking",
          initialBalance: 1000,
          initialDate: "2026-01-01",
          color: "#000",
          icon: "Wallet",
          active: true,
        },
      ],
      transactions: [
        {
          id: "tx1",
          accountId: "acc1",
          type: "income",
          amount: 3000,
          description: "Salário",
          categoryId: "cat_salario",
          competenceDate: "2026-07-05",
          paymentDate: "2026-07-05",
          status: "paid",
          isRecurring: false,
          origin: "manual",
          createdAt: "2026-07-05T00:00:00Z",
        },
        {
          id: "tx2",
          accountId: "acc1",
          type: "expense",
          amount: 50,
          description: "Mercado",
          categoryId: "cat_alimentacao",
          competenceDate: "2026-07-10",
          paymentDate: "2026-07-10",
          status: "paid",
          isRecurring: false,
          origin: "manual",
          createdAt: "2026-07-10T00:00:00Z",
        },
        {
          id: "tx3",
          accountId: "acc1",
          type: "expense",
          amount: 120,
          description: "Aluguel previsto",
          categoryId: "cat_moradia",
          competenceDate: "2026-08-01",
          paymentDate: "2026-08-01",
          status: "pending",
          isRecurring: false,
          origin: "manual",
          createdAt: "2026-07-01T00:00:00Z",
        },
      ],
      categories: [
        { id: "cat_salario", name: "Salário", type: "income", color: "#0f0", icon: "Wallet" },
        { id: "cat_alimentacao", name: "Alimentação", type: "expense", color: "#f00", icon: "Utensils" },
        { id: "cat_moradia", name: "Moradia", type: "expense", color: "#ff0", icon: "Home" },
        {
          id: "loan_income",
          name: "Empréstimo",
          type: "income",
          color: "#0f0",
          icon: "Landmark",
          excludeFromReports: true,
        },
      ],
      budgets: [
        { id: "b1", categoryId: "cat_alimentacao", limitAmount: 500, month: "2026-07" },
      ],
      cards: [
        {
          id: "card1",
          name: "Bradesco",
          lastDigits: "1234",
          brand: "Visa",
          totalLimit: 5000,
          closingDay: 10,
          dueDay: 17,
          paymentAccountId: "acc1",
          color: "#00f",
          active: true,
        },
      ],
      purchases: [
        {
          id: "p1",
          cardId: "card1",
          amount: 100,
          description: "Uber",
          categoryId: "cat_alimentacao",
          purchaseDate: "2026-07-02",
          totalInstallments: 1,
          createdAt: "2026-07-02T00:00:00Z",
        },
      ],
      installments: [
        {
          id: "i1",
          purchaseId: "p1",
          cardId: "card1",
          installmentNumber: 1,
          totalInstallments: 1,
          amount: 100,
          competenceMonth: "2026-07",
          paid: false,
        },
      ],
      goals: [
        {
          id: "g1",
          name: "Viagem",
          emoji: "✈️",
          targetAmount: 2000,
          currentAmount: 500,
          deadline: "2026-12-31",
          accountId: "acc1",
          color: "#0af",
          completed: false,
        },
      ],
    });

    expect(getAnalysisSheetNames(wb)).toEqual([...SHEET_NAMES]);

    const resumo = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Resumo);
    expect(resumo[0]).toMatchObject({
      secao: "mes_atual",
      mes: "2026-07",
      receita: 3000,
    });
    expect(Number(resumo[0].despesa)).toBeGreaterThanOrEqual(50);

    const txs = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Transacoes);
    expect(txs).toHaveLength(3);
    expect(txs.some(t => t.descricao === "Salário")).toBe(true);

    const previstos = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Previstos);
    expect(previstos.some(p => p.descricao === "Aluguel previsto")).toBe(true);
    expect(previstos.some(p => p.descricao === "Uber")).toBe(true);

    const metas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Metas);
    expect(metas[0]).toMatchObject({ nome: "Viagem", percentual: 25 });
  });

  it("exclui receita com excludeFromReports do resumo", () => {
    const wb = buildAnalysisWorkbook({
      accounts: [
        {
          id: "acc1",
          name: "Conta",
          type: "checking",
          initialBalance: 0,
          initialDate: "2026-01-01",
          color: "#000",
          icon: "Wallet",
          active: true,
        },
      ],
      transactions: [
        {
          id: "tx1",
          accountId: "acc1",
          type: "income",
          amount: 500,
          description: "Empréstimo PIX",
          categoryId: "loan_income",
          competenceDate: "2026-07-01",
          paymentDate: "2026-07-01",
          status: "paid",
          isRecurring: false,
          origin: "manual",
          createdAt: "2026-07-01T00:00:00Z",
        },
        {
          id: "tx2",
          accountId: "acc1",
          type: "income",
          amount: 2000,
          description: "Salário",
          categoryId: "cat_salario",
          competenceDate: "2026-07-05",
          paymentDate: "2026-07-05",
          status: "paid",
          isRecurring: false,
          origin: "manual",
          createdAt: "2026-07-05T00:00:00Z",
        },
      ],
      categories: [
        { id: "cat_salario", name: "Salário", type: "income", color: "#0f0", icon: "Wallet" },
        {
          id: "loan_income",
          name: "Empréstimo",
          type: "income",
          color: "#0f0",
          icon: "Landmark",
          excludeFromReports: true,
        },
      ],
      budgets: [],
      cards: [],
      purchases: [],
      installments: [],
      goals: [],
    });

    const resumo = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Resumo);
    expect(resumo[0].receita).toBe(2000);
  });

  it("exporta somente a parte própria em fatura pessoal e previstos", () => {
    const wb = buildAnalysisWorkbook({
      accounts: [], transactions: [], categories: [], budgets: [], goals: [],
      cards: [{ id: "card", name: "Cartão", lastDigits: "1234", brand: "Visa", totalLimit: 1000,
        closingDay: 10, dueDay: 20, paymentAccountId: "account", color: "#000", active: true }],
      purchases: [
        { id: "mine", cardId: "card", amount: 100, description: "Minha", categoryId: "cat", purchaseDate: "2026-07-01", totalInstallments: 1, createdAt: "" },
        { id: "mother", cardId: "card", amount: 200, description: "Mãe", categoryId: "", purchaseDate: "2026-07-01", totalInstallments: 1, responsiblePerson: "Mãe", createdAt: "" },
      ],
      installments: [
        { id: "i1", purchaseId: "mine", cardId: "card", installmentNumber: 1, totalInstallments: 1, amount: 100, competenceMonth: "2026-07", paid: false },
        { id: "i2", purchaseId: "mother", cardId: "card", installmentNumber: 1, totalInstallments: 1, amount: 200, competenceMonth: "2026-07", paid: false },
      ],
    });

    const cards = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Cartoes);
    const upcoming = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Previstos);
    const installments = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Parcelas);
    expect(cards[0]).toMatchObject({ fatura_mes: 100, minha_parte_a_pagar: 100, fatura_total_cartao: 300 });
    expect(upcoming.filter(row => row.origem === "cartao").map(row => row.descricao)).toEqual(["Minha"]);
    expect(installments).toEqual(expect.arrayContaining([
      expect.objectContaining({ descricao: "Mãe", responsavel: "Mãe", compromisso_pessoal: false }),
    ]));
  });
});
