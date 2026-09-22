-- Private cloud game saves, not public leaderboard submissions.
-- Authentication and existing account/leaderboard tables are intentionally unchanged.
create table if not exists public.wordstrike_player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  data jsonb not null check (
    jsonb_typeof(data) = 'object'
    and data @> '{"schemaVersion":1}'::jsonb
    and data ?& array['campaign','mode','settings']
    and jsonb_typeof(data -> 'campaign') = 'object'
    and jsonb_typeof(data -> 'mode') = 'object'
    and jsonb_typeof(data -> 'settings') = 'object'
    and octet_length(data::text) <= 8388608
  ),
  updated_at timestamptz not null default now()
);
alter table public.wordstrike_player_profiles enable row level security;
revoke all on public.wordstrike_player_profiles from anon;
grant select, insert, update, delete on public.wordstrike_player_profiles to authenticated;
create policy wordstrike_profile_select_own on public.wordstrike_player_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy wordstrike_profile_insert_own on public.wordstrike_player_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy wordstrike_profile_update_own on public.wordstrike_player_profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy wordstrike_profile_delete_own on public.wordstrike_player_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);
comment on table public.wordstrike_player_profiles is 'WordStrike account-scoped CRDT snapshots. Client writes use revision compare-and-swap; no auth tokens or public ranking authority.';
