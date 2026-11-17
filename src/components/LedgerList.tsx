import { useMemo, useState } from 'react';
import type { Expense, Member } from '../lib/types';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../lib/types';
import {
  emptyFilters,
  type ExpenseFilters,
  type SortDir,
  type SortKey,
} from '../lib/calculations';
import { formatINR, formatDateTime } from '../lib/format';
import {
  Avatar,
  EmptyState,
  IconEdit,
  IconHistory,
  IconLock,
  IconPlus,
  IconReceipt,
  IconSearch,
  IconTrash,
} from './ui';

interface ListProps {
  expenses: Expense[];
  members: Member[];
  activeMemberId: string;
  totalBeforeFilters: number;
  onAdd: () => void;
  onEdit: (e: Expense) => void;
  onDelete: (id: string) => Promise<void>;
  onHistory: (e: Expense) => void;
}

export function Filters({
  filters,
  setFilters,
  sortKey,
  sortDir,
  setSort,
  members,
}: {
  filters: ExpenseFilters;
  setFilters: (f: ExpenseFilters) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  setSort: (key: SortKey, dir: SortDir) => void;
  members: Member[];
}) {
  const dirty =
    filters.search !== '' ||
    filters.category !== '' ||
    filters.paidBy !== '' ||
    filters.enteredBy !== '' ||
    filters.paymentMethod !== '' ||
    filters.from !== '' ||
    filters.to !== '';

  const set = (patch: Partial<ExpenseFilters>) => setFilters({ ...filters, ...patch });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Search title or notes…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <select
          value={filters.category}
          onChange={(e) => set({ category: e.target.value })}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[13px] font-medium text-slate-700 outline-none focus:border-emerald-500"
        >
          <option value="">All categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={filters.paidBy}
          onChange={(e) => set({ paidBy: e.target.value })}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[13px] font-medium text-slate-700 outline-none focus:border-emerald-500"
        >
          <option value="">Paid by: anyone</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              Paid by {m.name}
            </option>
          ))}
        </select>

        <select
          value={filters.enteredBy}
          onChange={(e) => set({ enteredBy: e.target.value })}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[13px] font-medium text-slate-700 outline-none focus:border-emerald-500"
        >
          <option value="">Entered by: anyone</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              Entered by {m.name}
            </option>
          ))}
        </select>

        <select
          value={filters.paymentMethod}
          onChange={(e) => set({ paymentMethod: e.target.value })}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[13px] font-medium text-slate-700 outline-none focus:border-emerald-500"
        >
          <option value="">Any source</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={filters.from}
          onChange={(e) => set({ from: e.target.value })}
          title="From date"
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-[13px] text-slate-700 outline-none focus:border-emerald-500"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => set({ to: e.target.value })}
          title="To date"
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-[13px] text-slate-700 outline-none focus:border-emerald-500"
        />

        <select
          value={`${sortKey}-${sortDir}`}
          onChange={(e) => {
            const [k, d] = e.target.value.split('-') as [SortKey, SortDir];
            setSort(k, d);
          }}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[13px] font-medium text-slate-700 outline-none focus:border-emerald-500"
        >
          <option value="date-desc">Newest first</option>
          <option value="date-asc">Oldest first</option>
          <option value="amount-desc">Amount: high → low</option>
          <option value="amount-asc">Amount: low → high</option>
        </select>

        {dirty && (
          <button
            type="button"
            onClick={() => setFilters({ ...emptyFilters })}
            className="rounded-lg px-2.5 py-2 text-[12.5px] font-semibold text-slate-500 underline transition hover:text-slate-800"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function ExpenseCard({
  expense,
  paidByName,
  enteredByName,
  owned,
  busy,
  onEdit,
  onDelete,
  onHistory,
}: {
  expense: Expense;
  paidByName: string;
  enteredByName: string;
  owned: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onHistory: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-bold leading-snug text-slate-900">{expense.title}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-600">
              {expense.category}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] font-medium text-slate-500">
            {formatDateTime(expense.expense_date)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-extrabold tabular-nums text-emerald-700">
            {formatINR(expense.amount)}
          </p>
          <p className="text-[11px] font-semibold text-slate-500">{expense.payment_method}</p>
        </div>
      </div>

      {expense.description && (
        <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{expense.description}</p>
      )}

      {/* Who paid vs who recorded — always visible, never ambiguous. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11.5px] text-slate-600 ring-1 ring-slate-100">
        <span className="flex items-center gap-1.5">
          Paid by
          <Avatar name={paidByName} size={16} />
          <b className="font-bold text-slate-800">{paidByName}</b>
        </span>
        <span className="text-slate-300">·</span>
        <span className="flex items-center gap-1.5">
          Entered by
          <Avatar name={enteredByName} size={16} />
          <b className="font-bold text-slate-800">{enteredByName}</b>
        </span>
        <span className="text-slate-300">·</span>
        <span>
          Source: <b className="font-bold text-slate-800">{expense.payment_method}</b>
        </span>
        {expense.receipt_url && (
          <>
            <span className="text-slate-300">·</span>
            <a
              href={expense.receipt_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-bold text-emerald-700 underline-offset-2 hover:underline"
            >
              <IconReceipt className="h-3.5 w-3.5" /> Receipt
            </a>
          </>
        )}
      </div>

      {error && <p className="mt-2 text-[12px] font-medium text-rose-600">{error}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onHistory}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <IconHistory className="h-3.5 w-3.5" /> History
        </button>

        {owned ? (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <IconEdit className="h-3.5 w-3.5" /> Edit
            </button>
            {confirming ? (
              <span className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold text-rose-600">Delete this entry?</span>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="font-semibold text-slate-500 underline"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await onDelete();
                      setConfirming(false);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Delete failed.');
                      setConfirming(false);
                    }
                  }}
                  className="rounded-md bg-rose-600 px-2 py-1 font-bold text-white disabled:opacity-60"
                >
                  {busy ? '…' : 'Delete'}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <IconTrash className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-slate-400">
            <IconLock /> Only {enteredByName} can edit or delete this entry
          </span>
        )}
      </div>
    </li>
  );
}

export default function LedgerList({
  expenses,
  members,
  activeMemberId,
  totalBeforeFilters,
  onAdd,
  onEdit,
  onDelete,
  onHistory,
}: ListProps) {
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => map.set(m.id, m.name));
    return map;
  }, [members]);

  if (expenses.length === 0) {
    return (
      <EmptyState
        title={totalBeforeFilters === 0 ? 'No expenses yet' : 'No expenses match these filters'}
        body={
          totalBeforeFilters === 0
            ? 'Nothing has been recorded yet. Every member adds their own expenses manually — nothing is created automatically and nothing is split equally.'
            : 'Try clearing the search, filters or date range to see the full ledger again.'
        }
      />
    );
  }

  const shownTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[12.5px] font-semibold text-slate-600">
          {expenses.length} expense{expenses.length === 1 ? '' : 's'} shown
          {totalBeforeFilters !== expenses.length && ` of ${totalBeforeFilters}`}
        </p>
        <p className="text-[13px] font-bold tabular-nums text-emerald-700">
          Shown total: {formatINR(shownTotal)}
        </p>
      </div>

      <ul className="space-y-3">
        {expenses.map((e) => (
          <ExpenseCard
            key={e.id}
            expense={e}
            paidByName={nameById.get(e.paid_by_member_id) ?? 'Unknown'}
            enteredByName={nameById.get(e.entered_by_member_id) ?? 'Unknown'}
            owned={e.entered_by_member_id === activeMemberId}
            busy={false}
            onEdit={() => onEdit(e)}
            onDelete={() => onDelete(e.id)}
            onHistory={() => onHistory(e)}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={onAdd}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 px-4 py-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50 sm:hidden"
      >
        <IconPlus /> Add another expense
      </button>
    </div>
  );
}
