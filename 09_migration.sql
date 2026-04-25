-- ============================================================================
-- Publish to Lead — Migration v9 (Phase 7.5 - Workflow dependencies)
-- ============================================================================
-- Replaces the loose `parallel_group` text field with a clean dependency
-- on a specific step: "this step runs in parallel with step X".
--
-- We keep `parallel_group` for backward compatibility (old data still works)
-- but the UI now uses the new field.
-- ============================================================================

-- workflow_steps: add parallel_with_step_id (FK to another workflow_step)
alter table workflow_steps
  add column if not exists parallel_with_step_id uuid
    references workflow_steps(id) on delete set null;

create index if not exists idx_workflow_steps_parallel_with
  on workflow_steps(parallel_with_step_id)
  where parallel_with_step_id is not null;

-- book_steps: same column to track per-book overrides
alter table book_steps
  add column if not exists parallel_with_step_id uuid
    references book_steps(id) on delete set null;

create index if not exists idx_book_steps_parallel_with
  on book_steps(parallel_with_step_id)
  where parallel_with_step_id is not null;

-- Verification
select 'workflow_steps.parallel_with_step_id' as item, count(*) > 0 as ok
from information_schema.columns
where table_name = 'workflow_steps' and column_name = 'parallel_with_step_id'
union all
select 'book_steps.parallel_with_step_id', count(*) > 0
from information_schema.columns
where table_name = 'book_steps' and column_name = 'parallel_with_step_id';
