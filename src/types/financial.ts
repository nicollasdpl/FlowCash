// ─────────────────────────────────────────────────────────────────────────────
// FLOWCASH — FINANCIAL TYPE SYSTEM
// Temporal financial engine. Saldo é CONSEQUÊNCIA de eventos, não dado manual.
// ─────────────────────────────────────────────────────────────────────────────

export type AccountType = "checking" | "savings" | "wallet" | "investment";
export type TransactionType = "income" | "expense" | "transfer";
export type TransactionStatus = "pending" | "paid" | "overdue";
export type TransactionOrigin = "manual" | "invoice" | "recurring" | "import";
export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type InvoiceStatus = "open" | "closed" | "overdue" | "paid";

// ID fixo da categoria de sistema usada para liquidar a fatura do cartão.
// NÃO conta como gasto por categoria (as parcelas já contam pelas categorias
// das compras originais). Não editável nem deletável; oculta em formulários.
export const SEED_INVOICE_PAYMENT_CATEGORY_ID = "system_invoice_payment";

// Categoria de RECEITA usada para dinheiro de empréstimo/financiamento.
// O dinheiro entra de verdade (afeta o saldo), mas NÃO é renda real — por isso
// é marcada com excludeFromReports e não soma nos totais de "Receitas".
export const SEED_LOAN_INCOME_CATEGORY_ID = "loan_income";
// Categoria de DESPESA para as parcelas do empréstimo (saída real do dinheiro).
export const SEED_LOAN_EXPENSE_CATEGORY_ID = "loan_expense";

// ─── CONTA BANCÁRIA ───────────────────────────────────────────────────────────
// Onde o dinheiro EXISTE fisicamente.
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  initialBalance: number;   // Saldo inicial na data de cadastro
  initialDate: string;      // YYYY-MM-DD — quando o saldo inicial foi registrado
  color: string;
  icon: string;             // emoji
  active: boolean;
}

// ─── CATEGORIA ────────────────────────────────────────────────────────────────
export interface Category {
  id: string;
  name: string;
  type: "income" | "expense";
  color: string;
  icon: string;
  isSystem?: boolean;             // categoria de sistema: não editável/deletável, oculta em formulários
  excludeFromReports?: boolean;   // não soma nos totais de relatório (ex.: empréstimo não conta como receita), mas ainda afeta o saldo
}

// ─── TRANSAÇÃO ────────────────────────────────────────────────────────────────
// REGRA: competenceDate ≠ paymentDate.
// competenceDate = quando a obrigação existe (data da conta, do salário, etc.)
// paymentDate    = quando o dinheiro realmente saiu/entrou
//
// status=pending: existe, não impacta saldo real (impacta projeção)
// status=paid:    impacta saldo real na paymentDate
// status=overdue: vencida, ainda não paga
export interface Transaction {
  id: string;
  accountId: string;
  type: TransactionType;
  amount: number;                 // sempre positivo
  description: string;
  categoryId: string;
  competenceDate: string;         // YYYY-MM-DD — quando a obrigação existe
  paymentDate: string;            // YYYY-MM-DD — quando será/foi pago
  status: TransactionStatus;
  isRecurring: boolean;
  recurringRuleId?: string;
  origin: TransactionOrigin;
  transferToAccountId?: string;   // para type=transfer
  notes?: string;
  createdAt: string;
}

// ─── CARTÃO DE CRÉDITO ────────────────────────────────────────────────────────
// Cartão é LINHA DE CRÉDITO, NÃO é conta bancária.
// Compra no cartão NÃO reduz saldo da conta.
// Somente o pagamento da fatura reduz.
export interface CreditCard {
  id: string;
  name: string;
  lastDigits: string;
  brand: string;
  totalLimit: number;
  closingDay: number;             // dia do mês que a fatura fecha
  dueDay: number;                 // dia do mês que a fatura vence
  paymentAccountId: string;       // conta de onde sai o pagamento da fatura
  color: string;
  active: boolean;
}

