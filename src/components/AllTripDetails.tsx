import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AuditEntry, Expense, Member } from '../lib/types';
import type { TripSummary } from '../lib/calculations';
import {
  formatDateTime,
  formatDate,
  formatINR,
  formatTime,
} from '../lib/format';
import { TRIP_NAME } from '../lib/constants';
import { downloadCsv, downloadPdf, shareSummary, type ReportArgs } from '../lib/exporters';
import { describeAudit } from './AuditModal';
import {
  Avatar,
  IconClose,
  IconDownload,
  IconPrint,
  IconReport,
  IconSheet,
  IconShare,
} from './ui';

interface Props {
  expenses: Expense[];
  members: Member[];
  summary: TripSummary;
  audit: AuditEntry[];
  generatedBy: string;
  onToast: (message: string, tone?: 'success' | 'error') => void;
  onClose: () => void;
}

function SectionTitle({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="mb-2 mt-6 first:mt-0">
      <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-slate-800">
        {children}
      </h3>
      {note && <p className="mt-0.5 text-[11.5px] text-slate-500">{note}</p>}
    </div>
  );
}

export default function AllTripDetails({
  expenses,
  members,
  summary,
  audit,
  generatedBy,
  onToast,
  onClose,
}: Props) {
  const [working, setWorking] = useState<string | null>(null);

  const nameById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const chronological = useMemo(
    () => [...expenses].sort((a, b) => Date.parse(a.expense_date) - Date.parse(b.expense_date)),
    [expenses],
  );

  const args: ReportArgs = { expenses, members, summary, audit, generatedBy };

  const run = async (label: string, fn: () => Promise<void> | void) => {
    setWorking(label);
    try {
      await fn();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Export failed.', 'error');
    } finally {
      setWorking(null);
    }
  };

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60';

  return createPortal(
    <div id="trip-report-portal" className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/55 p-0 sm:p-4">
      <div className="report-shell flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:h-[93vh] sm:rounded-2xl">
        {/* Header */}
        <div className="no-print flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-white">
              <IconReport className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <h2 className="text-[15px] font-extrabold tracking-tight text-slate-900">
                ALL TRIP DETAILS &amp; EXPENSES
              </h2>
              <p className="text-[11px] text-slate-500">
                {TRIP_NAME} · {summary.count} expenses · {formatINR(summary.total)} total
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className={btn}
              disabled={working !== null}
              onClick={() =>
                run('pdf', async () => {
                  await downloadPdf(args);
                  onToast('PDF report downloaded.');
                })
              }
            >
              <IconDownload className="h-3.5 w-3.5" /> {working === 'pdf' ? 'Building…' : 'PDF'}
            </button>
            <button
              type="button"
              className={btn}
              disabled={working !== null}
              onClick={() =>
                run('csv', async () => {
                  downloadCsv(args);
                  onToast('Excel/CSV file downloaded.');
                })
              }
            >
              <IconSheet className="h-3.5 w-3.5" /> {working === 'csv' ? 'Writing…' : 'CSV'}
            </button>
            <button type="button" className={btn} onClick={() => window.print()}>
              <IconPrint className="h-3.5 w-3.5" /> Print
            </button>
            <button
              type="button"
              className={btn}
              disabled={working !== null}
              onClick={() =>
                run('share', async () => {
                  const result = await shareSummary(args);
                  onToast(
                    result === 'shared' ? 'Trip summary shared.' : 'Summary copied to clipboard.',
                  );
                })
              }
            >
              <IconShare className="h-3.5 w-3.5" /> {working === 'share' ? 'Sharing…' : 'Share'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close report"
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <IconClose />
            </button>
          </div>
        </div>

        {/* Scrollable report body */}
        <div className="report-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b-2 border-slate-900 pb-3">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                {TRIP_NAME} — Final Expense Report
              </h1>
              <p className="text-[12px] text-slate-600">
                Prepared by <b>{generatedBy}</b> · Generated {formatDateTime(new Date().toISOString())}
              </p>
            </div>
            <div className="flex -space-x-1.5">
              {members.map((m) => (
                <span key={m.id} className="ring-2 ring-white rounded-full">
                  <Avatar name={m.name} size={26} />
                </span>
              ))}
            </div>
          </div>

          {/* Summary tiles */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-emerald-50/70 p-3">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-emerald-700">
                Total trip expenditure
              </p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-emerald-700">
                {formatINR(summary.total)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                Total expenses
              </p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">
                {summary.count}
              </p>
              <p className="text-[11px] text-slate-500">{summary.totalReceipts} with receipts</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                Highest expense
              </p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">
                {summary.highest ? formatINR(summary.highest.amount) : '—'}
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {summary.highest?.title ?? 'No expenses yet'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                Members in ledger
              </p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">
                {members.length}
              </p>
              <p className="text-[11px] text-slate-500">One shared trip ledger</p>
            </div>
          </div>

          {/* Member-wise */}
          <SectionTitle note="Money paid and expenses entered are counted separately — no equal splitting.">
            Total amount paid &amp; entered by each member
          </SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2.5 font-bold">Member</th>
                  <th className="px-3 py-2.5 text-right font-bold">Total paid</th>
                  <th className="px-3 py-2.5 text-right font-bold">Paid #</th>
                  <th className="px-3 py-2.5 text-right font-bold">Total entered</th>
                  <th className="px-3 py-2.5 text-right font-bold">Entered #</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {summary.memberTotals.map((m) => (
                  <tr key={m.member.id}>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2 font-semibold text-slate-800">
                        <Avatar name={m.member.name} size={22} />
                        {m.member.name}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums text-emerald-700">
                      {formatINR(m.totalPaid)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {m.paidCount}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-800">
                      {formatINR(m.totalEntered)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {m.enteredCount}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold text-slate-900">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                    {formatINR(summary.total)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{summary.count}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(summary.total)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{summary.count}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Category + date breakdowns */}
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <SectionTitle>Category-wise expense breakdown</SectionTitle>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5 font-bold">Category</th>
                      <th className="px-3 py-2.5 text-right font-bold">Expenses</th>
                      <th className="px-3 py-2.5 text-right font-bold">Amount</th>
                      <th className="px-3 py-2.5 text-right font-bold">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {summary.categoryTotals.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-3 text-slate-500">
                          No expenses yet.
                        </td>
                      </tr>
                    )}
                    {summary.categoryTotals.map((c) => (
                      <tr key={c.category}>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{c.category}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                          {c.count}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-900">
                          {formatINR(c.total)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                          {summary.total > 0
                            ? ((c.total / summary.total) * 100).toFixed(1)
                            : '0.0'}
                          %
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <SectionTitle>Date-wise expense breakdown</SectionTitle>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5 font-bold">Date</th>
                      <th className="px-3 py-2.5 text-right font-bold">Expenses</th>
                      <th className="px-3 py-2.5 text-right font-bold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {summary.dateTotals.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-3 text-slate-500">
                          No expenses yet.
                        </td>
                      </tr>
                    )}
                    {summary.dateTotals.map((d) => (
                      <tr key={d.key}>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">
                          {new Date(`${d.key}T00:00:00`).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                          {d.count}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-900">
                          {formatINR(d.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Full chronological ledger */}
          <SectionTitle note="Every record shows who actually paid and who entered it.">
            Complete chronological expense ledger ({summary.count})
          </SectionTitle>
          {chronological.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-[13px] text-slate-500">
              No expenses have been recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[860px] text-left text-[12.5px]">
                <thead className="bg-slate-100 text-[10.5px] uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5 font-bold">#</th>
                    <th className="px-3 py-2.5 font-bold">Date &amp; time</th>
                    <th className="px-3 py-2.5 font-bold">Expense</th>
                    <th className="px-3 py-2.5 text-right font-bold">Amount</th>
                    <th className="px-3 py-2.5 font-bold">Paid by</th>
                    <th className="px-3 py-2.5 font-bold">Entered by</th>
                    <th className="px-3 py-2.5 font-bold">Source</th>
                    <th className="px-3 py-2.5 font-bold">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {chronological.map((e, i) => (
                    <tr key={e.id} className="align-top">
                      <td className="px-3 py-2.5 tabular-nums text-slate-400">{i + 1}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                        {formatDate(e.expense_date)}
                        <span className="block text-[10.5px] text-slate-400">
                          {formatTime(e.expense_date)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-bold text-slate-900">{e.title}</span>
                        {e.description && (
                          <span className="block max-w-[260px] truncate text-[11px] text-slate-500">
                            {e.description}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-extrabold tabular-nums text-emerald-700">
                        {formatINR(e.amount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                          <Avatar name={nameById.get(e.paid_by_member_id) ?? '?'} size={18} />
                          {nameById.get(e.paid_by_member_id) ?? 'Unknown'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <Avatar name={nameById.get(e.entered_by_member_id) ?? '?'} size={18} />
                          {nameById.get(e.entered_by_member_id) ?? 'Unknown'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                        {e.payment_method}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{e.category}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-extrabold text-slate-900">
                    <td colSpan={3} className="px-3 py-2.5">
                      Total ({summary.count} expenses)
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                      {formatINR(summary.total)}
                    </td>
                    <td colSpan={4} className="px-3 py-2.5 text-[11px] font-medium text-slate-500">
                      Nothing is auto-created or auto-split — every row was entered manually.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Audit / transaction history */}
          <SectionTitle note="Append-only log of every create, edit and delete.">
            Complete transaction &amp; change history
          </SectionTitle>
          {audit.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-[13px] text-slate-500">
              No changes recorded yet.
            </p>
          ) : (
            <ol className="space-y-2">
              {audit.slice(0, 200).map((entry) => {
                const by = entry.changed_by_member_id
                  ? (nameById.get(entry.changed_by_member_id) ?? 'Unknown')
                  : 'Unknown';
                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[12.5px]"
                  >
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        entry.action === 'INSERT'
                          ? 'bg-emerald-50 text-emerald-700'
                          : entry.action === 'DELETE'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-sky-50 text-sky-700'
                      }`}
                    >
                      {entry.action}
                    </span>
                    <span className="font-semibold text-slate-800">{by}</span>
                    <span className="min-w-[180px] flex-1 text-slate-600">
                      {describeAudit(entry, nameById, 'expense')}
                    </span>
                    <span className="text-slate-400">{formatDateTime(entry.changed_at)}</span>
                  </li>
                );
              })}
            </ol>
          )}

          <p className="mt-6 border-t border-slate-200 pt-3 text-center text-[11px] text-slate-400">
            TripKhata · {TRIP_NAME} · Shared ledger of {members.length} members · Every rupee
            accounted for.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
