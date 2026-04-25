-- ============================================================================
-- Publish to Lead — Migration v4 (Phase 3.5)
-- Run this ONCE in Supabase SQL Editor
-- ============================================================================
-- Adds:
--   1. owner_id to books (the person responsible for the whole book project)
--   2. book_assets table for uploaded files (manuscripts, covers, images, etc.)
--   3. book_tasks table for ad-hoc/custom tasks per book (outside the workflow)
-- ============================================================================

-- 1. Book owner
alter table books
  add column if not exists owner_id uuid references people(id) on delete set null;

create index if not exists idx_books_owner on books(owner_id);

-- 2. Book assets (uploaded files)
create table if not exists book_assets (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references books(id) on delete cascade,
  book_step_id uuid references book_steps(id) on delete set null,
  name text not null,
  description text,
  storage_path text not null,
  file_size bigint,
  mime_type text,
  asset_type text default 'other',       -- 'manuscript' | 'cover' | 'image' | 'tool' | 'other'
  uploaded_by uuid references people(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_book_assets_book on book_assets(book_id);
create index if not exists idx_book_assets_step on book_assets(book_step_id);

-- 3. Book tasks (ad-hoc tasks added per book, outside the workflow)
create table if not exists book_tasks (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references books(id) on delete cascade,
  title text not null,
  description text,
  status text default 'pending',         -- 'pending' | 'in_progress' | 'done'
  priority text default 'medium',        -- 'low' | 'medium' | 'high' | 'urgent'
  assignee_id uuid references people(id) on delete set null,
  due_date date,
  completed_at timestamptz,
  created_by uuid references people(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_book_tasks_book on book_tasks(book_id);
create index if not exists idx_book_tasks_assignee on book_tasks(assignee_id);
create index if not exists idx_book_tasks_status on book_tasks(status);

-- RLS
alter table book_assets enable row level security;
drop policy if exists "auth_all_book_assets" on book_assets;
create policy "auth_all_book_assets" on book_assets
  for all to authenticated using (true) with check (true);

alter table book_tasks enable row level security;
drop policy if exists "auth_all_book_tasks" on book_tasks;
create policy "auth_all_book_tasks" on book_tasks
  for all to authenticated using (true) with check (true);

-- Verification
select 'books.owner_id' as item, count(*) > 0 as exists
from information_schema.columns
where table_name = 'books' and column_name = 'owner_id'
union all
select 'book_assets table', count(*) > 0
from information_schema.tables where table_name = 'book_assets'
union all
select 'book_tasks table', count(*) > 0
from information_schema.tables where table_name = 'book_tasks';
