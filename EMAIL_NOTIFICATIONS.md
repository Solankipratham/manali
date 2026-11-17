# TripKhata — Five-Member Email Notifications

Every time **any** member adds an expense, all five members get one email with
the full transaction details and a link to the complete trip report.

Nothing is hardcoded. Email addresses live in the `trip_members` table and are
managed by you in Supabase. No API key ever reaches the browser.

---

## Architecture

```
member clicks "Add Expense"
        │
        ▼
   INSERT INTO expenses  ──────────────►  (existing ledger, unchanged)
        │
        │ AFTER INSERT trigger  ── runs only if the INSERT commits
        ▼
   notification_outbox        durable queue, ONE row per expense
        │
        │ pg_net (fires after COMMIT — never for a rolled-back expense)
        ▼
   Edge Function: notify-new-expense
        │  ├─ verifies internal x-notify-secret (stored in DB, not an API key)
        │  ├─ claims rows with FOR UPDATE SKIP LOCKED  → no double send
        │  ├─ reads trip_members for THIS trip's addresses
        │  └─ per recipient: claim → Resend → log   (one failure never blocks the rest)
        ▼
   notification_log           one row per recipient: status, provider id, error, sent_at
```

**Files**

| File | Purpose |
|---|---|
| `supabase/migrations/0002_trip_notifications.sql` | Tables, RLS, trigger, queue/claim/retry functions |
| `supabase/functions/notify-new-expense/index.ts` | Edge Function — builds and sends the emails |
| `scripts/notification-rules.test.ts` | 21 automated checks (`npm run test:notify`) |

---

## Step 1 — Apply the SQL migration

1. Supabase Dashboard → **SQL Editor** → **New query**
2. Paste the entire contents of
   `supabase/migrations/0002_trip_notifications.sql`
3. Click **Run**

You should see `Success. No rows returned`.

> Idempotent — safe to re-run. It will not wipe emails you have already added.

**Verify:**

```sql
select member_name, email, email_notifications_enabled
from public.trip_members order by created_at;
```

You should see Rohit, Pratham, Adarsh, Neeraj, Prince — one row each, `email`
empty, `email_notifications_enabled = true`.

> If this query returns nothing, migration 0001 (your existing schema) must run
> first — `trip_members` is seeded from `public.members`.

---

## Step 2 — Add the five email addresses

**Option A — Table Editor (easiest)**

Dashboard → **Table Editor** → `trip_members` → double-click the `email` cell →
paste an address → Enter.

**Option B — SQL**

```sql
update public.trip_members set email = 'rohit@example.com'   where member_name = 'Rohit';
update public.trip_members set email = 'pratham@example.com' where member_name = 'Pratham';
update public.trip_members set email = 'adarsh@example.com'  where member_name = 'Adarsh';
update public.trip_members set email = 'neeraj@example.com'  where member_name = 'Neeraj';
update public.trip_members set email = 'prince@example.com'  where member_name = 'Prince';

-- confirm all five are set
select member_name, email from public.trip_members order by created_at;
```

**Managing them later**

```sql
-- pause one person without deleting them
update public.trip_members set email_notifications_enabled = false where member_name = 'Prince';

-- change an address
update public.trip_members set email = 'new.address@example.com' where member_name = 'Rohit';

-- add a sixth person later
insert into public.trip_members (trip_id, member_name, email)
values ('00000000-0000-4000-8000-000000000001', 'Guest', 'guest@example.com');
```

Recipients with a `NULL`/empty email or `email_notifications_enabled = false`
are skipped automatically — the other members still get their mail.

---

## Step 3 — Create your Resend account

You don't have one yet, so do this before deploying:

1. Go to **https://resend.com** → **Sign Up** (free tier = 3,000 emails/month,
   100/day — far more than a trip needs)
