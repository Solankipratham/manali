export const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const EXPENSE_CATEGORIES = [
  'Stay',
  'Food',
  'Fuel',
  'Transport',
  'Activities',
  'Shopping',
  'Groceries',
  'Medical',
  'Tickets',
  'Other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Trip {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  currency: string;
  created_at: string;
}

export interface Member {
  id: string;
  trip_id: string;
  name: string;
  created_at: string;
}

/** One row of the shared trip ledger. Mirrors the `expenses` table exactly. */
export interface Expense {
  id: string;
  trip_id: string;
  title: string;
  amount: number;
  category: string;
  description: string | null;
  paid_by_member_id: string;
  entered_by_member_id: string;
  payment_method: PaymentMethod;
  expense_date: string;
  receipt_url: string | null;
  created_at: string;
  updated_at: string;
}

/** Payload used when creating/editing an expense (entered-by is applied separately). */
export interface ExpenseInput {
  title: string;
  amount: number;
  category: string;
  description: string | null;
  paid_by_member_id: string;
  payment_method: PaymentMethod;
  expense_date: string;
  receipt_url?: string | null;
}

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

/** Append-only audit trail — one entry per create / edit / delete. */
export interface AuditEntry {
  id: string;
  expense_id: string;
  trip_id: string;
  action: AuditAction;
  changed_by_member_id: string | null;
  old_values: Partial<Expense> | null;
  new_values: Partial<Expense> | null;
  changed_at: string;
}
