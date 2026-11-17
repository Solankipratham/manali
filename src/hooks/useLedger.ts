import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuditEntry, Expense, ExpenseInput, Member } from '../lib/types';
import { getStorage, type LedgerStorage } from '../lib/storage';

export interface LedgerState {
  expenses: Expense[];
  members: Member[];
  audit: AuditEntry[];
  loading: boolean;
  error: string | null;
  busy: boolean;
}

const byDateDesc = (a: Expense, b: Expense) =>
  Date.parse(b.expense_date) - Date.parse(a.expense_date) ||
  Date.parse(b.created_at) - Date.parse(a.created_at);

const auditDesc = (a: AuditEntry, b: AuditEntry) =>
  Date.parse(b.changed_at) - Date.parse(a.changed_at);

/**
 * Loads the shared trip ledger, keeps it fresh with realtime/cross-tab updates,
 * and exposes create/edit/delete operations. Every mutation re-reads the ledger
 * so totals, category sums and the final report always reflect the latest data.
 */
export function useLedger(): LedgerState & {
  addExpense: (input: ExpenseInput, memberId: string, file?: File | null) => Promise<Expense>;
  updateExpense: (
    id: string,
    patch: Partial<ExpenseInput>,
    memberId: string,
    receiptFile?: File | null,
  ) => Promise<Expense>;
  deleteExpense: (id: string, memberId: string) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const storage: LedgerStorage = useMemo(() => getStorage(), []);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [e, m, a] = await Promise.all([
        storage.loadExpenses(),
        storage.loadMembers(),
        storage.loadAudit(),
      ]);
      setExpenses([...e].sort(byDateDesc));
      setMembers(m);
      setAudit([...a].sort(auditDesc));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the ledger.');
    } finally {
      setLoading(false);
    }
  }, [storage]);

  useEffect(() => {
    let alive = true;
    const unsubscribe = storage.subscribe(() => {
      if (alive) void refresh();
    });
    (async () => {
      try {
        await storage.init();
        await refresh();
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : 'Could not initialise the ledger.');
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [storage, refresh]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      setBusy(true);
      try {
        const result = await fn();
        await refresh();
        return result;
      } catch (err) {
        await refresh();
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const addExpense = useCallback(
    (input: ExpenseInput, memberId: string, file?: File | null) =>
      run(() => storage.addExpense(input, memberId, file)),
    [run, storage],
  );

  const updateExpense = useCallback(
    (id: string, patch: Partial<ExpenseInput>, memberId: string, receiptFile?: File | null) =>
      run(() => storage.updateExpense(id, patch, memberId, receiptFile)),
    [run, storage],
  );

  const deleteExpense = useCallback(
    (id: string, memberId: string) => run(() => storage.deleteExpense(id, memberId)),
    [run, storage],
  );

  return {
    expenses,
    members,
    audit,
    loading,
    error,
    busy,
    addExpense,
    updateExpense,
    deleteExpense,
    refresh,
  };
}
