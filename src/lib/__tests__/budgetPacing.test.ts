import { describe, expect, it } from "vitest";
import type { Account, CardInstallment, CardPurchase, CreditCard, Transaction } from "@/types/financial";
import {
  buildEvolutionSeries, buildWeekAnchor, buildWeekBarModel, buildLiveWeekBarModel, closeWeek, collectWeekVariableSpend,
  computeAvailable, computeDailyQuota, getWeekBounds, resolveWeekSnapshot,
  replaceWeekSnapshot, snapshotReadiness,
} from "@/lib/budgetPacing";

const account: Account = { id: "bank", name: "Conta", type: "checking", active: true, initialBalance: 0, initialDate: "2026-11-01", color: "", icon: "" };
const card: CreditCard = { id: "card", name: "Cartão", lastDigits: "1234", brand: "", totalLimit: 1000, closingDay: 10, dueDay: 20, paymentAccountId: "bank", color: "", active: true };
const tx = (id: string, date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id, accountId: "bank", type: "expense", amount, description: id, categoryId: "food",
  competenceDate: date, paymentDate: date, status: "paid", isRecurring: false,
  origin: "manual", createdAt: date, ...extra,
});
const purchase = (id: string, date: string, amount: number, extra: Partial<CardPurchase> = {}): CardPurchase => ({
  id, cardId: "card", amount, description: id, categoryId: "food", purchaseDate: date,
  totalInstallments: 1, createdAt: date, ...extra,
});
const installment = (id: string, competenceMonth: string, extra: Partial<CardInstallment> = {}): CardInstallment => ({
  id: `${id}_inst_1`, purchaseId: id, cardId: "card", installmentNumber: 1,
  totalInstallments: 1, amount: 20, competenceMonth, paid: false, ...extra,
});
function spend(date: string, data: {
  transactions?: Transaction[]; purchases?: CardPurchase[]; installments?: CardInstallment[];
} = {}) {
  return collectWeekVariableSpend({
    bounds: getWeekBounds(date), throughDate: date,
    accounts: [account], cards: [card], transactions: data.transactions ?? [],
    purchases: data.purchases ?? [], installments: data.installments ?? [],
  });
}

describe("calendário e cota", () => {
  it("corta a semana no início e no fim do mês", () => {
    expect(getWeekBounds("2026-11-01")).toEqual({ semanaInicio: "2026-11-01", semanaFim: "2026-11-01", diasNaSemana: 1 });
    expect(getWeekBounds("2026-11-04")).toEqual({ semanaInicio: "2026-11-02", semanaFim: "2026-11-08", diasNaSemana: 7 });
    expect(getWeekBounds("2026-11-30")).toEqual({ semanaInicio: "2026-11-30", semanaFim: "2026-11-30", diasNaSemana: 1 });
    expect(getWeekBounds("2026-08-31")).toEqual({ semanaInicio: "2026-08-31", semanaFim: "2026-08-31", diasNaSemana: 1 });
  });
  it("conta 28, 30 e 31 dias no mês e não limita estouro em zero", () => {
    for (const [date, days] of [["2027-02-01", 28], ["2026-11-02", 29], ["2026-07-01", 31]] as const) {
      const anchor = buildWeekAnchor(280, getWeekBounds(date), spend(date));
      expect(anchor.diasRestantesInicio).toBe(days);
    }
    expect(computeDailyQuota(-10, 2)).toBe(0);
    expect(computeAvailable(14, 2, 40)).toBe(-12);
  });
  it("calcula sem orçamentos nem seleção de categorias", () => {
    const loaded = { accounts: [account], transactions: [], cards: [], installments: [], purchases: [], budgets: [] };
    expect(snapshotReadiness(true, loaded)).toBe("ready");
    expect(buildWeekAnchor(280, getWeekBounds("2026-11-02"), spend("2026-11-02")).cotaDiaria).toBeGreaterThan(0);
  });
});

