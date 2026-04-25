-- ============================================================================
-- Publish to Lead — Migration v7 (Phase 6.0 - Accounting)
-- ============================================================================
-- Adds:
--   1. payments table (each individual payment received from a client)
--   2. payment_plans table (the agreed installment schedule per book)
--   3. payment_plan_installments table (individual scheduled installments)
-- ============================================================================

-- 1. PAYMENTS — each payment received from an author/client
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references authors(id) on delete restrict,   -- the client (= author)
  book_id uuid references books(id) on delete set null,        -- optional: which book it's for
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'EGP' check (currency in ('EGP', 'USD', 'SAR', 'AED')),
  payment_date date not null default current_date,
  payment_type text default 'installment'
    check (payment_type in ('deposit', 'installment', 'final', 'extra', 'refund', 'other')),
  payment_method text default 'cash'
    check (payment_method in ('cash', 'bank_transfer', 'instapay', 'vodafone_cash', 'paypal', 'wise', 'other')),
  reference text,                              -- transaction ID, check number, etc.
  notes text,
  receipt_url text,                            -- optional: link to receipt scan/image
  recorded_by uuid references people(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_payments_author on payments(author_id);
create index if not exists idx_payments_book on payments(book_id);
create index if not exists idx_payments_date on payments(payment_date desc);
create index if not exists idx_payments_type on payments(payment_type);

-- 2. PAYMENT PLANS — agreed total + installment schedule per book
create table if not exists payment_plans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references books(id) on delete cascade unique,  -- one plan per book
  total_amount numeric(12, 2) not null check (total_amount > 0),
  currency text not null default 'EGP' check (currency in ('EGP', 'USD', 'SAR', 'AED')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_payment_plans_book on payment_plans(book_id);

-- 3. PAYMENT PLAN INSTALLMENTS — the agreed schedule
create table if not exists payment_plan_installments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references payment_plans(id) on delete cascade,
  installment_order integer not null,                  -- 1, 2, 3, ...
  label text not null,                                 -- e.g. "دفعة أولى", "بعد المسودة", "نهائي"
  amount numeric(12, 2) not null check (amount > 0),
  due_date date,                                       -- expected payment date
  is_paid boolean default false,
  paid_payment_id uuid references payments(id) on delete set null,  -- which payment fulfilled this
  created_at timestamptz default now()
);

create index if not exists idx_installments_plan on payment_plan_installments(plan_id);
create index if not exists idx_installments_due on payment_plan_installments(due_date) where is_paid = false;

-- RLS
alter table payments enable row level security;
drop policy if exists "auth_all_payments" on payments;
create policy "auth_all_payments" on payments
  for all to authenticated using (true) with check (true);

alter table payment_plans enable row level security;
drop policy if exists "auth_all_plans" on payment_plans;
create policy "auth_all_plans" on payment_plans
  for all to authenticated using (true) with check (true);

alter table payment_plan_installments enable row level security;
drop policy if exists "auth_all_installments" on payment_plan_installments;
create policy "auth_all_installments" on payment_plan_installments
  for all to authenticated using (true) with check (true);

-- Verification
select 'payments table' as item, count(*) > 0 as ok
from information_schema.tables where table_name = 'payments'
union all
select 'payment_plans table', count(*) > 0
from information_schema.tables where table_name = 'payment_plans'
union all
select 'payment_plan_installments table', count(*) > 0
from information_schema.tables where table_name = 'payment_plan_installments';
