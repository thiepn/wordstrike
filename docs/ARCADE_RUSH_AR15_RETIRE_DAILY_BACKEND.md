# Arcade Rush AR15 — Retire Daily Backend

AR15 retires Daily Strike from the active Supabase leaderboard contract after the AR14 production cutover to Arcade Rush.

## Active global boards

The server now accepts exactly five boards:

- `campaign-highest-level-v1`
- `typing-60s-english200-v1`
- `typing-15s-english200-v1`
- `endless-v1`
- `arcade-rush-v1`

`daily-strike-v1` is no longer a valid read or submission board. Edge validation returns `INVALID_BOARD` before any retired Daily result logic can be used.

## Database retirement

Migration `20260903083000_retire_daily_strike_backend.sql`:

1. marks the Daily board `is_active = false` and `is_visible = false`;
2. removes Daily from `submit_leaderboard_result`'s board allowlist;
3. removes Daily from `get_public_leaderboard`'s board allowlist;
4. removes Daily challenge-date and Daily ranking branches from the current read RPC;
5. keeps all existing service-role-only grants, moderation filtering, profile requirements, duplicate protection, and 30/hour submission limiting;
6. keeps historical Daily rows and submissions intact.

Historical data is intentionally archived, not deleted or converted into Arcade Rush data.

## Validator archive boundary

The pre-AR15 score validator is retained as `scoreSubmissionLegacyDaily.js` solely as historical/rollback implementation evidence. The active server entry point remains `scoreSubmission.js`, which exposes only the five active board keys and rejects `daily-strike-v1` before delegating active-mode validation.

The deployed `submit-score` Edge Function imports the active entry point, not the archive module.

## Frontend boundary

AR15 does not remove Daily frontend/gameplay code. After AR14:

- Arcade Rush remains the public fourth mode and public fourth leaderboard;
- Daily remains hidden in the app registry during this phase;
- Daily local compatibility data remains untouched;
- AR16 owns final Daily frontend/code deletion.

This separation prevents backend retirement from becoming an uncontrolled application-wide deletion phase.
