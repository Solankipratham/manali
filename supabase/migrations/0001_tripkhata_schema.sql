-- =========================================================================
--  TripKhata — Manali Trip shared expense ledger
--  Migration 0001: tables, seed, RLS, audit history, realtime, storage
--
--  HOW TO APPLY
--    1. Supabase Dashboard → your project → SQL Editor
--    2. New query → paste this whole file → Run
--    3. (Optional) verify with the SELECTs at the bottom
--  Or with the CLI:  supabase db push   (file lives in supabase/migrations/)
--
--  Design notes
--    • paid_by_member_id   = who actually paid the money
--    • entered_by_member_id = who recorded the entry (NEVER assumed equal)
--    • Members are plain profiles (Rohit, Pratham, Adarsh, Neeraj, Prince)
--      and are not linked to auth accounts, so RLS below is "shared trip"
--      style. A commented auth-based alternative is at the end.
-- =========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- trips ---
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_date  date,
  end_date    date,
  currency    text not null default 'INR',
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------- members ---
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (trip_id, name)
);

-- ------------------------------------------------------------- expenses ---
create table if not exists public.expenses (
  id                     uuid primary key default gen_random_uuid(),
  trip_id                uuid not null references public.trips (id) on delete cascade,
  title                  text not null check (char_length(title) between 1 and 200),
  amount                 numeric(12, 2) not null check (amount > 0),
  category               text not null,
  description            text,
  paid_by_member_id      uuid not null references public.members (id),
  entered_by_member_id   uuid not null references public.members (id),
  payment_method         text not null
                         check (payment_method in ('Cash', 'UPI', 'Bank Transfer', 'Card', 'Other')),
  expense_date           timestamptz not null default now(),
  receipt_url            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists expenses_trip_date_idx
  on public.expenses (trip_id, expense_date desc);
create index if not exists expenses_paid_by_idx
  on public.expenses (paid_by_member_id);
create index if not exists expenses_entered_by_idx
  on public.expenses (entered_by_member_id);
create index if not exists expenses_category_idx
  on public.expenses (trip_id, category);

-- ---------------------------------------------------------- audit trail ---
-- Append-only history of every create / edit / delete.
create table if not exists public.expense_audit (
  id                     uuid primary key default gen_random_uuid(),
  expense_id             uuid not null,
  trip_id                uuid not null references public.trips (id) on delete cascade,
  action                 text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_by_member_id   uuid references public.members (id),
  old_values             jsonb,
  new_values             jsonb,
  changed_at             timestamptz not null default now()
);

create index if not exists expense_audit_expense_idx
  on public.expense_audit (expense_id, changed_at desc);
create index if not exists expense_audit_trip_idx
  on public.expense_audit (trip_id, changed_at desc);

-- ------------------------------------------------------------- triggers ---
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- Prevent history from being rewritten after the fact.
create or replace function public.block_audit_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'expense_audit is append-only';
end;
$$;

drop trigger if exists expense_audit_immutable on public.expense_audit;
create trigger expense_audit_immutable
  before update on public.expense_audit
  for each row execute function public.block_audit_update();

-- ------------------------------------------------------------ seed data ---
-- One shared trip + the five members (fixed UUIDs used by the app too).
insert into public.trips (id, name, currency)
values ('00000000-0000-4000-8000-000000000001', 'Manali Trip', 'INR')
on conflict (id) do nothing;

insert into public.members (id, trip_id, name)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', 'Rohit'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-000000000001', 'Pratham'),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-4000-8000-000000000001', 'Adarsh'),
  ('44444444-4444-4444-8444-444444444444', '00000000-0000-4000-8000-000000000001', 'Neeraj'),
  ('55555555-5555-4555-8555-555555555555', '00000000-0000-4000-8000-000000000001', 'Prince')
on conflict (trip_id, name) do nothing;

-- --------------------------------------------------- ownership functions --
-- Edits and deletes MUST come from the member who entered the expense.
-- These run with SECURITY DEFINER so RLS cannot be bypassed by a direct
-- UPDATE/DELETE (which the policies below simply do not allow).

create or replace function public.update_expense(
  p_expense_id uuid,
  p_member_id  uuid,
  p_patch      jsonb
) returns setof public.expenses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.expenses;
  v_new public.expenses;
