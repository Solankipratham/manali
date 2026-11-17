-- =========================================================================
--  TripKhata — Migration 0002: five-member email notifications
--
--  WHAT THIS CREATES
--    1. public.trip_members         — the 5 manually-managed email addresses
--    2. public.notification_outbox  — durable queue (one row per expense)
--    3. public.notification_log     — one delivery row per recipient
--    4. public.notification_config  — internal secret + report link config
--    5. AFTER INSERT trigger on expenses → outbox row → pg_net → Edge Fn
--    6. claim / dispatch / retry helpers
--
--  HOW TO APPLY
--    Supabase Dashboard → SQL Editor → New query → paste this file → Run
--
--  SECURITY MODEL
--    • These 4 tables have RLS enabled and NO policies for anon/authenticated,
--      so email addresses are never readable from the browser and never end
--      up in the frontend bundle. The Dashboard (service_role) and the Edge
--      Function (service_role) are the only writers/readers.
--    • The Edge Function authenticates with an internal secret that lives
--      ONLY in this database — it is not an API key and never leaves the DB.
--    • RESEND_API_KEY is set as an Edge Function secret (never in this file).
--
--  IDEMPOTENT: safe to re-run. Existing rows are kept (on conflict do nothing).
-- =========================================================================

create extension if not exists pgcrypto;

-- pg_net is what lets the trigger call the Edge Function *after COMMIT*.
-- If it cannot be enabled the migration still succeeds: rows simply stay in
-- the outbox and are picked up later by dispatch_pending_notifications().
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net could not be enabled (%). Outbox dispatch will rely on the sweeper.', sqlerrm;
end $$;