// ─── COMPRA NO CARTÃO ────────────────────────────────────────────────────────
// REGRA DE PARCELAMENTO: cada parcela é obrigação futura real.
// Parcelar 12x = gerar 12 registros em faturas distintas.
// REGRA DE FECHAMENTO: purchaseDate.day > closingDay → entra na PRÓXIMA fatura
export interface CardPurchase {
  id: string;
  cardId: string;
  amount: number;                 // valor TOTAL da compra
  description: string;
  categoryId: string;
  purchaseDate: string;           // YYYY-MM-DD
  totalInstallments: number;      // 1 = à vista
  isSubscription?: boolean;       // true = cobrança mensal recorrente
  createdAt: string;
}

// ─── PARCELA GERADA ──────────────────────────────────────────────────────────
// Gerada automaticamente pela engine ao criar CardPurchase.
// Cada parcela tem sua própria competência (mês da fatura).
export interface CardInstallment {
  id: string;
  purchaseId: string;
  cardId: string;
  installmentNumber: number;      // 1 de N
  totalInstallments: number;
  amount: number;                 // valor desta parcela
  competenceMonth: string;        // YYYY-MM — mês da fatura
  paid: boolean;
  paidAt?: string;
}

// ─── FATURA ───────────────────────────────────────────────────────────────────
// Agrupamento automático de parcelas por competenceMonth.
// NÃO é criada manualmente — é calculada pela engine.
// status=open: ainda sendo usada
// status=closed: fechou, aguardando pagamento
// status=paid: fatura paga (gerou despesa real na conta bancária)
export interface Invoice {
  id: string;
  cardId: string;
  competenceMonth: string;        // YYYY-MM
  closingDate: string;            // YYYY-MM-DD
  dueDate: string;                // YYYY-MM-DD
  totalAmount: number;            // calculado
  status: InvoiceStatus;
  paidAt?: string;
  paymentTransactionId?: string;  // referência à despesa gerada na conta
}

// ─── REGRA DE RECORRÊNCIA ─────────────────────────────────────────────────────
// Define padrão. Engine gera transações futuras sob demanda.
// NÃO duplicar infinitamente — gerar X meses à frente.
export interface RecurringRule {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  categoryId: string;
  accountId: string;
  frequency: RecurringFrequency;
  dayOfMonth?: number;            // para frequency=monthly
  startDate: string;              // YYYY-MM-DD
  endDate?: string;               // YYYY-MM-DD — se null, indefinida
  lastGeneratedDate?: string;
  active: boolean;
}

// ─── ORÇAMENTO MENSAL ─────────────────────────────────────────────────────────
export interface Budget {
  id: string;
  categoryId: string;
  limitAmount: number;
  month: string;                  // YYYY-MM
}

// ─── META FINANCEIRA ─────────────────────────────────────────────────────────
// Meta é RESERVA, não categoria.
// O dinheiro continua na conta mas é marcado como comprometido.
export interface Goal {
  id: string;
  name: string;
  emoji: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;               // YYYY-MM-DD
  accountId: string;              // conta onde o dinheiro está reservado
  color: string;
  completed: boolean;
}

// ─── RESULTADOS DO MOTOR FINANCEIRO ──────────────────────────────────────────

export interface AccountBalance {
  accountId: string;
  currentBalance: number;         // saldo real (apenas pagos)
  projectedBalance: number;       // + pendentes do mês
  availableBalance: number;       // projetado - reservado para metas
}

export interface NetWorthSnapshot {
  totalAssets: number;            // soma de saldos reais de todas contas
  totalLiabilities: number;       // soma de faturas em aberto dos cartões
  netWorth: number;               // assets - liabilities
  projectedNetWorth: number;
}

export interface CashFlowEntry {
  date: string;                   // YYYY-MM-DD
  description: string;
  amount: number;
  type: "income" | "expense";
  status: TransactionStatus;
  runningBalance: number;         // saldo acumulado neste dia
  accountId: string;
}

export interface MonthlyProjection {
  month: string;                  // YYYY-MM
  projectedIncome: number;
  projectedExpense: number;
  projectedBalance: number;
  riskLevel: "safe" | "warning" | "danger";
}

export interface CardLimitSummary {
  cardId: string;
  totalLimit: number;
  usedLimit: number;              // TODAS parcelas futuras não pagas
  availableLimit: number;
  currentInvoiceAmount: number;   // somente fatura do mês atual
}
