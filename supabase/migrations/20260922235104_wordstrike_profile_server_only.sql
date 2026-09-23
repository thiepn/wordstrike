-- Account data is written only through the authenticated Edge Function. Keep RLS
-- policies as defense in depth, but do not expose direct browser table access.
revoke all on public.wordstrike_player_profiles from public, anon, authenticated;
