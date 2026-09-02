# AR8 — Local Storage & Schema v2

AR8 replaces the active mode-data persistence schema with version 2 while preserving the still-public Daily Strike mode through a temporary legacy compatibility store.

## Active v2

Storage key: `wordstrike_mode_data_v2`

The active `modes` object contains Campaign, Typing Test, Endless, Practice, and Arcade Rush. It does not contain Daily Strike.

Preserved during v1 → v2 migration:
- player profile
- lifetime aggregates
- global totals
- Campaign summary and records
- Typing Test summary, usage, word-set records, and activity
- Endless summary and records
- recent non-Daily sessions
- opaque recorded session IDs for duplicate protection

Not migrated into Arcade Rush:
- Daily scores
- Daily streaks
- Daily dates
- Daily attempts
- Daily best-by-day records

Arcade Rush always starts with a clean v2 record set.

## Arcade Rush records

`modes["arcade-rush"].records` stores:
- highestScore
- bestCompletedScore
- fastestCompletion
- highestCombo
- bestAccuracy
- bestWpm
- mostPerfectWaves
- runsStarted
- runsCompleted
- bossesDefeated

Failed non-developer runs are stored locally. Successful-run-only records are `bestCompletedScore`, `fastestCompletion`, and `runsCompleted`. `bossesDefeated` increments only for a defeated boss.

Developer runs never change local records.

`recordEligible` remains a global-leaderboard concept and does not block legitimate local Arcade Rush records.

## Daily compatibility window

Until the AR14 production cutover, Daily Strike remains public. Its old date/streak/attempt state is therefore stored separately under:

`wordstrike_daily_legacy_v1`

This sidecar is not part of active schema v2. Existing v1 Daily data is copied there during migration and is never converted into Arcade Rush records.

Daily terminal sessions may continue updating aggregate lifetime/totals and the compatibility sidecar, but are excluded from v2 mode summaries and v2 recent sessions.

AR15–AR16 can retire this compatibility storage after Daily is removed.

## Migration behavior

`migrateModeDataToV2(value)` is pure and idempotent.

`loadModeData()`:
1. reads a valid v2 payload if present;
2. otherwise attempts `wordstrike_mode_data_v1`;
3. extracts legacy Daily compatibility data when needed;
4. writes the sanitized v2 payload best-effort;
5. falls back to a clean v2 default on malformed/corrupt data.

The old v1 key is left untouched for rollback compatibility.