describe("gasto variável e âncora", () => {
  it("abertura na quarta recupera a mesma cota de segunda", () => {
    const bounds = getWeekBounds("2026-11-04");
    const weekSpend = spend("2026-11-04", { transactions: [tx("seg", "2026-11-02", 14), tx("ter", "2026-11-03", 14)] });
    expect(buildWeekAnchor(377.94, bounds, weekSpend).cotaDiaria).toBeCloseTo(405.94 / 29);
    expect(buildWeekAnchor(405.94, bounds, spend("2026-11-02")).cotaDiaria).toBeCloseTo(405.94 / 29);
  });
  it("soma de volta cartão com fatura neste mês; cartão do próximo mês continua no gasto", () => {
    const data = {
      purchases: [purchase("before", "2026-11-04", 20), purchase("after", "2026-11-12", 30)],
      installments: [installment("before", "2026-11"), installment("after", "2026-12")],
    };
    const thisMonth = spend("2026-11-04", data);
    expect(thisMonth.gastoCartaoRefletido).toBe(20);
    expect(buildWeekAnchor(80, getWeekBounds("2026-11-04"), thisMonth).freeInicio).toBe(100);
    const nextMonth = spend("2026-11-12", data);
    expect(nextMonth.gastoSemana).toBe(30);
    expect(nextMonth.gastoCartaoRefletido).toBe(0);
    expect(nextMonth.gastoCartaoForaDoMes).toBe(30);
    expect(buildWeekAnchor(100, getWeekBounds("2026-11-12"), nextMonth).freeInicio).toBe(100);
  });
  it("inclui despesas de qualquer categoria e exclui recorrência e pagamento de fatura", () => {
    const weekSpend = spend("2026-11-04", { transactions: [
      tx("food", "2026-11-03", 12),
      tx("other", "2026-11-03", 50, { categoryId: "other" }),
      tx("uncategorized", "2026-11-03", 7, { categoryId: "" }),
      tx("recurring", "2026-11-03", 30, { isRecurring: true }),
      tx("invoice", "2026-11-03", 100, { origin: "invoice", categoryId: "system_invoice_payment" }),
    ] });
    expect(weekSpend.gastoSemana).toBe(69);
    expect(weekSpend.gastoContaRefletido).toBe(69);
  });
  it("mantém parcelada fora da cota e mostra seu valor total", () => {
    const weekSpend = spend("2026-11-04", { purchases: [purchase("installments", "2026-11-03", 300, { totalInstallments: 3 })] });
    expect(weekSpend.gastoSemana).toBe(0);
    expect(weekSpend.parceladoNaSemana).toBe(300);
  });
});

describe("snapshot e barra", () => {
  const bounds = getWeekBounds("2026-11-04");
  const anchor = buildWeekAnchor(406, bounds, spend("2026-11-02"));
  it("preserva snapshot existente na segunda abertura e fecha uma vez", () => {
    const candidate = buildWeekAnchor(100, bounds, spend("2026-11-04"));
    expect(resolveWeekSnapshot(anchor, candidate)).toBe(anchor);
    const closed = closeWeek(anchor, 50);
    expect(closed.saldoSemana).toBeCloseTo(closed.cotaSemanal! - 50);
    expect(buildEvolutionSeries([anchor, closed])).toHaveLength(1);
  });
  it("acumula dia 1, 2 e 3 sem gasto, depois desconta gasto parcial", () => {
    const blank = spend("2026-11-04");
    for (let index = 0; index < 3; index++) {
      const model = buildWeekBarModel(anchor, `2026-11-0${index + 2}`, blank);
      expect(model.disponivelHoje).toBeCloseTo((index + 1) * anchor.cotaDiaria);
      expect(model.diaAtualIndex).toBe(index);
    }
    const partial = buildWeekBarModel(anchor, "2026-11-04", spend("2026-11-04", { transactions: [tx("food", "2026-11-03", 30)] }));
    expect(partial.disponivelHoje).toBeCloseTo(3 * anchor.cotaDiaria - 30);
  });
  it("mostra estouro negativo dentro da semana e acima da cota inteira", () => {
    const over = buildWeekBarModel(anchor, "2026-11-04", spend("2026-11-04", { transactions: [tx("over", "2026-11-04", 50)] }));
    expect(over.estado).toBe("estourou");
    expect(over.disponivelHoje).toBeLessThan(0);
    const huge = buildWeekBarModel(anchor, "2026-11-04", spend("2026-11-04", { transactions: [tx("huge", "2026-11-04", 120)] }));
    expect(huge.gastoSemana).toBeGreaterThan(huge.cotaSemanal);
    expect(huge.excedente).toBeGreaterThan(0);
    expect(huge.pctGasto).toBe(100);
  });
  it("expõe mês no vermelho, inclusive numa semana cortada", () => {
    const red = buildWeekBarModel(buildWeekAnchor(-20, getWeekBounds("2026-11-01"), spend("2026-11-01")), "2026-11-01", spend("2026-11-01"));
    expect(red.estado).toBe("mesNoVermelho");
    expect(red.deficitMes).toBe(20);
    expect(red.diasNaSemana).toBe(1);
  });
  it("bloqueia snapshot antes da hidratação remota e sem contas ou coleções carregadas", () => {
    const loaded = { accounts: [account], transactions: [], cards: [], installments: [], purchases: [], budgets: [] };
    expect(snapshotReadiness(false, loaded)).toBe("loading");
    expect(snapshotReadiness(true, { ...loaded, purchases: undefined })).toBe("loading");
    expect(snapshotReadiness(true, { ...loaded, accounts: [] })).toBe("no-account");
    expect(snapshotReadiness(true, loaded)).toBe("ready");
  });
  it("compra no cartão conta sem orçamento da categoria", () => {
    const weekSpend = spend("2026-11-04", { purchases: [purchase("other", "2026-11-03", 25, { categoryId: "unbudgeted" })] });
    expect(weekSpend.gastoSemana).toBe(25);
  });
  it("recálculo apaga e recria apenas após confirmar dados prontos", async () => {
    const steps: string[] = [];
    const loaded = { accounts: [account], transactions: [], cards: [], installments: [], purchases: [], budgets: [] };
    const remove = async () => { steps.push("apagar"); };
    const create = async () => { steps.push("recriar"); };
    await expect(replaceWeekSnapshot(anchor, false, loaded, remove, create)).rejects.toThrow("hidratação");
    expect(steps).toEqual([]);
    await replaceWeekSnapshot(anchor, true, loaded, remove, create);
    expect(steps).toEqual(["apagar", "recriar"]);
  });
});