2. Verify your email address
3. Dashboard → **Domains** → **Add Domain**
   - Add the DNS records Resend gives you (MX, TXT, SPF, DKIM) at your domain
     registrar. This usually takes a few minutes to an hour to verify.
   - *No domain?* You can still send during testing using Resend's built-in
     `onboarding@resend.dev` sender — but **only to your own verified account
     email**. For all five members you need a verified domain.
4. Dashboard → **API Keys** → **Create API Key** → copy it
   (starts with `re_`)

---

## Step 4 — Set the secrets

Secrets are stored in Supabase, never in code and never in the frontend.

**Option A — Supabase CLI** (install: `npm i -g supabase`, then `supabase login`)

```bash
supabase link --project-ref xeyuedlmjijaemmjdojf

supabase secrets set \
  RESEND_API_KEY=re_your_key_here \
  RESEND_FROM="TripKhata <notifications@yourdomain.com>"
```

**Option B — Dashboard**

Dashboard → **Project Settings** → **Edge Functions** → **Secrets** → add
`RESEND_API_KEY` (and optionally `RESEND_FROM`).

| Secret | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | **Yes** | Your `re_...` key. Without it, deliveries are recorded as `failed` and retried — nothing crashes. |
| `RESEND_FROM` | No | Defaults to `TripKhata <onboarding@resend.dev>`. Set this once your domain is verified. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically —
never set them yourself.

> **Never** prefix a secret with `VITE_`. Anything `VITE_`-prefixed is bundled
> into the browser build and becomes public.

---

## Step 5 — Deploy the Edge Function

**Option A — Supabase CLI**

```bash
supabase functions deploy notify-new-expense --project-ref xeyuedlmjijaemmjdojf
```

**Option B — Dashboard**

Dashboard → **Edge Functions** → **New function** → name it
`notify-new-expense` → paste the contents of
`supabase/functions/notify-new-expense/index.ts` → **Deploy**.

Leave JWT verification **ON** (the default). The function does not depend on
user JWTs — it authenticates with the internal secret from Step 1.

---

## Step 6 — Test it for real

### 6a. Confirm the pipeline is wired

After applying the SQL and deploying the function, add an expense in the app,
then check the queue:

```sql
select status, attempts, last_error, created_at
from public.notification_outbox order by created_at desc limit 5;
```

| `status` | Meaning |
|---|---|
| `pending` | Waiting for a dispatch attempt |
| `queued` | Handed to the Edge Function |
| `sent` | ✅ all recipients delivered |
| `partial` | ⚠️ some delivered, some failed — will retry |
| `failed` | ❌ nothing delivered — check `last_error` |

Then inspect per-recipient results:

```sql
select recipient_email, delivery_status, provider_message_id, error_message, sent_at
from public.notification_log
order by created_at desc limit 20;
```

### 6b. Force a sweep (if nothing arrived)

The trigger dispatches immediately via `pg_net`. If `pg_net` was unavailable or
the function wasn't deployed yet when the expense was added, run:

```sql
select public.dispatch_pending_notifications();
```

(If Step 1 scheduled `pg_cron`, this also runs automatically every minute.)

### 6c. Inspect the exact email that was built

```sql
select payload from public.notification_outbox order by created_at desc limit 1;
```

### 6d. Test without spamming everyone

Temporarily narrow the recipient list, send one expense, restore:

```sql
-- keep only Pratham
update public.trip_members set email_notifications_enabled = (member_name = 'Pratham');

-- ... add an expense, check the email ...

-- restore all five
update public.trip_members set email_notifications_enabled = true;
```

### 6e. Verify duplicate protection

Add one expense, then re-run the sweeper several times:

```sql
select public.dispatch_pending_notifications();
select public.dispatch_pending_notifications();
```

`notification_log` must still show **exactly one row per recipient per
expense** — the `unique (expense_id, recipient_email)` constraint guarantees it.

### 6f. Verify a failed recipient doesn't block the rest

```sql
-- deliberately invalid address for one member
update public.trip_members set email = 'not-an-email' where member_name = 'Prince';
```

