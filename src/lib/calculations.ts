import type { Expense, Member, PaymentMethod } from './types';
import { dayKey } from './format';

export interface MemberTotals {
  member: Member;
  /** Sum of expenses where this member is in the Paid By field. */
  totalPaid: number;
  /** Sum of expenses this member recorded (Entered By field). */
  totalEntered: number;
  paidCount: number;
  enteredCount: number;
}

export interface CategoryTotals {
  category: string;
  total: number;
  count: number;
}

export interface DateTotals {
  key: string;
  total: number;
  count: number;
}

export interface TripSummary {
  total: number;
  count: number;
  highest: Expense | null;
  memberTotals: MemberTotals[];
  categoryTotals: CategoryTotals[];
  dateTotals: DateTotals[];
  totalReceipts: number;
}

/**
 * Single source of truth for every number shown in the app.
 * Money paid and expenses entered are tracked separately and never mixed.
 * No expense is ever auto-created or auto-split here.
 */
export function buildSummary(expenses: Expense[], members: Member[]): TripSummary {
  let total = 0;
  let highest: Expense | null = null;
  let totalReceipts = 0;

  const paid = new Map<string, { sum: number; count: number }>();
  const entered = new Map<string, { sum: number; count: number }>();
  const byCategory = new Map<string, CategoryTotals>();
  const byDate = new Map<string, DateTotals>();

  for (const e of expenses) {
    total += e.amount;
    if (!highest || e.amount > highest.amount) highest = e;
    if (e.receipt_url) totalReceipts += 1;

    const p = paid.get(e.paid_by_member_id) ?? { sum: 0, count: 0 };
    p.sum += e.amount;
    p.count += 1;
    paid.set(e.paid_by_member_id, p);

    const en = entered.get(e.entered_by_member_id) ?? { sum: 0, count: 0 };
    en.sum += e.amount;
    en.count += 1;
    entered.set(e.entered_by_member_id, en);

    const c = byCategory.get(e.category) ?? { category: e.category, total: 0, count: 0 };
    c.total += e.amount;
    c.count += 1;
    byCategory.set(e.category, c);

    const k = dayKey(e.expense_date);
    const d = byDate.get(k) ?? { key: k, total: 0, count: 0 };
    d.total += e.amount;
    d.count += 1;
    byDate.set(k, d);
  }

  const memberTotals: MemberTotals[] = members.map((member) => {
    const p = paid.get(member.id) ?? { sum: 0, count: 0 };
    const en = entered.get(member.id) ?? { sum: 0, count: 0 };
    return {
      member,
      totalPaid: p.sum,
      totalEntered: en.sum,
      paidCount: p.count,
      enteredCount: en.count,
    };
  });

  return {
    total: round2(total),
    count: expenses.length,
    highest,
    memberTotals,
    categoryTotals: [...byCategory.values()].sort((a, b) => b.total - a.total),
    dateTotals: [...byDate.values()].sort((a, b) => b.key.localeCompare(a.key)),
    totalReceipts,
  };
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export type SortKey = 'date' | 'amount';
export type SortDir = 'asc' | 'desc';

export interface ExpenseFilters {
  search: string;
  category: string;
  paidBy: string;
  enteredBy: string;
  paymentMethod: string;
  from: string;
  to: string;
}

export const emptyFilters: ExpenseFilters = {
  search: '',
  category: '',
  paidBy: '',
  enteredBy: '',
  paymentMethod: '',
  from: '',
  to: '',
};

export function filterExpenses(list: Expense[], f: ExpenseFilters): Expense[] {
  const q = f.search.trim().toLowerCase();
  return list.filter((e) => {
    if (q) {
      const hay = `${e.title} ${e.description ?? ''} ${e.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.category && e.category !== f.category) return false;
    if (f.paidBy && e.paid_by_member_id !== f.paidBy) return false;
    if (f.enteredBy && e.entered_by_member_id !== f.enteredBy) return false;
    if (f.paymentMethod && e.payment_method !== f.paymentMethod) return false;
    if (f.from && dayKey(e.expense_date) < f.from) return false;
    if (f.to && dayKey(e.expense_date) > f.to) return false;
    return true;
  });
}

export function sortExpenses(list: Expense[], key: SortKey, dir: SortDir): Expense[] {
  const mul = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const cmp =
      key === 'amount'
        ? a.amount - b.amount
        : Date.parse(a.expense_date) - Date.parse(b.expense_date);
    if (cmp !== 0) return cmp * mul;
    // Stable tie-break: newest created first for dates, title for amounts.
    return key === 'amount'
      ? a.title.localeCompare(b.title) * mul
      : Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}

export const paymentMethodLabel = (m: PaymentMethod | string): string => m;
