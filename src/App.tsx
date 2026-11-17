import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import LedgerList, { Filters } from './components/LedgerList';
import ExpenseFormModal from './components/ExpenseFormModal';
import AllTripDetails from './components/AllTripDetails';
import AuditModal from './components/AuditModal';
import {
  CategoryBreakdownPanel,
  DateBreakdownPanel,
  MemberSummaryPanel,
} from './components/SummaryPanels';
import { IconPlus, IconReport, StatCard } from './components/ui';
import { useLedger } from './hooks/useLedger';
import { useActiveMember } from './hooks/useActiveMember';
import { useToast } from './hooks/useToast';
import {
  buildSummary,
  emptyFilters,
  filterExpenses,
  sortExpenses,
  type ExpenseFilters,
  type SortDir,
  type SortKey,
} from './lib/calculations';
import { formatINR } from './lib/format';
import type { Expense, ExpenseInput } from './lib/types';

interface FormState {
  mode: 'add' | 'edit';
  expense?: Expense;
}

export default function App() {
  const {
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
  } = useLedger();

  const [activeMemberId, setActiveMemberId] = useActiveMember();
  const { toast, show } = useToast();

  const [formState, setFormState] = useState<FormState | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [auditExpense, setAuditExpense] = useState<Expense | null>(null);
  const [filters, setFilters] = useState<ExpenseFilters>(emptyFilters);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const activeMember = members.find((m) => m.id === activeMemberId) ?? members[0];

  // Deep-link used by the notification emails: <app-url>/?report=1 opens the
  // full trip report straight away, so the "View complete trip expense
  // report" button in every email lands on the ledger instead of the home
  // screen. Also accepts #report for hash-based hosting.
  useEffect(() => {
    const wantsReport =
      new URLSearchParams(window.location.search).get('report') === '1' ||
      window.location.hash === '#report';
    if (!wantsReport) return;
    setReportOpen(true);
    // Remove the flag so closing the modal doesn't reopen it on a refresh.
    if (window.location.search || window.location.hash) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const summary = useMemo(() => buildSummary(expenses, members), [expenses, members]);
  const visible = useMemo(
    () => sortExpenses(filterExpenses(expenses, filters), sortKey, sortDir),
    [expenses, filters, sortKey, sortDir],
  );

  const openAdd = () => setFormState({ mode: 'add' });
  const openEdit = (expense: Expense) => setFormState({ mode: 'edit', expense });

  const handleFormSubmit = async (input: ExpenseInput, file: File | null) => {
    if (formState?.mode === 'edit' && formState.expense) {
      await updateExpense(formState.expense.id, input, activeMemberId, file);
      show('Expense updated — every total recalculated.');
    } else {
      await addExpense(input, activeMemberId, file);
      show('Expense added to the shared trip ledger.');
    }
    setFormState(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteExpense(id, activeMemberId);
      show('Expense deleted — audit history updated.');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not delete the expense.', 'error');
      throw err;
    }
  };

  const setSort = (key: SortKey, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        members={members}
        activeMemberId={activeMemberId}
        onSwitchMember={setActiveMemberId}
        onOpenReport={() => setReportOpen(true)}
      />

      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5">
        {error && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
            <span className="font-semibold">{error}</span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="ml-auto font-bold underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Live summary */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total trip expenditure"
            value={loading ? '…' : formatINR(summary.total)}
            sub={`Sum of ${summary.count} manually recorded expense${summary.count === 1 ? '' : 's'}`}
            accent="emerald"
          />
          <StatCard
            label="Expenses recorded"
            value={loading ? '…' : String(summary.count)}
            sub={`${summary.totalReceipts} receipt${summary.totalReceipts === 1 ? '' : 's'} attached`}
          />
          <StatCard
            label="Highest expense"
            value={summary.highest ? formatINR(summary.highest.amount) : '—'}
            sub={summary.highest?.title ?? 'Nothing recorded yet'}
          />
          <StatCard
            label="Recording as"
            value={activeMember?.name ?? '—'}
            sub="Auto-filled as Entered by"
          />
        </div>

        {/* The prominent report button */}
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="group mt-4 flex w-full items-center justify-between gap-4 rounded-2xl bg-emerald-600 px-5 py-4 text-left text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/30"
        >
          <span>
            <span className="block text-[15px] font-extrabold tracking-wide sm:text-lg">
              ALL TRIP DETAILS &amp; EXPENSES
            </span>
            <span className="mt-0.5 block text-[12px] leading-snug text-emerald-50 sm:text-[13px]">
              Full chronological ledger · paid-by &amp; entered-by · member, category and date
              breakdowns · PDF, CSV, print and share
            </span>
          </span>
          <IconReport className="h-8 w-8 shrink-0 opacity-90 transition group-hover:translate-x-1" />
        </button>

        {/* Ledger toolbar */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[15px] font-extrabold tracking-tight text-slate-900">
              Shared trip ledger
            </h1>
            <p className="text-[12px] text-slate-500">
              Every member adds their own expenses manually — nothing is created or split
              automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            disabled={!activeMember}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
          >
            <IconPlus /> Add Expense
          </button>
        </div>

        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <Filters
              filters={filters}
              setFilters={setFilters}
              sortKey={sortKey}
              sortDir={sortDir}
              setSort={setSort}
              members={members}
            />

            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white"
                  />
                ))}
              </div>
            ) : (
              <LedgerList
                expenses={visible}
                members={members}
                activeMemberId={activeMemberId}
                totalBeforeFilters={expenses.length}
                onAdd={openAdd}
                onEdit={openEdit}
                onDelete={handleDelete}
                onHistory={setAuditExpense}
              />
            )}
          </div>

          <aside className="space-y-4">
            <MemberSummaryPanel summary={summary} />
            <CategoryBreakdownPanel summary={summary} />
            <DateBreakdownPanel summary={summary} />
          </aside>
        </div>
      </main>

      {/* Modals */}
      {formState && (
        <ExpenseFormModal
          mode={formState.mode}
          initial={formState.expense ?? null}
          members={members}
          activeMemberId={activeMemberId}
          busy={busy}
          onCancel={() => setFormState(null)}
          onSubmit={handleFormSubmit}
        />
      )}

      {reportOpen && (
        <AllTripDetails
          expenses={expenses}
          members={members}
          summary={summary}
          audit={audit}
          generatedBy={activeMember?.name ?? 'TripKhata'}
          onToast={show}
          onClose={() => setReportOpen(false)}
        />
      )}

      {auditExpense && (
        <AuditModal
          expense={auditExpense}
          entries={audit}
          members={members}
          onClose={() => setAuditExpense(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`no-print fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-xl px-4 py-2.5 text-[13px] font-semibold shadow-xl ring-1 ${
            toast.tone === 'error'
              ? 'bg-rose-600 text-white ring-rose-700'
              : 'bg-slate-900 text-white ring-slate-700'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
