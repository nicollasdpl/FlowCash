import type { Account, Budget, CardInstallment, CardPurchase, CreditCard, Transaction } from "@/types/financial";
import { SEED_INVOICE_PAYMENT_CATEGORY_ID } from "@/types/financial";
import { getCompetenceMonth, getInvoiceDates, hasInvoicePaymentForDue } from "@/engine/invoiceEngine";

export interface WeekBounds { semanaInicio: string; semanaFim: string; diasNaSemana: number }
export interface WeekSpend {
  gastoSemana: number;
  gastoContaRefletido: number;
  gastoCartaoRefletido: number;
  gastoCartaoNaSemana: number;
  gastoCartaoForaDoMes: number;
  parceladoNaSemana: number;
}
export interface WeekSnapshot extends WeekBounds {
  freeInicio: number;
  diasRestantesInicio: number;
  cotaDiaria: number;
  createdAt?: unknown;
  gastoSemana?: number;
  cotaSemanal?: number;
  saldoSemana?: number;
}

function utcDay(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}
function dayString(day: number): string { return new Date(day * 86_400_000).toISOString().slice(0, 10); }
function monthEnd(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return `${month}-${String(new Date(year, number, 0).getDate()).padStart(2, "0")}`;
}
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const brl = (value: number) => `R$ ${Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function getWeekBounds(date: string, month = date.slice(0, 7)): WeekBounds {
  const current = utcDay(date);
  const weekday = (new Date(current * 86_400_000).getUTCDay() + 6) % 7;
  const start = Math.max(current - weekday, utcDay(`${month}-01`));
  const end = Math.min(current + 6 - weekday, utcDay(monthEnd(month)));
  return { semanaInicio: dayString(start), semanaFim: dayString(end), diasNaSemana: end - start + 1 };
}

export function previousWeekBounds(current: WeekBounds): WeekBounds {
  const previousDay = dayString(utcDay(current.semanaInicio) - 1);
  return getWeekBounds(previousDay);
}

export function computeDailyQuota(projectedBalance: number, daysLeft: number): number {
  return daysLeft > 0 ? Math.max(0, projectedBalance / daysLeft) : 0;
}
export function computeAvailable(quota: number, daysElapsed: number, weekVariableSpend: number): number {
  return quota * daysElapsed - weekVariableSpend;
}

export function snapshotReadiness(hydrated: boolean, data: Partial<{
  accounts: Account[]; transactions: Transaction[]; cards: CreditCard[];
  installments: CardInstallment[]; purchases: CardPurchase[]; budgets: Budget[];
}> | null): "ready" | "loading" | "no-account" {
  if (!hydrated || !data || ![data.accounts, data.transactions, data.cards, data.installments, data.purchases, data.budgets].every(Array.isArray)) return "loading";
  if (!data.accounts?.some(account => account.active && account.type !== "investment")) return "no-account";
  return "ready";
}

export async function replaceWeekSnapshot(
  candidate: WeekSnapshot, hydrated: boolean,
  data: Parameters<typeof snapshotReadiness>[1],
  remove: () => Promise<void>, create: (snapshot: WeekSnapshot) => Promise<void>,
): Promise<void> {
  if (snapshotReadiness(hydrated, data) !== "ready") {
    throw new Error("Snapshot bloqueado: hidratação remota ou dados financeiros incompletos.");
  }
  await remove();
  await create(candidate);
}

export function collectWeekVariableSpend(input: {
  bounds: WeekBounds;
  throughDate: string;
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  purchases: readonly CardPurchase[];
  installments: readonly CardInstallment[];
  cards: readonly CreditCard[];
}): WeekSpend {
  const { bounds, throughDate, transactions, purchases, installments, cards } = input;
  const spendableAccountIds = new Set(input.accounts.filter(a => a.active && a.type !== "investment").map(a => a.id));
  const end = throughDate < bounds.semanaFim ? throughDate : bounds.semanaFim;
  const inWeek = (date: string) => date >= bounds.semanaInicio && date <= end;
  let gastoContaRefletido = 0;
  let gastoCartaoRefletido = 0;
  let gastoCartaoNaSemana = 0;
  let gastoCartaoForaDoMes = 0;
  let parceladoNaSemana = 0;

  for (const tx of transactions) {
    // Transaction não possui purchaseDate; competenceDate é a aproximação da data da compra.
    if (tx.type !== "expense" || tx.status !== "paid" || tx.paymentDate > throughDate ||
        tx.isRecurring || tx.recurringRuleId || tx.origin === "recurring" || tx.origin === "invoice" ||
        tx.categoryId === SEED_INVOICE_PAYMENT_CATEGORY_ID ||
        !spendableAccountIds.has(tx.accountId) || !inWeek(tx.competenceDate)) continue;
    gastoContaRefletido += tx.amount;
  }

  const cardById = new Map(cards.map(card => [card.id, card]));
  const installmentsByPurchase = new Map<string, CardInstallment[]>();
  for (const installment of installments) {
    const group = installmentsByPurchase.get(installment.purchaseId) ?? [];
    group.push(installment);
    installmentsByPurchase.set(installment.purchaseId, group);
  }
  for (const purchase of purchases) {
    if (purchase.responsiblePerson?.trim() || !inWeek(purchase.purchaseDate)) continue;
    if (purchase.totalInstallments > 1) {
      parceladoNaSemana += purchase.amount;
      continue;
    }
    if (purchase.isSubscription) continue;
    const card = cardById.get(purchase.cardId);
    if (!card) continue;
    const competence = getCompetenceMonth(purchase.purchaseDate, card.closingDay);
    const { dueDate } = getInvoiceDates(competence, card.closingDay, card.dueDay);
    const ownInstallment = (installmentsByPurchase.get(purchase.id) ?? []).find(i => i.competenceMonth === competence);
    gastoCartaoNaSemana += purchase.amount;
    const reflected = !!ownInstallment && !ownInstallment.paid &&
      spendableAccountIds.has(card.paymentAccountId) && dueDate <= monthEnd(throughDate.slice(0, 7)) &&
      !hasInvoicePaymentForDue([...transactions], card, dueDate);
    if (reflected) gastoCartaoRefletido += purchase.amount;
    if (dueDate > monthEnd(throughDate.slice(0, 7))) gastoCartaoForaDoMes += purchase.amount;
  }
  return {
    gastoSemana: money(gastoContaRefletido + gastoCartaoNaSemana),
    gastoContaRefletido: money(gastoContaRefletido),
    gastoCartaoRefletido: money(gastoCartaoRefletido),
    gastoCartaoNaSemana: money(gastoCartaoNaSemana),
    gastoCartaoForaDoMes: money(gastoCartaoForaDoMes),
    parceladoNaSemana: money(parceladoNaSemana),
  };
}

export function buildWeekAnchor(freeAtual: number, bounds: WeekBounds, spend: WeekSpend): WeekSnapshot {
  const freeInicio = money(freeAtual + spend.gastoContaRefletido + spend.gastoCartaoRefletido);
  const diasRestantesInicio = utcDay(monthEnd(bounds.semanaInicio.slice(0, 7))) - utcDay(bounds.semanaInicio) + 1;
  return { ...bounds, freeInicio, diasRestantesInicio, cotaDiaria: computeDailyQuota(freeInicio, diasRestantesInicio) };
}

export function resolveWeekSnapshot(existing: WeekSnapshot | null, candidate: WeekSnapshot): WeekSnapshot {
  return existing ?? candidate;
}

export function closeWeek(snapshot: WeekSnapshot, gastoSemana: number): WeekSnapshot {
  const cotaSemanal = money(snapshot.cotaDiaria * snapshot.diasNaSemana);
  return { ...snapshot, gastoSemana: money(gastoSemana), cotaSemanal, saldoSemana: money(cotaSemanal - gastoSemana) };
}

export function buildEvolutionSeries(snapshots: readonly WeekSnapshot[]) {
  return snapshots.filter(s => s.saldoSemana !== undefined).map(s => ({
    semanaInicio: s.semanaInicio, semanaFim: s.semanaFim,
    cotaSemanal: s.cotaSemanal ?? 0, gastoSemana: s.gastoSemana ?? 0, saldoSemana: s.saldoSemana ?? 0,
    pctGasto: s.cotaSemanal && s.cotaSemanal > 0 ? Math.min(100, (s.gastoSemana ?? 0) / s.cotaSemanal * 100) : 0,
  })).sort((a, b) => a.semanaInicio.localeCompare(b.semanaInicio));
}

export type WeekBarState = "folga" | "atencao" | "estourou" | "mesNoVermelho";
/** Exibição viva: o saldo projetado já incorpora os gastos refletidos; não subtrair gastoSemana novamente. */
export function buildLiveWeekBarModel(
  room: { free: number; perDay: number; daysLeft: number; endDate: string },
  bounds: WeekBounds,
  todayStr: string,
  spend: WeekSpend,
) {
  const daysRemainingWeek = Math.max(0, utcDay(bounds.semanaFim) - utcDay(todayStr) + 1);
  const plannedRestOfWeek = Math.max(0, room.perDay * daysRemainingWeek);
  const barTotal = spend.gastoSemana + plannedRestOfWeek;
  const monthShort = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const startDay = Number(bounds.semanaInicio.slice(8, 10));
  const endDay = Number(bounds.semanaFim.slice(8, 10));
  const startMonth = monthShort[Number(bounds.semanaInicio.slice(5, 7)) - 1];
  const endMonth = monthShort[Number(bounds.semanaFim.slice(5, 7)) - 1];
  return {
    saldoProjetado: room.free,
    porDia: room.perDay,
    diasRestantes: room.daysLeft,
    fimDoMes: room.endDate,
    tituloSemana: startDay === endDay ? `Esta semana · ${startDay} ${startMonth}` :
      `Esta semana · ${startDay}${startMonth === endMonth ? "" : ` ${startMonth}`} a ${endDay} ${endMonth}`,
    gastoSemana: spend.gastoSemana,
    planejadoAteFimDaSemana: plannedRestOfWeek,
    diasRestantesSemana: daysRemainingWeek,
    pctGasto: barTotal > 0 ? spend.gastoSemana / barTotal * 100 : 0,
    pctPlanejado: barTotal > 0 ? plannedRestOfWeek / barTotal * 100 : 0,
    deficitMes: Math.max(0, -room.free),
    estado: room.free <= 0 ? "mesNoVermelho" as const : "disponivel" as const,
    parceladoNaSemana: spend.parceladoNaSemana,
    gastoCartaoForaDoMes: spend.gastoCartaoForaDoMes,
  };
}

export function buildWeekBarModel(snapshot: WeekSnapshot, todayStr: string, spend: WeekSpend) {
  const diasDecorridos = Math.max(1, Math.min(snapshot.diasNaSemana, utcDay(todayStr) - utcDay(snapshot.semanaInicio) + 1));
  const cotaSemanal = snapshot.cotaDiaria * snapshot.diasNaSemana;
  const liberadoAteHoje = snapshot.cotaDiaria * diasDecorridos;
  const disponivelHoje = computeAvailable(snapshot.cotaDiaria, diasDecorridos, spend.gastoSemana);
  const excedente = Math.max(0, -disponivelHoje);
  const aLiberar = cotaSemanal - liberadoAteHoje;
  const estado: WeekBarState = snapshot.freeInicio <= 0 ? "mesNoVermelho" :
    disponivelHoje < 0 ? "estourou" : disponivelHoje < snapshot.cotaDiaria / 2 ? "atencao" : "folga";
  const pct = (value: number) => cotaSemanal > 0 ? Math.max(0, Math.min(100, value / cotaSemanal * 100)) : 0;
  const weekOffset = (new Date(utcDay(snapshot.semanaInicio) * 86_400_000).getUTCDay() + 6) % 7;
  const monthShort = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const startMonth = monthShort[Number(snapshot.semanaInicio.slice(5, 7)) - 1];
  const endMonth = monthShort[Number(snapshot.semanaFim.slice(5, 7)) - 1];
  const startDay = Number(snapshot.semanaInicio.slice(8, 10));
  const endDay = Number(snapshot.semanaFim.slice(8, 10));
  const tituloSemana = startDay === endDay ? `Esta semana · ${startDay} ${startMonth}` :
    `Esta semana · ${startDay}${startMonth === endMonth ? "" : ` ${startMonth}`} a ${endDay} ${endMonth}`;
  const fraseExplicativa = estado === "mesNoVermelho"
    ? snapshot.freeInicio < 0 ? `O mês começa com déficit de ${brl(snapshot.freeInicio)}. Evite novos gastos variáveis.` : "Não há saldo livre projetado para novos gastos variáveis neste mês."
    : spend.gastoSemana > 0
      ? `Liberado até hoje ${brl(liberadoAteHoje)} − gasto ${brl(spend.gastoSemana)} = ${disponivelHoje < 0 ? "−" : ""}${brl(disponivelHoje)}.`
      : diasDecorridos === 1
        ? `Hoje libera ${brl(snapshot.cotaDiaria)}. Sem gastos variáveis nesta semana.`
        : `Sem gastos variáveis: ${brl(snapshot.cotaDiaria * (diasDecorridos - 1))} acumularam. Hoje: + ${brl(snapshot.cotaDiaria)} = ${brl(disponivelHoje)}.`;
  return {
    cotaDiaria: snapshot.cotaDiaria, cotaSemanal, diasNaSemana: snapshot.diasNaSemana,
    diaAtualIndex: diasDecorridos - 1, weekOffset, tituloSemana,
    tickDias: ["S", "T", "Q", "Q", "S", "S", "D"].map((label, index) => ({
      label, active: index >= weekOffset && index < weekOffset + snapshot.diasNaSemana,
      today: index === weekOffset + diasDecorridos - 1,
    })),
    gastoSemana: spend.gastoSemana, liberadoAteHoje,
    disponivelHoje, excedente, aLiberar, pctGasto: pct(spend.gastoSemana),
    pctDisponivel: pct(Math.max(0, disponivelHoje)), pctALiberar: pct(aLiberar),
    pctLiberado: pct(liberadoAteHoje), pctGastoBase: pct(Math.min(spend.gastoSemana, liberadoAteHoje)),
    pctExcesso: Math.max(0, pct(spend.gastoSemana) - pct(liberadoAteHoje)),
    pctSemanaLeft: weekOffset / 7 * 100, pctSemanaWidth: snapshot.diasNaSemana / 7 * 100,
    disponivelLegenda: Math.max(0, disponivelHoje),
    estado, fraseExplicativa,
    deficitMes: Math.max(0, -snapshot.freeInicio),
    parceladoNaSemana: spend.parceladoNaSemana,
    gastoCartaoForaDoMes: spend.gastoCartaoForaDoMes,
  };
}
