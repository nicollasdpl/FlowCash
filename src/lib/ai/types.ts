// Tipos compartilhados entre cliente (AIPageContent) e servidor (/api/ai).

export type Intent = "launch" | "question" | "mixed" | "action";

export type Hint = {
  categoryId: string;
  accountId?: string;
  cardId?: string;
  confirmedCount: number;
  lastUsed: string;
};
export type Hints = Record<string, Hint>;

export type AITxItem = {
  intent: "transaction";
  type: "income" | "expense";
  amount: number;
  description: string;
  categoryId: string | null;
  accountId: string;
  competenceDate: string;
  paymentDate: string;
  status: "paid" | "pending" | "overdue";
  confidence: "high" | "low";
};

export type AIPurchaseItem = {
  intent: "card_purchase";
  amount: number;
  description: string;
  categoryId: string | null;
  cardId: string;
  purchaseDate: string;
  totalInstallments: number;
  confidence: "high" | "low";
};

export type AIItem = AITxItem | AIPurchaseItem;

export type AIActionType = "delete_tx" | "update_tx" | "delete_purchase";

export type AIActionItem = {
  intent: "action";
  action: AIActionType;
  targetId: string;
  targetDescription: string;
  targetDate?: string;
  targetAmount?: number;
  patch?: {
    amount?: number;
    description?: string;
    categoryId?: string;
    accountId?: string;
    paymentDate?: string;
    status?: "paid" | "pending";
  };
  confidence: "high" | "low";
};

export type AILaunch = { intent: "launch"; transactions: AIItem[]; truncated?: boolean };
export type AIQuestion = { intent: "question"; answer: string; local?: boolean };
export type AIMixed = { intent: "mixed"; transactions: AIItem[]; truncated?: boolean; answer: string };
export type AIActionResult = { intent: "action"; actions: AIActionItem[]; message?: string };
export type AIError = { intent: "error"; code: string; message: string; retryAfterSec?: number };
export type AIUnknown = { intent: "unknown"; message: string };
export type AIResult = AILaunch | AIQuestion | AIMixed | AIActionResult | AIError | AIUnknown;

export type ChatTurn =
  | { kind: "message"; q: string; a: string }
  | { kind: "launch"; q: string; summary: string };

export type ConversationTurn = { role: "user" | "assistant"; content: string };

export type FinancialContextAccount = {
  id: string;
  name: string;
  currentBalance: number;
  projectedBalance: number;
};

export type FinancialContextCategory = {
  categoryId: string;
  name: string;
  spent: number;
  budget?: number;
  budgetUsedPct?: number;
  budgetRemaining?: number;
  overBudget?: boolean;
};

export type FinancialContextCard = {
  id: string;
  name: string;
  brand: string;
  currentInvoiceAmount: number;
  invoiceDueDate: string;
  usedLimit: number;
  availableLimit: number;
  totalLimit: number;
};

export type FinancialContextGoal = {
  id: string;
  name: string;
  currentAmount: number;
  targetAmount: number;
  progressPct: number;
  deadline: string;
};

export type FinancialContextTx = {
  id: string;
  description: string;
  amount: number;
  type: string;
  category: string;
  categoryId: string;
  date: string;
  accountId: string;
};

export type FinancialContextPurchase = {
  id: string;
  description: string;
  amount: number;
  category: string;
  categoryId: string;
  cardId: string;
  cardName: string;
  purchaseDate: string;
};

export type FinancialContext = {
  month: string;
  prevMonth: string;
  summary: {
    income: number;
    expenses: number;
    balance: number;
    prevExpenses: number;
    expenseChangePct: number | null;
  };
  byCategory: FinancialContextCategory[];
  recentTransactions: FinancialContextTx[];
  recentPurchases: FinancialContextPurchase[];
  accounts: FinancialContextAccount[];
  cards: FinancialContextCard[];
  goals: FinancialContextGoal[];
  budgetAlerts: { name: string; spent: number; limit: number; overBy: number }[];
};

export type BuildFinancialContextInput = {
  accounts: { id: string; name: string; initialBalance: number; active: boolean; initialDate?: string }[];
  transactions: {
    id: string;
    accountId: string;
    type: string;
    amount: number;
    description: string;
    categoryId: string;
    competenceDate: string;
    paymentDate: string;
    status: string;
  }[];
  categories: { id: string; name: string }[];
  budgets: { categoryId: string; month: string; limitAmount: number }[];
  cards?: { id: string; name: string; brand: string; totalLimit: number; closingDay: number; dueDay: number; paymentAccountId: string; active: boolean }[];
  installments?: { id: string; purchaseId: string; cardId: string; amount: number; competenceMonth: string; paid: boolean }[];
  purchases?: { id: string; cardId: string; amount: number; description: string; categoryId: string; purchaseDate: string }[];
  goals?: { id: string; name: string; targetAmount: number; currentAmount: number; deadline: string; completed: boolean }[];
};
