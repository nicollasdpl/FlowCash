/** Linha normalizada vinda do extrato (CSV FlowCash ou texto Bradesco). */
export interface ImportedLine {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  description: string;
  amount: number;
  /** Ex.: { current: 3, total: 10 } quando o extrato traz "3/10". */
  installmentHint?: { current: number; total: number };
  isSubscriptionHint?: boolean;
  raw?: string;
}

/** Parcela já lançada no app, pronta para match. */
export interface AppInvoiceLine {
  installmentId: string;
  purchaseId: string;
  /** YYYY-MM-DD da compra (pode diferir levemente do extrato). */
  date: string;
  description: string;
  amount: number;
  installmentNumber: number;
  totalInstallments: number;
  isSubscription?: boolean;
  categoryId: string;
  categoryName: string;
}

export type MatchStatus = "matched" | "only_bank" | "only_app" | "ambiguous";

export interface MatchPair {
  imported: ImportedLine;
  app: AppInvoiceLine;
  score: number;
}

export interface AmbiguousCandidate {
  imported: ImportedLine;
  candidates: AppInvoiceLine[];
}

export interface MatchResult {
  matched: MatchPair[];
  onlyBank: ImportedLine[];
  onlyApp: AppInvoiceLine[];
  ambiguous: AmbiguousCandidate[];
  totals: {
    bank: number;
    app: number;
    difference: number;
  };
}

/** Rascunho editável antes de virar CardPurchase. */
export interface ImportDraftLine {
  key: string;
  selected: boolean;
  date: string;
  description: string;
  amount: number;
  categoryId: string;
  totalInstallments: number;
  isSubscription: boolean;
  /** Usuário marcou como já coberto (não criar). */
  covered?: boolean;
  /** Aviso se competenceMonth ≠ mês da fatura aberta. */
  competenceWarning?: string;
}

export type ImportReviewMode = "compare" | "import";
