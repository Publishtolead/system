-- ============================================================================
-- Publish to Lead — Migration v6 (Phase 5.0)
-- ============================================================================
-- Adds:
--   1. is_manager flag on people (read-only access to all books + dashboard)
--   2. Drive link support on book_assets (asset_kind: 'file' | 'link')
-- ============================================================================

-- 1. Add is_manager column
alter table people
  add column if not exists is_manager boolean default false;

create index if not exists idx_people_is_manager on people(is_manager) where is_manager = true;

-- 2. Drive link support on book_assets
alter table book_assets
  add column if not exists asset_kind text default 'file' check (asset_kind in ('file', 'link'));

alter table book_assets
  add column if not exists external_url text;

-- Make storage_path nullable (it's required only when asset_kind = 'file')
alter table book_assets
  alter column storage_path drop not null;

-- Verification
select 'people.is_manager' as item, count(*) > 0 as ok
from information_schema.columns
where table_name = 'people' and column_name = 'is_manager'
union all
select 'book_assets.asset_kind', count(*) > 0
from information_schema.columns
where table_name = 'book_assets' and column_name = 'asset_kind'
union all
select 'book_assets.external_url', count(*) > 0
from information_schema.columns
where table_name = 'book_assets' and column_name = 'external_url';
