export interface NotificationPrefs {
  enabled: boolean;
  overdue: boolean;
  dueToday: boolean;
  dueTomorrow: boolean;
  incomeToday: boolean;
  cardInvoiceDue: boolean;
  budgetOver: boolean;
  budgetWarning: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false,
  overdue: true,
  dueToday: true,
  dueTomorrow: true,
  incomeToday: true,
  cardInvoiceDue: true,
  budgetOver: true,
  budgetWarning: false,
};

export type FinanceAlertKind =
  | "overdue"
  | "dueToday"
  | "dueTomorrow"
  | "incomeToday"
  | "cardInvoiceDue"
  | "budgetOver"
  | "budgetWarning";

export interface FinanceAlert {
  id: string;
  kind: FinanceAlertKind;
  line: string;
  priority: number;
}
