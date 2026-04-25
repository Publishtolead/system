-- ============================================================================
-- Publish to Lead — Migration v5 (Phase 4.5)
-- ============================================================================
-- Adds: invitations table for inviting new team members via shareable links
-- ============================================================================

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  name text not null,
  email text,                            -- optional, used to auto-link if signup matches
  phone text,
  invited_role_ids uuid[] default '{}',  -- roles to auto-assign on signup
  invited_by uuid references people(id) on delete set null,
  used boolean default false,
  used_by uuid references people(id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz default (now() + interval '30 days'),
  created_at timestamptz default now()
);

create index if not exists idx_invitations_token on invitations(token);
create index if not exists idx_invitations_used on invitations(used);

-- RLS — anonymous users need to read invitations to validate the token
-- (so they can see their pre-filled name/roles before signing up)
alter table invitations enable row level security;

drop policy if exists "anon_read_invitations" on invitations;
create policy "anon_read_invitations" on invitations
  for select to anon, authenticated using (true);

drop policy if exists "auth_write_invitations" on invitations;
create policy "auth_write_invitations" on invitations
  for all to authenticated using (true) with check (true);

-- Verification
select 'invitations table created' as result, count(*) > 0 as ok
from information_schema.tables
where table_name = 'invitations';