-- pg_net may be installed in schema `net`, `extensions` or `public`
-- depending on the project, so resolve it once here instead of hardcoding a
-- search path that might not include it.
create or replace function public.notify_http_post(p_url text, p_headers jsonb, p_body jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_proc text;
begin
  select format('%I.%I', n.nspname, p.proname)
    into v_proc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'http_post'
     and n.nspname not in ('pg_catalog', 'information_schema')
     and p.pronargs >= 3
   order by (n.nspname = 'net') desc, (n.nspname = 'extensions') desc, n.nspname
   limit 1;

  if v_proc is null then
    raise exception 'pg_net is not enabled. Run: create extension if not exists pg_net;';
  end if;

  execute format('perform %s($1, $2, $3)', v_proc)
    using p_url, p_headers, p_body;
end;
$$;


-- ========================================================== trip_members ===
-- Manually maintained list of who gets the email for a trip.
-- Email is NULL until you fill it in — recipients with NULL/disabled email
-- are skipped automatically.
create table if not exists public.trip_members (
  id                         uuid primary key default gen_random_uuid(),
  trip_id                    uuid not null references public.trips (id) on delete cascade,
  member_name                text not null check (char_length(member_name) between 1 and 120),
  email                      text check (email is null or email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  -- Optional link to a Supabase Auth user. Not required by the app.
  user_id                    uuid references auth.users (id) on delete set null,
  email_notifications_enabled boolean not null default true,
  created_at                 timestamptz not null default now(),
  unique (trip_id, member_name)
);

create index if not exists trip_members_trip_idx on public.trip_members (trip_id);

-- Seed one row per existing member of every trip that has none yet.
-- Emails stay NULL — you add them yourself (see the UPDATE block at the end).
insert into public.trip_members (trip_id, member_name, email_notifications_enabled)
select m.trip_id, m.name, true
from public.members m
where not exists (
  select 1 from public.trip_members tm
  where tm.trip_id = m.trip_id and tm.member_name = m.name
)
on conflict (trip_id, member_name) do nothing;


-- ======================================================= notification_* ===
-- Durable outbox: exactly ONE row per expense, created by the trigger in the
-- SAME TRANSACTION as the expense. If the expense rolls back, so does this.
create table if not exists public.notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips (id) on delete cascade,
  expense_id      uuid not null references public.expenses (id) on delete cascade,
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'pending'
                  check (status in ('pending', 'queued', 'sent', 'partial', 'failed')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until    timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (expense_id)          -- hard guarantee: one queue item per transaction
);

create index if not exists notification_outbox_due_idx
  on public.notification_outbox (status, next_attempt_at);

create index if not exists notification_outbox_trip_idx
  on public.notification_outbox (trip_id, created_at desc);

-- Per-recipient delivery ledger. The UNIQUE constraint is what actually
-- prevents a member from being emailed twice for the same transaction.
create table if not exists public.notification_log (
  id                 uuid primary key default gen_random_uuid(),
  outbox_id          uuid references public.notification_outbox (id) on delete cascade,
  expense_id         uuid not null references public.expenses (id) on delete cascade,
  trip_id            uuid not null references public.trips (id) on delete cascade,
  recipient_email    text not null,
  delivery_status    text not null default 'queued'
                     check (delivery_status in ('queued', 'sending', 'sent', 'failed')),
  provider_message_id text,
  error_message      text,
  attempts           integer not null default 0,
  sent_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (expense_id, recipient_email)   -- one email per recipient per transaction
);

create index if not exists notification_log_expense_idx
  on public.notification_log (expense_id, created_at desc);
create index if not exists notification_log_status_idx
  on public.notification_log (delivery_status, updated_at desc);

-- Internal configuration. RLS + no policies ⇒ only the service role can read
-- it, so the internal secret and the report URL never reach the browser.
create table if not exists public.notification_config (
  id                boolean primary key default true check (id),
  notify_secret     text not null,
  edge_function_url text not null,
  report_base_url   text not null default 'http://localhost:5173',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One-time seed. The secret is random and stored ONLY here; the trigger reads
-- it to authenticate the Edge Function call, the function reads it to verify.
insert into public.notification_config (id, notify_secret, edge_function_url, report_base_url)
values (
  true,
  encode(gen_random_bytes(32), 'hex'),
  'https://xeyuedlmjijaemmjdojf.supabase.co/functions/v1/notify-new-expense',
  'http://localhost:5173'
)
on conflict (id) do nothing;

-- updated_at maintenance (function created in migration 0001)
drop trigger if exists trip_members_set_updated_at       on public.trip_members;
drop trigger if exists notification_outbox_set_updated_at on public.notification_outbox;
drop trigger if exists notification_log_set_updated_at    on public.notification_log;
drop trigger if exists notification_config_set_updated_at on public.notification_config;

create trigger trip_members_set_updated_at
  before update on public.trip_members
  for each row execute function public.set_updated_at();
create trigger notification_outbox_set_updated_at
  before update on public.notification_outbox
  for each row execute function public.set_updated_at();
create trigger notification_log_set_updated_at
  before update on public.notification_log
  for each row execute function public.set_updated_at();
create trigger notification_config_set_updated_at
  before update on public.notification_config
  for each row execute function public.set_updated_at();


-- ================================================================= RLS ====
alter table public.trip_members        enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_log    enable row level security;
alter table public.notification_config enable row level security;

-- Intentionally NO policies for anon / authenticated. The frontend never
-- touches these tables: emails stay server-side, exactly as required.

revoke all on public.trip_members, public.notification_outbox,
             public.notification_log, public.notification_config
  from anon, authenticated;

grant all on public.trip_members        to service_role;
grant all on public.notification_outbox to service_role;
grant all on public.notification_log    to service_role;
grant all on public.notification_config to service_role;


-- ============================================================ queue fn ====
-- AFTER INSERT trigger. SECURITY DEFINER so it can read notification_config
-- (RLS-blocked for anon) while the ledger insert itself stays a normal anon
-- insert. It only ever ADDS a queue row — it never touches the expense.
create or replace function public.queue_new_expense_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_secret text;
  v_url    text;
  v_id     uuid;
begin
  -- 1) Durable queue row, committed atomically with the expense.
  insert into public.notification_outbox (trip_id, expense_id, payload)
  values (new.trip_id, new.id, jsonb_build_object('source', 'expenses.after_insert'))
  returning id into v_id;

  -- 2) Best-effort async dispatch. pg_net queues the HTTP request and sends
  --    it ONLY if this transaction commits — so the Edge Function never runs
  --    for a rolled-back expense. Any failure below is swallowed: the queue
  --    row survives and the sweeper will pick it up.
  begin
    select notify_secret, edge_function_url
      into v_secret, v_url
      from public.notification_config
     where id = true;

    if v_secret is not null and v_url is not null then
      perform public.notify_http_post(
        p_url := v_url,
        -- lowercase header names: HTTP/2 requires them lowercase
        p_headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-notify-secret', v_secret
        ),
        p_body := jsonb_build_object('outbox_id', v_id)
      );
      update public.notification_outbox
         set status = 'queued', locked_until = now() + interval '5 minutes'
       where id = v_id;
    end if;
  exception when others then
    raise notice 'notify dispatch failed for expense %: %', new.id, sqlerrm;
    update public.notification_outbox
       set last_error = sqlerrm, status = 'pending', next_attempt_at = now()
     where id = v_id;
  end;

  return new;
