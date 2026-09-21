/** Shape mínimo pra medir riqueza do estado (evita import circular com AppContext). */
export type RichnessState = {
  accounts: readonly unknown[];
  transactions: readonly unknown[];
  purchases: readonly unknown[];
  installments: readonly unknown[];
  cards: readonly unknown[];
  goals: readonly unknown[];
  budgets: readonly unknown[];
};

export function isEmptyAppState(s: RichnessState): boolean {
  return (
    s.accounts.length === 0 &&
    s.transactions.length === 0 &&
    s.purchases.length === 0 &&
    s.cards.length === 0
  );
}

/** Quantidade de entidades — usada pra bloquear wipe acidental no sync. */
export function stateRichness(s: RichnessState): number {
  return (
    s.accounts.length +
    s.transactions.length +
    s.purchases.length +
    s.installments.length +
    s.cards.length +
    s.goals.length +
    s.budgets.length
  );
}

/**
 * True se `candidate` parece um wipe/perda vs `baseline` (ex.: seed vazio
 * ou cache parcial tentando sobrescrever o servidor cheio).
 */
export function isDestructiveOverwrite(candidate: RichnessState, baseline: RichnessState): boolean {
  const base = stateRichness(baseline);
  const next = stateRichness(candidate);
  if (base >= 8 && isEmptyAppState(candidate)) return true;
  if (base >= 20 && next < Math.floor(base * 0.5)) return true;
  return false;
}
