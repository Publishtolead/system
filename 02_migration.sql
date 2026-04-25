-- ============================================================================
-- Publish to Lead — Migration v2 (for Phase 2)
-- Run this ONCE in Supabase SQL Editor after the v1 schema is in place
-- ============================================================================
-- Purpose:
--   Remove pre-seeded placeholder team members so they can self-register
--   with their own name + chosen roles. Ahmed (already linked) is kept.
-- ============================================================================

delete from people
where auth_user_id is null
  and name in ('مصطفى', 'حازم', 'عادل');

-- Verification: should show only people who have signed up
select id, name, email, auth_user_id is not null as is_linked, is_admin
from people
order by name;