end;
$$;

drop trigger if exists expenses_notify_new on public.expenses;
create trigger expenses_notify_new
  after insert on public.expenses
  for each row execute function public.queue_new_expense_notification();

grant execute on function public.queue_new_expense_notification() to anon, authenticated, service_role;


-- ============================================================ claim fn ====
-- Atomically hands out queue rows to the Edge Function using
-- FOR UPDATE SKIP LOCKED, so two concurrent invocations can never process
-- (and therefore email) the same expense twice.
create or replace function public.claim_notification_outbox(
  p_outbox_id uuid default null,
  p_limit     integer default 25
) returns setof public.notification_outbox
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_limit   integer := greatest(coalesce(p_limit, 1), 1);
  v_row     public.notification_outbox;
  v_claimed public.notification_outbox;
begin
  for v_row in
    select o.*
      from public.notification_outbox o
     where o.status <> 'sent'
       and o.attempts < 10
       and (
             (p_outbox_id is not null and o.id = p_outbox_id)
          or (p_outbox_id is null and (
                (o.status = 'pending'  and o.next_attempt_at <= now())
             or (o.status = 'queued'   and coalesce(o.locked_until, to_timestamp(0)) < now())
             or (o.status = 'partial'  and o.next_attempt_at <= now())
             or (o.status = 'failed'   and o.next_attempt_at <= now())
             ))
           )
     order by o.created_at
     limit v_limit
       for update skip locked
  loop
    -- `attempts` is bumped by the DISPATCHER (trigger / sweeper), not here,
    -- so each retry is counted exactly once no matter which path took it.
    update public.notification_outbox o
       set status          = 'queued',
           locked_until    = now() + interval '5 minutes',
           last_error      = null,
           updated_at      = now()
     where o.id = v_row.id
     returning o.* into v_claimed;

    return next v_claimed;
  end loop;

  return;
end;
$$;

revoke all on function public.claim_notification_outbox(uuid, integer) from public, anon, authenticated;
grant  execute on function public.claim_notification_outbox(uuid, integer) to service_role;

-- notify_http_post can POST to an arbitrary URL — never let the browser call it.
revoke all on function public.notify_http_post(text, jsonb, jsonb) from public, anon, authenticated;


