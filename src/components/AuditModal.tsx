import { useMemo } from 'react';
import type { AuditEntry, Expense, Member } from '../lib/types';
import { formatDateTime, formatINR } from '../lib/format';
import { Avatar, IconClose } from './ui';

/** Human-readable description of what a single audit entry changed. */
export function describeAudit(
  entry: AuditEntry,
  nameById: Map<string, string>,
  fallbackTitle: string,
): string {
  const title = entry.new_values?.title ?? entry.old_values?.title ?? fallbackTitle;

  if (entry.action === 'INSERT') {
    const amount = entry.new_values?.amount ?? 0;
    const paidBy = nameById.get(entry.new_values?.paid_by_member_id ?? '') ?? '—';
    return `Created "${title}" of ${formatINR(amount)} — paid by ${paidBy}`;
  }

  if (entry.action === 'DELETE') {
    const amount = entry.old_values?.amount ?? 0;
    return `Deleted "${title}" of ${formatINR(amount)}`;
  }

  const changes: string[] = [];
  const oldV = entry.old_values ?? {};
  const newV = entry.new_values ?? {};

  const push = (label: string, a?: string | number | null, b?: string | number | null) => {
    if (String(a ?? '') !== String(b ?? '')) changes.push(`${label}: ${a ?? '—'} → ${b ?? '—'}`);
  };

  push('Title', oldV.title, newV.title);
  push('Amount', oldV.amount != null ? formatINR(Number(oldV.amount)) : null,
    newV.amount != null ? formatINR(Number(newV.amount)) : null);
  push('Category', oldV.category, newV.category);
  push('Paid by', nameById.get(oldV.paid_by_member_id ?? ''), nameById.get(newV.paid_by_member_id ?? ''));
  push('Source', oldV.payment_method, newV.payment_method);
  push('Date', oldV.expense_date ? formatDateTime(oldV.expense_date) : null,
    newV.expense_date ? formatDateTime(newV.expense_date) : null);
  push('Notes', oldV.description, newV.description);

  return changes.length > 0 ? changes.join(' · ') : `Edited "${title}"`;
}

interface Props {
  expense: Expense | null;
  entries: AuditEntry[];
  members: Member[];
  onClose: () => void;
}

export default function AuditModal({ expense, entries, members, onClose }: Props) {
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => map.set(m.id, m.name));
    return map;
  }, [members]);

  if (!expense) return null;

  const related = entries.filter((e) => e.expense_id === expense.id);

  return (
    <div
      className="no-print fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-0 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-none bg-white shadow-2xl sm:my-6 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">Audit history</h2>
            <p className="text-[11.5px] text-slate-500">
              {expense.title} · {formatINR(expense.amount)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <IconClose />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {related.length === 0 ? (
            <p className="text-[13px] text-slate-500">
              No recorded changes — this expense has not been edited since it was created.
            </p>
          ) : (
            <ol className="space-y-3">
              {related.map((entry) => {
                const by = entry.changed_by_member_id
                  ? nameById.get(entry.changed_by_member_id) ?? 'Unknown'
                  : 'Unknown';
                const tone =
                  entry.action === 'INSERT'
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : entry.action === 'DELETE'
                      ? 'bg-rose-50 text-rose-700 ring-rose-200'
                      : 'bg-sky-50 text-sky-700 ring-sky-200';
                return (
                  <li key={entry.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase ring-1 ${tone}`}
                      >
                        {entry.action}
                      </span>
                      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
                        <Avatar name={by} size={18} /> {by}
                      </span>
                      <span className="ml-auto text-[11px] text-slate-500">
                        {formatDateTime(entry.changed_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">
                      {describeAudit(entry, nameById, expense.title)}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
