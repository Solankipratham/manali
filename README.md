# TripKhata — Manali Trip Expense Ledger

A transparent, manual expense ledger for a 5-member Manali trip
(**Rohit · Pratham · Adarsh · Neeraj · Prince**) with a complete final report.

> **Every rupee has a clear record of where it went, who actually paid it,
> and who entered the expense.**

---

## What it does

| Area | Details |
| --- | --- |
| **Manual entry** | Every member adds their own expenses: title, amount (₹), category, date & time, notes, **Paid by**, **Expense entered by** (auto = your active profile), money source (Cash / UPI / Bank Transfer / Card / Other), optional receipt photo. |
| **Paid ≠ Entered** | `paid_by_member_id` and `entered_by_member_id` are separate fields, shown on every record. They are never assumed to be the same person. |
| **ALL TRIP DETAILS & EXPENSES** | Prominent button → full chronological ledger with amount, category, paid-by, entered-by, source, date/time, plus member / category / date breakdowns and complete change history. |
| **Auto calculations** | Adding an expense instantly updates total trip expenditure, member totals paid, member totals entered, category totals, date totals and the report. |
| **Rules** | No fake expenses, no auto-splitting, no overwriting others' entries — only the member who *entered* a record can edit/delete it (enforced in the database too). Every change lands in an append-only audit history. |
| **Export** | PDF, Excel/CSV, Print (print styles included), and Share (Web Share API → clipboard fallback). |
| **Sync** | Supabase Postgres + Row Level Security + realtime updates. Falls back to local browser storage until credentials are added. |

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

The app runs immediately in **Local mode** (browser storage) so you can try the
whole flow. It switches to **Live · Supabase** automatically once configured.

```bash
npm run build      # type-check + production build
```

---

## Connecting Supabase (3 steps)

### 1. Run the SQL migration

Open **Supabase Dashboard → your project → SQL Editor → New query**, paste the
entire contents of:

```
supabase/migrations/0001_tripkhata_schema.sql
```

…and press **Run**. (Or, with the Supabase CLI configured: `supabase db push`.)

What it creates:

- `trips`, `members`, `expenses`, `expense_audit` tables with foreign keys and indexes
- Seed row for the **Manali Trip** and the five members (Rohit, Pratham, Adarsh, Neeraj, Prince)
- `updated_at` trigger + append-only audit trigger
- **RLS**: shared-ledger select/insert for all members; **no direct UPDATE/DELETE**
  on `expenses` — edits must go through `update_expense()` / `delete_expense()`,
  which raise an error unless `entered_by_member_id` matches the caller
- `update_expense()` / `delete_expense()` security-definer functions that write the audit row
- Realtime publication for `expenses` and `expense_audit`
- Public `receipts` storage bucket for receipt uploads

### 2. Create `.env`

```bash
copy .env.example .env        # Windows
```

Fill in from **Project Settings → API**:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

### 3. Restart the dev server

`npm run dev` again — the header badge changes to **● Live · Supabase** and
every device sharing the project sees the same ledger in real time.

---

## How the numbers work

All figures come from one pure function (`src/lib/calculations.ts → buildSummary`):

- **Total Trip Expense** = Σ of every valid expense record
- **Member Total Paid** = Σ of expenses where that member is in *Paid by*
- **Member Total Entered** = Σ of expenses where that member is in *Entered by*
- **Category / Date totals** = Σ grouped by category / calendar day
- **Highest expense** = max amount record

Nothing is ever auto-created or auto-divided — the app contains **no split
logic at all**, by design.

---

## Project structure

```
├── supabase/migrations/0001_tripkhata_schema.sql   # schema + RLS + realtime
├── src/
│   ├── App.tsx                     # layout, state, modals
│   ├── components/
│   │   ├── Header.tsx              # brand, mode badge, profile switcher, report button
│   │   ├── ExpenseFormModal.tsx    # add / edit expense (Paid by vs Entered by)
│   │   ├── LedgerList.tsx          # filters + ledger records (paid/entered shown)
│   │   ├── AllTripDetails.tsx      # ALL TRIP DETAILS & EXPENSES report + exports
│   │   ├── SummaryPanels.tsx       # member / category / date breakdowns
│   │   ├── AuditModal.tsx          # per-expense change history
│   │   └── ui.tsx                  # icons, avatar, cards, fields
│   ├── hooks/
│   │   ├── useLedger.ts            # load + realtime refresh + mutations
│   │   ├── useActiveMember.ts      # "logged in" profile (Entered by)
│   │   └── useToast.ts
│   └── lib/
│       ├── types.ts                # Expense, Member, AuditEntry, categories
│       ├── constants.ts            # trip id + 5 seeded member ids
│       ├── calculations.ts         # summary, filters, sorting
│       ├── storage.ts              # Supabase + local storage adapters
│       ├── exporters.ts            # PDF / CSV / share
│       └── format.ts               # ₹, dates, times
```

---

## Rules enforced by the code

1. Every expense is recorded manually — nothing is generated.
2. *Paid by* and *Entered by* are separate, always visible on each record.
3. Only the member who **entered** a record can edit or delete it (checked in
   the app **and** in the Postgres functions).
4. Every create/edit/delete writes an `expense_audit` row (append-only; the
   table rejects updates and has no delete policy).
5. All five members share one trip ledger; every change refreshes the report.

---

## Design

Neutral white / grey / slate palette with **emerald green** reserved for money
figures and paid indicators, tabular numerals for amounts, responsive
mobile layout (single column, wrapping filters), and a dedicated print
stylesheet so the report prints cleanly on A4.