-- ============================================================ sweeper ======
-- Picks up anything the direct pg_net call missed (function not deployed yet,
-- transient network error, partial failure waiting for its retry window).
-- Run it from the SQL Editor, or schedule it with pg_cron (see README).
create or replace function public.dispatch_pending_notifications(
  p_limit integer default 25
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_secret text;
  v_url    text;
  v_row    record;
  v_count  integer := 0;
begin
  select notify_secret, edge_function_url
    into v_secret, v_url
    from public.notification_config
   where id = true;

  if v_secret is null or v_url is null then
    raise notice 'notification_config is not seeded — nothing to dispatch.';
    return 0;
  end if;

  for v_row in
    select o.id
      from public.notification_outbox o
     where o.status <> 'sent'
       and o.attempts < 10
       and (
             (o.status = 'pending' and o.next_attempt_at <= now())
          or (o.status = 'queued'  and coalesce(o.locked_until, to_timestamp(0)) < now())
          or (o.status = 'partial' and o.next_attempt_at <= now())
          or (o.status = 'failed'  and o.next_attempt_at <= now())
           )
     order by o.created_at
     limit greatest(coalesce(p_limit, 1), 1)
       for update skip locked
  loop
    begin
      perform public.notify_http_post(
        p_url := v_url,
        p_headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-notify-secret', v_secret
        ),
        p_body := jsonb_build_object('outbox_id', v_row.id)
      );

      -- `attempts` counts dispatch tries — bumped here exactly once per
      -- sweeper pass. The Edge Function's claim step does not increment it.
      update public.notification_outbox
         set status       = 'queued',
             attempts     = attempts + 1,
             locked_until = now() + interval '5 minutes',
             updated_at   = now()
       where id = v_row.id;

      v_count := v_count + 1;
    exception when others then
      update public.notification_outbox
         set last_error = sqlerrm, status = 'pending',
             next_attempt_at = now() + interval '5 minutes',
             updated_at = now()
       where id = v_row.id;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.dispatch_pending_notifications(integer) from public, anon, authenticated;
grant  execute on function public.dispatch_pending_notifications(integer) to service_role;


-- ================================================================ retry ====
-- Manual escape hatch for a queue row that exhausted its 10 attempts:
--   select public.retry_notification('<outbox-id>');
-- Failed log rows are kept as history; the next run re-claims only the
-- recipients that are not already 'sent'.
create or replace function public.retry_notification(p_outbox_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.notification_outbox
     set status          = 'pending',
         attempts        = 0,
         next_attempt_at = now(),
         locked_until    = null,
         last_error      = null,
         updated_at      = now()
   where id = p_outbox_id;

  if not found then
    raise exception 'Outbox row % not found', p_outbox_id;
  end if;
end;
$$;

revoke all on function public.retry_notification(uuid) from public, anon, authenticated;
grant  execute on function public.retry_notification(uuid) to service_role;


-- ================================================== optional: pg_cron ======
-- Enables automatic retries every minute. Safe to skip — you can always run
--   select public.dispatch_pending_notifications();
-- by hand instead.
do $outer$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'tripkhata-notify-sweep',
    '* * * * *',
    $cron$ select public.dispatch_pending_notifications(25); $cron$
  );
exception when others then
  raise notice 'pg_cron not scheduled (%). Run dispatch_pending_notifications() manually or via your own scheduler.', sqlerrm;
end $outer$;


-- =============================================== SET YOUR EMAIL ADDRESSES ==
-- Supabase Dashboard → Table Editor → trip_members → edit the email column,
-- or run the block below in SQL Editor:
--
-- update public.trip_members set email = 'rohit@example.com'  where member_name = 'Rohit';
-- update public.trip_members set email = 'pratham@example.com' where member_name = 'Pratham';
-- update public.trip_members set email = 'adarsh@example.com'  where member_name = 'Adarsh';
-- update public.trip_members set email = 'neeraj@example.com'  where member_name = 'Neeraj';
-- update public.trip_members set email = 'prince@example.com'  where member_name = 'Prince';
--
-- Turn one person off without deleting them:
--   update public.trip_members set email_notifications_enabled = false where member_name = 'Prince';
--
-- After the app is hosted somewhere public, point the email button at it:
--   update public.notification_config set report_base_url = 'https://your-app.vercel.app';
--   select public.dispatch_pending_notifications();   -- (no effect on already-sent rows)


-- ============================================================ VERIFY ======
-- select member_name, email, email_notifications_enabled from public.trip_members order by created_at;
-- select id, status, attempts, last_error from public.notification_outbox order by created_at desc limit 10;
-- select recipient_email, delivery_status, provider_message_id, error_message, sent_at
--   from public.notification_log order by created_at desc limit 50;
