# Arcade Rush AR11 — Leaderboard Frontend

AR11 adds the client-side Arcade Rush leaderboard contract on top of the rules-v1 freeze from AR10. It deliberately does **not** expose Arcade Rush as the normal production fourth leaderboard tab yet because AR12 still owns Supabase validation and AR14 owns the public cutover.

## Board identity

- Board key: `arcade-rush-v1`
- Category: `arcade-rush`
- Rules version: `1`
- Calendar scope: none
- Attempt limit: none
- Ranked population: completed, boss-defeated, non-developer rules-v1 runs only

The canonical ranking order is:

1. score descending;
2. accuracy descending;
3. active duration ascending;
4. server submission timestamp ascending.

Failed runs are local-only and never outrank completed runs.

## Shadow frontend

Normal production navigation remains unchanged through AR13:

1. Campaign
2. Typing Test
3. Endless
4. Daily Strike

When the existing developer query is active (`?dev=1`), the fourth leaderboard tab becomes **Arcade Rush**. The existing Daily click action is intentionally reused during the shadow period; `leaderboardService` remaps that request to `arcade-rush-v1` only while the developer shadow flag is active. This avoids changing `main.js` before AR14 and keeps the production Daily path stable.

Arcade Rush requests contain only:

```json
{ "boardKey": "arcade-rush-v1" }
```

No UTC date, challenge date, streak, attempt, or Daily version field is sent.

## Read states and UI

The Rush board reuses the established leaderboard states:

- loading / refreshing;
- ready;
- empty;
- offline;
- error;
- signed-out / username-required account panels;
- top-100 rows and separate viewer rank.

Rush rows display:

- score;
- accuracy;
- completion time.

The board metadata states `RULES V1 // COMPLETED RUNS ONLY // ALL-TIME`.

## Submission payload boundary

AR11 also defines the client payload that AR12 must validate. `buildArcadeRushLeaderboardSubmissionResult()` first requires a valid canonical Arcade Rush SessionResult, then normalizes:

- contract/rules version;
- seed and variant;
- score, WPM, accuracy, active duration;
- six-wave/boss completion state;
- remaining Core Integrity;
- perfect waves and combo;
- word/character counters;
- every independently recomputable score component;
- record eligibility, developer mode and session source.

The shared submission service now recognizes mode `arcade-rush` and board `arcade-rush-v1`, but AR11 does not claim the current production Supabase functions accept it. AR12 must add strict server validation before the board can leave shadow mode.

## OAuth return compatibility

`main.js` does not yet understand `arcade-rush` as a public return category. During the shadow period, return-state validation stores a Rush board return using the existing `daily` enum value. On return, the developer-only board remapping sends that route back to `arcade-rush-v1`. AR14 should remove this temporary compatibility bridge when the public category is cut over.

## Production safety

AR11 does not:

- remove Daily Strike;
- expose Arcade Rush to ordinary users;
- modify Supabase migrations or Edge Functions;
- claim server-side score validation;
- enable normal Arcade Rush automatic submissions;
- change rules v1 balance or scoring.

The Arcade Rush result screen exposes its existing **View Leaderboard** action only in developer/shadow mode. Non-developer behavior remains disabled until the public cutover.