(The `CHECK` constraint rejects that, so instead simulate it by deploying
without `RESEND_API_KEY` — every recipient records `failed` with
`RESEND_API_KEY secret is not set`, and the loop still completes for all five.)

---

## Step 7 — Point the report link at your hosted app

Emails link to `<report_base_url>/?report=1`, which opens the full trip report
automatically (this deep-link is already built into the app).

Until you host the app, it defaults to `http://localhost:5173` — fine for your
own testing, useless for the other four members.

```sql
update public.notification_config set report_base_url = 'https://your-app.vercel.app';
```

No function redeploy needed — the value is read from the database per send.

---

## What each member receives

**Subject:** `New Transaction Added – Manali TripKhata`

| Included | Source |
|---|---|
| Transaction title | `expenses.title` |
| Expense amount | `expenses.amount` (formatted ₹, green) |
| Category | `expenses.category` |
| Description | `expenses.description` |
| Paid by member | `members.name` via `paid_by_member_id` |
| Added by member | `members.name` via `entered_by_member_id` |
| Payment method | `expenses.payment_method` |
| Transaction date & time | `expenses.expense_date` (IST) |
| Updated total trip expenditure | live `SUM(amount)` for the trip |
| Report link | `notification_config.report_base_url` + `/?report=1` |

The **added by** member is included as a recipient too — recipients come from
`trip_members`, not from the person who recorded the expense.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `notification_outbox` stays `pending` | Run `select public.dispatch_pending_notifications();` — check `last_error` |
| `pg_net could not be enabled` notice in Step 1 | Extension unavailable; the sweeper still works. Run it manually or via pg_cron. |
| `last_error: pg_net is not enabled` | `create extension if not exists pg_net;` in SQL Editor |
| `notification_log` empty | No recipients — confirm Step 2 (`email` not null, `enabled = true`) |
| `delivery_status = failed`, `error_message: RESEND_API_KEY...` | Do Step 4 |
| `error_message: The email address is not valid` | Resend rejected the sender/recipient — do Step 3 & set `RESEND_FROM` |
| Emails sent but link opens nothing | Step 7 — set `report_base_url` to your hosted app |
| Retries stopped | `attempts` hit 10. Reset with `select public.retry_notification('<outbox-id>');` |

**Useful queries**

```sql
-- everything, newest first
select o.status, o.attempts, o.last_error, o.created_at,
       e.title, e.amount
from public.notification_outbox o
join public.expenses e on e.id = o.expense_id
order by o.created_at desc limit 20;

-- failures only
select * from public.notification_log where delivery_status = 'failed';

-- re-drive everything that isn't done
select public.dispatch_pending_notifications(100);

-- see what the internal secret is (never needed by the frontend)
select notify_secret, edge_function_url, report_base_url from public.notification_config;
```

---

## Security properties

- **No emails in the frontend** — `trip_members` has RLS enabled with *no*
  policies for `anon`/`authenticated`, so the browser cannot read addresses and
  they never enter the JS bundle.
- **No API keys in code** — `RESEND_API_KEY` is an Edge Function secret.
- **No hardcoded addresses** — recipients are queried per-trip at send time.
- **Not callable by the public** — `notify_http_post` (arbitrary POST) is
  revoked from `anon`; the Edge Function checks an internal secret stored only
  in the database.
- **No duplicates** — `unique (expense_id, recipient_email)` plus
  `FOR UPDATE SKIP LOCKED` claiming.
- **Existing functionality untouched** — migration 0002 only *adds* tables and
  one `AFTER INSERT` trigger. Your RLS, audit trail, ownership rules, realtime
  sync and exports are unchanged.

---

## Automated checks

```bash
npm run test:notify       # 21 checks — parses SQL with the real Postgres parser
npm run typecheck:edge    # strict TypeScript on the Edge Function
npm run test:rules        # existing 15 ledger-rule checks (unchanged)
npm run build             # app build
```

`test:notify` parses both migrations with `libpg-query` (the actual PostgreSQL
parser), so a syntax error is caught locally instead of in the SQL Editor.
