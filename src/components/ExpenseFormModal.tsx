import { useState } from 'react';
import type { Expense, ExpenseInput, Member, PaymentMethod } from '../lib/types';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../lib/types';
import { fromLocalInputValue, toLocalInputValue } from '../lib/format';
import { Avatar, Field, IconClose, IconReceipt, inputClass } from './ui';

interface Props {
  mode: 'add' | 'edit';
  initial?: Expense | null;
  members: Member[];
  activeMemberId: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: ExpenseInput, file: File | null) => Promise<void>;
}

/**
 * Manual expense entry. "Paid by" is chosen freely; "Entered by" is always the
 * active profile — the two are deliberately never assumed to be the same person.
 */
export default function ExpenseFormModal({
  mode,
  initial,
  members,
  activeMemberId,
  busy,
  onCancel,
  onSubmit,
}: Props) {
  const active = members.find((m) => m.id === activeMemberId) ?? members[0];

  const [title, setTitle] = useState(initial?.title ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [category, setCategory] = useState(initial?.category ?? 'Food');
  const [dateLocal, setDateLocal] = useState(
    toLocalInputValue(initial?.expense_date ?? new Date().toISOString()),
  );
  const [description, setDescription] = useState(initial?.description ?? '');
  const [paidBy, setPaidBy] = useState(initial?.paid_by_member_id ?? activeMemberId);
  const [method, setMethod] = useState<PaymentMethod>(initial?.payment_method ?? 'Cash');
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedTitle = title.trim();
    const numericAmount = Number(amount);

    if (!trimmedTitle) return setFormError('Give the expense a title (e.g. "Hotel Booking").');
    if (!amount || !Number.isFinite(numericAmount) || numericAmount <= 0)
      return setFormError('Enter an amount greater than ₹0.');
    if (numericAmount > 100_000_000) return setFormError('That amount looks too large.');
    if (!paidBy) return setFormError('Select who actually paid the money.');
    if (Number.isNaN(Date.parse(dateLocal))) return setFormError('Pick a valid date and time.');

    const input: ExpenseInput = {
      title: trimmedTitle,
      amount: numericAmount,
      category,
      description: description.trim() || null,
      paid_by_member_id: paidBy,
      payment_method: method,
      expense_date: fromLocalInputValue(dateLocal),
      receipt_url: initial?.receipt_url ?? null,
    };

    try {
      await onSubmit(input, file);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the expense.');
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-0 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="my-0 w-full max-w-lg rounded-none bg-white shadow-2xl sm:my-6 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">
              {mode === 'add' ? 'Add Trip Expense' : 'Edit Expense'}
            </h2>
            <p className="text-[11.5px] text-slate-500">
              {mode === 'add'
                ? 'Every rupee, recorded manually and transparently.'
                : 'Changes are logged in the audit history.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <IconClose />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[calc(100vh-9rem)] overflow-y-auto px-5 py-4">
          {formError && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] font-medium text-rose-700">
              {formError}
            </div>
          )}

          <div className="grid gap-4">
            <Field label="Expense title" required>
              <input
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Hotel Booking, Dinner, Petrol"
                maxLength={200}
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount (₹)" required>
                <input
                  className={`${inputClass} tabular-nums`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="8000"
                />
              </Field>
              <Field label="Category" required>
                <select
                  className={inputClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Date & time" required>
              <input
                type="datetime-local"
                className={inputClass}
                value={dateLocal}
                onChange={(e) => setDateLocal(e.target.value)}
              />
            </Field>

            <Field
              label="Paid by"
              required
              hint="Who actually handed over the money — this can differ from who is entering it."
            >
              <select
                className={inputClass}
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
              <p className="text-[12.5px] font-semibold text-sky-900">
                Expense entered by:{' '}
                <span className="flex items-center gap-1.5 align-middle font-bold">
                  {active && <Avatar name={active.name} size={20} />}
                  {active?.name}
                </span>
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-sky-800/80">
                Identified automatically from your selected profile (top bar). Switch the profile
                there if you are recording on someone else&apos;s behalf.
              </p>
            </div>

            <Field label="Payment source / money method" required>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                      method === m
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Description / notes" hint="Optional — what exactly was the money spent on.">
              <textarea
                className={`${inputClass} min-h-20 resize-y`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. 2 rooms, 1 night, incl. breakfast"
                maxLength={1000}
              />
            </Field>

            <Field
              label="Receipt / photo"
              hint={
                initial?.receipt_url
                  ? 'A receipt is already attached. Choosing a new file replaces it.'
                  : 'Optional. Image or PDF up to 500 KB in local mode.'
              }
            >
              <div className="flex items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-700 transition hover:bg-slate-50">
                  <IconReceipt className="h-4 w-4" />
                  {file ? file.name : initial?.receipt_url ? 'Replace receipt' : 'Choose file'}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {file && (
                  <button
                    type="button"
                    className="text-[12px] font-semibold text-slate-500 underline"
                    onClick={() => setFile(null)}
                  >
                    Clear
                  </button>
                )}
                {!file && initial?.receipt_url && (
                  <a
                    href={initial.receipt_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] font-semibold text-emerald-700 underline"
                  >
                    View current
                  </a>
                )}
              </div>
            </Field>
          </div>

          <div className="mt-5 flex gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-[2] rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Saving…' : mode === 'add' ? 'Add Expense to Ledger' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
