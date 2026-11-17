const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const timeFmt = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const dayFmt = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export const formatINR = (value: number): string => inr.format(value);

/** Plain number without the ₹ glyph — used for PDF export (built-in fonts lack ₹). */
export const formatRs = (value: number): string =>
  `Rs ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  return `${dateFmt.format(d)} · ${timeFmt.format(d)}`;
};

export const formatDate = (iso: string): string => dateFmt.format(new Date(iso));
export const formatTime = (iso: string): string => timeFmt.format(new Date(iso));
export const formatDay = (iso: string): string => dayFmt.format(new Date(iso));

/** Value for <input type="datetime-local"> from an ISO string (local timezone). */
export const toLocalInputValue = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
};

/** ISO string from a datetime-local input value (treated as local time). */
export const fromLocalInputValue = (value: string): string => new Date(value).toISOString();

/** Stable local calendar-day key, e.g. "2026-10-15". */
export const dayKey = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
