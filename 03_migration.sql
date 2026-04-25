-- ============================================================================
-- Publish to Lead — Migration v3 (for Phase 3)
-- Run this ONCE in Supabase SQL Editor
-- ============================================================================
-- Purpose:
--   Add default_duration_days to book_steps so we can snapshot the duration
--   at book creation time (and recalculate expected completion accurately even
--   if the workflow template changes later).
-- ============================================================================

alter table book_steps
  add column if not exists default_duration_days integer default 5;

-- Performance: index for lookups by workflow_step_id
create index if not exists idx_book_steps_workflow on book_steps(workflow_step_id);

-- Verification
select column_name, data_type
from information_schema.columns
where table_name = 'book_steps'
order by ordinal_position;
