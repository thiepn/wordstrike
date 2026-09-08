# Player Profile, Statistics, and Global Rankings

WORDSTRIKE exposes `PROFILE & STATS` from the title menu. It is not a gameplay mode and creates no gameplay session. The current tabs are **Overview, Campaign, Typing Test, Endless, Arcade Rush, Recent, and Profile**.

## Local profile

The active profile and mode history are stored in the versioned `wordstrike_mode_data_v2` store. Existing compatible v1 data is migrated forward. The immutable local player ID is generated with browser cryptography and is never derived from the display name.

Display names default to `Player`. Edits trim surrounding whitespace, collapse repeated whitespace, reject control characters, and require 2–20 Unicode code points. Local gameplay, progress, records, and statistics do not require an online account.

## Optional global account

Google authentication through Supabase is optional. Signed-in players can claim a separate public leaderboard username containing 3–20 ASCII letters, numbers, or underscores. Username uniqueness and cooldown rules are enforced by the protected leaderboard profile backend.

Eligible results are submitted through the leaderboard submission service rather than direct browser table writes. If Supabase or the network is unavailable, local gameplay and local records continue to work normally.

## Public leaderboards

The current public boards are:

- Campaign — highest successfully completed level
- Typing Test — English 200, 60 seconds
- Typing Test — English 200, 15 seconds
- Endless — standard rules
- Arcade Rush — completed runs, rules v1, all-time

Rankings are viewable without signing in. A signed-in player with a public username can additionally submit eligible results and see their own rank when supported by the board response. Legacy Daily Strike leaderboard return state is normalized to Arcade Rush for backward compatibility; Daily Strike is not an active board or UI tab.

## Lifetime aggregation

Lifetime statistics track eligible finalized sessions, successes and failures, active playtime, completed and missed words, character totals, total keystrokes, weighted accuracy, duration-weighted WPM, and known first/last session timestamps.

Aggregation occurs once through the authoritative mode-recording path alongside bounded recent-session history. Developer sessions, aborted sessions, ineligible configurations, and duplicate session IDs are excluded according to their mode contracts.

## Mode statistics

- **Campaign:** unlocked/completed levels, grades, bosses, runs, playtime, words, weighted accuracy/WPM.
- **Typing Test:** English 200 records for every current time/word configuration, usage, playtime, characters, words, best WPM and accuracy. Legacy word-set records remain preserved but do not compete with English 200.
- **Endless:** highest stage, score, survival, accuracy/WPM, combo/streak and core-breach statistics.
- **Arcade Rush:** score, completed score, fastest completion, combo, accuracy/WPM, perfect waves, runs, completion rate, bosses defeated, playtime and word activity.
- **Recent:** at most 30 compact finalized-session summaries across the active modes.

Gameplay and statistics stay local unless an eligible result is explicitly/automatically submitted through the authenticated leaderboard path. Public username management does not synchronize the rest of the local profile or save data.
