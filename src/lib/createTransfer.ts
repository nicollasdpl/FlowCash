import type { Account, Transaction } from "@/types/financial";
import { SEED_INTERNAL_TRANSFER_CATEGORY_ID } from "@/types/financial";
import { getCurrentBalance } from "@/engine/financialEngine";

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string; // YYYY-MM-DD
  description: string;
  id: string;
  createdAt?: string;
}

/** Valida valor e saldo da conta de origem. Retorna mensagem de erro ou null. */
export function validateTransferAmount(
  amount: number,
  fromAccount: Account,
  transactions: Transaction[],
): string | null {
  if (!amount || isNaN(amount) || amount <= 0) {
    return "Informe um valor válido.";
  }
  const balance = getCurrentBalance(fromAccount, transactions);
  if (amount > balance + 1e-9) {
    return `Saldo insuficiente. Disponível: R$ ${balance.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return null;
}

/** Monta uma Transaction type=transfer pronta para ADD_TX. */
export function buildTransferTransaction(input: TransferInput): Transaction {
  const { fromAccountId, toAccountId, amount, date, description, id, createdAt } = input;
  return {
    id,
    accountId: fromAccountId,
    type: "transfer",
    amount,
    description,
    categoryId: SEED_INTERNAL_TRANSFER_CATEGORY_ID,
    competenceDate: date,
    paymentDate: date,
    status: "paid",
    isRecurring: false,
    origin: "manual",
    transferToAccountId: toAccountId,
    createdAt: createdAt ?? new Date().toISOString(),
  };
}