describe("saldo projetado vivo", () => {
  const bounds = getWeekBounds("2026-11-03");
  const source = (data: { transactions?: Transaction[]; purchases?: CardPurchase[]; installments?: CardInstallment[]; cards?: CreditCard[] } = {}) => ({
    accounts: [account], transactions: data.transactions ?? [], purchases: data.purchases ?? [],
    installments: data.installments ?? [], cards: data.cards ?? [card],
  });
  it("mostra a sequência de segunda a domingo e acumula segunda sem gasto na terça", () => {
    const monday = buildLiveWeekBarModel({ free: 181.83, perDay: 181.83 / 29, daysLeft: 29, endDate: "2026-11-30" }, bounds, "2026-11-02", source());
    const tuesday = buildLiveWeekBarModel({ free: 181.83, perDay: 181.83 / 28, daysLeft: 28, endDate: "2026-11-30" }, bounds, "2026-11-03", source());
    expect(monday.days.map(day => day.label)).toEqual(["S", "T", "Q", "Q", "S", "S", "D"]);
    expect(monday.disponivelHoje).toBeCloseTo(6.27);
    expect(tuesday.days[0].available).toBeCloseTo(6.27);
    expect(tuesday.disponivelHoje).toBeCloseTo(6.27 + 181.83 / 28);
    expect(tuesday.disponivelHoje).toBeGreaterThan(monday.disponivelHoje);
    expect(tuesday.days[2].future).toBe(true);
    expect(tuesday.days[2].available).toBeGreaterThan(tuesday.disponivelHoje);
  });
  it("desconta gasto uma vez e atualiza a parcela diária com o saldo projetado", () => {
    const model = buildLiveWeekBarModel(
      { free: 176.83, perDay: 176.83 / 28, daysLeft: 28, endDate: "2026-11-30" },
      bounds, "2026-11-03", source({ transactions: [tx("segunda", "2026-11-02", 5)] }),
    );
    expect(model.saldoProjetado).toBe(176.83);
    expect(model.porDia).toBeCloseTo(176.83 / 28);
    expect(model.days[0].release).toBeCloseTo(181.83 / 29);
    expect(model.days[0].available).toBeCloseTo(181.83 / 29 - 5);
    expect(model.disponivelHoje).toBeCloseTo(181.83 / 29 - 5 + 176.83 / 28);
  });
  it("mantém compra do cartão do mês seguinte fora da projeção, mas no gasto do dia", () => {
    const nextMonthCard = { ...card, closingDay: 1 };
    const model = buildLiveWeekBarModel(
      { free: 175.66, perDay: 175.66 / 28, daysLeft: 28, endDate: "2026-11-30" },
      bounds, "2026-11-03", source({ cards: [nextMonthCard], purchases: [purchase("futura", "2026-11-03", 4.65)], installments: [installment("futura", "2026-12", { amount: 4.65 })] }),
    );
    expect(model.gastoCartaoForaDoMes).toBe(4.65);
    expect(model.gastoSemana).toBe(4.65);
    expect(model.saldoProjetado).toBe(175.66);
    expect(model.disponivelHoje).toBeCloseTo(175.66 / 29 + 175.66 / 28 - 4.65);
  });
  it("recompõe só a compra de cartão que reduziu a projeção deste mês", () => {
    const model = buildLiveWeekBarModel(
      { free: 95, perDay: 95 / 28, daysLeft: 28, endDate: "2026-11-30" },
      bounds, "2026-11-03", source({ purchases: [purchase("cartao", "2026-11-02", 5)], installments: [installment("cartao", "2026-11", { amount: 5 })] }),
    );
    expect(model.days[0].release).toBeCloseTo(100 / 29);
    expect(model.days[0].available).toBeCloseTo(100 / 29 - 5);
    expect(model.days[1].release).toBeCloseTo(95 / 28);
    expect(model.gastoCartaoForaDoMes).toBe(0);
  });
  it("mostra déficit sem esconder o saldo projetado negativo", () => {
    const model = buildLiveWeekBarModel({ free: -12, perDay: 0, daysLeft: 28, endDate: "2026-11-30" }, bounds, "2026-11-03", source());
    expect(model.estado).toBe("mesNoVermelho");
    expect(model.deficitMes).toBe(12);
    expect(model.porDia).toBe(0);
  });
  it("mostra só os dias ativos nas semanas cortadas pelo mês", () => {
    for (const day of ["2026-11-01", "2026-11-30"]) {
      const daysLeft = day.endsWith("01") ? 30 : 1;
      const model = buildLiveWeekBarModel(
        { free: 14 * daysLeft, perDay: 14, daysLeft, endDate: "2026-11-30" },
        getWeekBounds(day), day, source(),
      );
      expect(model.days.filter(item => item.active)).toHaveLength(1);
      expect(model.disponivelHoje).toBe(14);
    }
  });
});
