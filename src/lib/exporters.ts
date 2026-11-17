import type { AuditEntry, Expense, Member } from './types';
import type { TripSummary } from './calculations';
import { formatDateTime, formatRs } from './format';
import { TRIP_NAME } from './constants';

export interface ReportArgs {
  expenses: Expense[];
  members: Member[];
  summary: TripSummary;
  audit: AuditEntry[];
  generatedBy: string;
}

const nameMap = (members: Member[]): Map<string, string> =>
  new Map(members.map((m) => [m.id, m.name]));

const csvCell = (value: unknown): string => {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const download = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const stamp = (): string => new Date().toISOString().slice(0, 10);

/* ------------------------------ CSV ------------------------------ */

export function downloadCsv({ expenses, members }: ReportArgs): void {
  const names = nameMap(members);
  const header = [
    'id',
    'trip_id',
    'title',
    'amount',
    'category',
    'description',
    'paid_by_member',
    'entered_by_member',
    'payment_method',
    'expense_date',
    'receipt_url',
    'created_at',
    'updated_at',
  ];

  const rows = expenses.map((e) =>
    [
      e.id,
      e.trip_id,
      e.title,
      e.amount.toFixed(2),
      e.category,
      e.description ?? '',
      names.get(e.paid_by_member_id) ?? '',
      names.get(e.entered_by_member_id) ?? '',
      e.payment_method,
      e.expense_date,
      e.receipt_url ?? '',
      e.created_at,
      e.updated_at,
    ]
      .map(csvCell)
      .join(','),
  );

  // BOM so Excel opens UTF-8 (₹) correctly.
  const csv = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `tripkhata-${stamp()}.csv`);
}

/* ------------------------------ PDF ------------------------------ */

export async function downloadPdf(args: ReportArgs): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const { expenses, members, summary, audit, generatedBy } = args;
  const names = nameMap(members);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  let y = margin;

  const ensureRoom = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const heading = (text: string) => {
    ensureRoom(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(text, margin, y);
    y += 14;
  };

  const table = (head: string[], body: (string | number)[][], opts: Record<string, unknown> = {}) => {
    ensureRoom(40);
    autoTable(doc, {
      head: [head],
      body,
      startY: y,
      margin: { left: margin, right: margin },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4, textColor: [30, 41, 59] },
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      theme: 'striped',
      ...opts,
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 16;
  };

  /* Title */
  doc.setFillColor(5, 150, 105);
  doc.rect(margin, y, 6, 26, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(15, 23, 42);
  doc.text(`${TRIP_NAME} — Complete Expense Report`, margin + 14, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `TripKhata · Generated ${formatDateTime(new Date().toISOString())} by ${generatedBy}`,
    margin + 14,
    y + 26,
  );
  y += 42;

  /* Summary */
  heading('Final Report Summary');
  table(
    ['Metric', 'Value'],
    [
      ['Total trip expenditure', formatRs(summary.total)],
      ['Total number of expenses', String(summary.count)],
      [
        'Highest expense',
        summary.highest ? `${summary.highest.title} (${formatRs(summary.highest.amount)})` : '—',
      ],
      ['Receipts attached', String(summary.totalReceipts)],
    ],
  );

  /* Members */
  heading('Amount paid vs expenses entered (per member)');
  table(
    ['Member', 'Total paid', 'Paid count', 'Total entered', 'Entered count'],
    summary.memberTotals.map((m) => [
      m.member.name,
      formatRs(m.totalPaid),
      String(m.paidCount),
      formatRs(m.totalEntered),
      String(m.enteredCount),
    ]),
  );

  /* Categories */
  heading('Category-wise breakdown');
  table(
    ['Category', 'Amount', 'Expenses', 'Share %'],
    summary.categoryTotals.map((c) => [
      c.category,
      formatRs(c.total),
      String(c.count),
      summary.total > 0 ? ((c.total / summary.total) * 100).toFixed(1) : '0.0',
    ]),
  );

  /* Dates */
  heading('Date-wise breakdown');
  table(
    ['Date', 'Expenses', 'Amount'],
    summary.dateTotals.map((d) => [
      new Date(`${d.key}T00:00:00`).toLocaleDateString('en-IN'),
      String(d.count),
      formatRs(d.total),
    ]),
  );

  /* Full ledger */
  heading(`Complete chronological ledger (${expenses.length} records)`);
  table(
    ['#', 'Date & time', 'Expense', 'Amount', 'Paid by', 'Entered by', 'Source', 'Category', 'Notes'],
    [...expenses]
      .sort((a, b) => Date.parse(a.expense_date) - Date.parse(b.expense_date))
      .map((e, i) => [
        String(i + 1),
        formatDateTime(e.expense_date),
        e.title,
        formatRs(e.amount),
        names.get(e.paid_by_member_id) ?? '—',
        names.get(e.entered_by_member_id) ?? '—',
        e.payment_method,
        e.category,
        (e.description ?? '').replace(/\s+/g, ' ').slice(0, 60),
      ]),
    { styles: { fontSize: 7.5, cellPadding: 3 } },
  );

  /* History */
  if (audit.length > 0) {
    heading('Complete transaction / change history');
    table(
      ['When', 'Action', 'By member', 'Details'],
      audit.slice(0, 120).map((a) => [
        formatDateTime(a.changed_at),
        a.action,
        a.changed_by_member_id ? names.get(a.changed_by_member_id) ?? '—' : '—',
        historyDetail(a),
      ]),
      { styles: { fontSize: 7.5, cellPadding: 3 } },
    );
  }

  doc.save(`tripkhata-${stamp()}.pdf`);
}

const historyDetail = (a: AuditEntry): string => {
  const title = a.new_values?.title ?? a.old_values?.title ?? '';
  if (a.action === 'INSERT') return `Created "${title}"`;
  if (a.action === 'DELETE') return `Deleted "${title}"`;
  const oldA = a.old_values?.amount;
  const newA = a.new_values?.amount;
  if (oldA !== newA) return `"${title}" amount ${oldA} → ${newA}`;
  return `Edited "${title}"`;
};

/* ----------------------------- Share ----------------------------- */

export function buildShareText({ members, summary, expenses }: ReportArgs): string {
  const lines: string[] = [
    `${TRIP_NAME} — TripKhata Summary`,
    `Total spent: ₹${summary.total.toLocaleString('en-IN')} across ${summary.count} expenses`,
  ];
  if (summary.highest) {
    lines.push(`Highest: ${summary.highest.title} — ₹${summary.highest.amount.toLocaleString('en-IN')}`);
  }
  lines.push('', 'Paid by each member:');
  summary.memberTotals.forEach((m) => {
    lines.push(
      `• ${m.member.name}: paid ₹${m.totalPaid.toLocaleString('en-IN')} (${m.paidCount}) · entered ₹${m.totalEntered.toLocaleString('en-IN')} (${m.enteredCount})`,
    );
  });
  if (summary.categoryTotals.length) {
    lines.push('', 'By category:');
    summary.categoryTotals.forEach((c) => {
      lines.push(`• ${c.category}: ₹${c.total.toLocaleString('en-IN')} (${c.count})`);
    });
  }
  lines.push('', `${expenses.length} entries · ${members.length} members · shared on TripKhata`);
  return lines.join('\n');
}

export async function shareSummary(args: ReportArgs): Promise<'shared' | 'copied'> {
  const text = buildShareText(args);
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: `${TRIP_NAME} — TripKhata Summary`, text });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'shared';
    }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}