begin
  select * into v_old from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'Expense not found';
  end if;

  if v_old.entered_by_member_id is distinct from p_member_id then
    raise exception 'Only %, who entered this expense, can edit it',
      coalesce((select name from public.members where id = v_old.entered_by_member_id), 'the owner');
  end if;

  update public.expenses
     set title                = coalesce(p_patch ->> 'title', title),
         amount               = coalesce((p_patch ->> 'amount')::numeric, amount),
         category             = coalesce(p_patch ->> 'category', category),
         description          = case when p_patch ? 'description'
                                      then nullif(p_patch ->> 'description', '')
                                      else description end,
         paid_by_member_id    = coalesce((p_patch ->> 'paid_by_member_id')::uuid, paid_by_member_id),
         payment_method       = coalesce(p_patch ->> 'payment_method', payment_method),
         expense_date         = coalesce((p_patch ->> 'expense_date')::timestamptz, expense_date),
         receipt_url          = case when p_patch ? 'receipt_url'
                                      then p_patch ->> 'receipt_url'
                                      else receipt_url end
   where id = p_expense_id
   returning * into v_new;

  insert into public.expense_audit
    (expense_id, trip_id, action, changed_by_member_id, old_values, new_values)
  values
    (p_expense_id, v_new.trip_id, 'UPDATE', p_member_id, to_jsonb(v_old), to_jsonb(v_new));

  return next v_new;
end;
$$;

create or replace function public.delete_expense(
  p_expense_id uuid,
  p_member_id  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.expenses;
begin
  select * into v_old from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'Expense not found';
  end if;

  if v_old.entered_by_member_id is distinct from p_member_id then
    raise exception 'Only %, who entered this expense, can delete it',
      coalesce((select name from public.members where id = v_old.entered_by_member_id), 'the owner');
  end if;

  insert into public.expense_audit
    (expense_id, trip_id, action, changed_by_member_id, old_values, new_values)
  values
    (v_old.id, v_old.trip_id, 'DELETE', p_member_id, to_jsonb(v_old), null);

  delete from public.expenses where id = p_expense_id;
  return to_jsonb(v_old);
end;
$$;

revoke all on function public.update_expense(uuid, uuid, jsonb) from public, anon;
revoke all on function public.delete_expense(uuid, uuid) from public, anon;
grant execute on function public.update_expense(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.delete_expense(uuid, uuid) to anon, authenticated;

-- ------------------------------------------------------------------ RLS ---
alter table public.trips        enable row level security;
alter table public.members      enable row level security;
alter table public.expenses     enable row level security;
alter table public.expense_audit enable row level security;

-- Shared-trip ledger: all five members see and add to ONE ledger.
drop policy if exists trips_shared        on public.trips;
drop policy if exists members_shared      on public.members;
drop policy if exists expenses_read       on public.expenses;
drop policy if exists expenses_insert     on public.expenses;
drop policy if exists audit_read          on public.expense_audit;
drop policy if exists audit_insert        on public.expense_audit;

create policy trips_shared
  on public.trips for select
  to anon, authenticated
  using (true);

create policy trips_bootstrap
  on public.trips for insert
  to anon, authenticated
  with check (true);

create policy members_shared
  on public.members for select
  to anon, authenticated
  using (true);

create policy members_bootstrap
  on public.members for insert
  to anon, authenticated
  with check (true);

-- READ every expense of the trip, INSERT new ones.
-- NO update/delete policy on purpose: edits/deletes must go through
-- update_expense()/delete_expense() which enforce "entered_by = you".
create policy expenses_read
  on public.expenses for select
  to anon, authenticated
  using (true);

create policy expenses_insert
  on public.expenses for insert
  to anon, authenticated
  with check (true);

create policy audit_read
  on public.expense_audit for select
  to anon, authenticated
  using (true);

create policy audit_insert
  on public.expense_audit for insert
  to anon, authenticated
  with check (true);
-- No UPDATE/DELETE policy on expense_audit → history is permanent.

-- ------------------------------------------------------------- realtime ---
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expense_audit'
  ) then
    alter publication supabase_realtime add table public.expense_audit;
  end if;
end $$;

-- -------------------------------------------------------------- storage ---
-- Bucket for optional receipt / photo uploads.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

drop policy if exists "receipts read"   on storage.objects;
drop policy if exists "receipts write"  on storage.objects;
drop policy if exists "receipts delete" on storage.objects;

create policy "receipts read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'receipts');

create policy "receipts write"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'receipts');

create policy "receipts delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'receipts');

-- ============================================================ VERIFY ====
-- select * from public.trips;
-- select name from public.members order by created_at;
-- select count(*) from public.expenses;
-- select count(*) from public.expense_audit;

-- ====================================================== OPTIONAL AUTH ====
-- Members are plain names today. If you later enable Supabase Auth and want
-- rows locked to logged-in users, replace the shared policies with:
--
--   create policy expenses_read on public.expenses for select to authenticated
--     using (trip_id in (select trip_id from public.members m
--                        where m.user_id = auth.uid()));
--
-- and add a `user_id uuid references auth.users(id)` column to members.
-- The app code does not require this change.
