import type { TripSummary as Summary } from '../lib/calculations';
import { formatINR } from '../lib/format';
import { Avatar, Card } from './ui';

export function MemberSummaryPanel({ summary }: { summary: Summary }) {
  const max = Math.max(1, ...summary.memberTotals.map((m) => Math.max(m.totalPaid, m.totalEntered)));

  return (
    <Card
      title="Member-wise summary"
      hint="Paid = own money spent · Entered = expenses recorded"
    >
      <ul className="space-y-3.5">
        {summary.memberTotals.map(({ member, totalPaid, totalEntered, paidCount, enteredCount }) => (
          <li key={member.id}>
            <div className="flex items-center gap-2">
              <Avatar name={member.name} size={24} />
              <span className="text-[13.5px] font-bold text-slate-800">{member.name}</span>
              <span className="ml-auto text-[13px] font-bold tabular-nums text-emerald-700">
                {formatINR(totalPaid)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${(totalPaid / max) * 100}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>
                paid for <b className="text-slate-700">{paidCount}</b> expense
                {paidCount === 1 ? '' : 's'}
              </span>
              <span>
                entered <b className="text-slate-700">{formatINR(totalEntered)}</b> ·{' '}
                <b className="text-slate-700">{enteredCount}</b> record{enteredCount === 1 ? '' : 's'}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-slate-500 ring-1 ring-slate-100">
        Money paid and expenses entered are counted separately — they are never treated as the same
        thing, and nothing is divided equally.
      </p>
    </Card>
  );
}

export function CategoryBreakdownPanel({ summary }: { summary: Summary }) {
  const max = Math.max(1, ...summary.categoryTotals.map((c) => c.total));

  if (summary.categoryTotals.length === 0) {
    return (
      <Card title="Category-wise breakdown">
        <p className="text-[12.5px] text-slate-500">No expenses recorded yet.</p>
      </Card>
    );
  }

  return (
    <Card title="Category-wise breakdown" hint="Where the money actually went">
      <ul className="space-y-3">
        {summary.categoryTotals.map((c) => {
          const share = summary.total > 0 ? (c.total / summary.total) * 100 : 0;
          return (
            <li key={c.category}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="font-semibold text-slate-700">{c.category}</span>
                <span className="font-bold tabular-nums text-slate-900">{formatINR(c.total)}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-700 transition-all"
                  style={{ width: `${(c.total / max) * 100}%` }}
                />
              </div>
              <p className="mt-0.5 text-[10.5px] text-slate-500">
                {share.toFixed(1)}% of trip · {c.count} expense{c.count === 1 ? '' : 's'}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function DateBreakdownPanel({ summary }: { summary: Summary }) {
  return (
    <Card title="Date-wise breakdown" hint="Day-by-day trip spend">
      {summary.dateTotals.length === 0 ? (
        <p className="text-[12.5px] text-slate-500">No expenses recorded yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {summary.dateTotals.map((d) => (
            <li key={d.key} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-slate-700">
                  {new Date(`${d.key}T00:00:00`).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
                <p className="text-[10.5px] text-slate-500">
                  {d.count} expense{d.count === 1 ? '' : 's'}
                </p>
              </div>
              <span className="shrink-0 text-[14px] font-bold tabular-nums text-emerald-700">
                {formatINR(d.total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
