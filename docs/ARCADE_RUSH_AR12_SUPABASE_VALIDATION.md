# Arcade Rush AR12 — Supabase Validation

AR12 adds the server-side board, validation, storage and ranking contract for frozen Arcade Rush rules v1. It does not perform the production Daily → Arcade Rush cutover.

## Board

- Board key: `arcade-rush-v1`
- Mode: `arcade_rush`
- Rules version: `1`
- Scope: all-time
- Eligible runs: completed six-wave runs with Core Breaker defeated
- Ranking: score descending, accuracy descending, active duration ascending, submission timestamp ascending
- Calendar/date scope: none

The board is active and RPC-visible so AR13 can exercise it in the existing developer/shadow frontend. The normal production frontend still exposes Daily Strike until AR14.

## Submission validation

`supabase/functions/_shared/scoreSubmission.js` now recognizes `arcade-rush-v1` and requires the exact AR11 normalized payload shape.

The server validates:

- contract version 1 and rules version 1;
- canonical client variant `draft-r1-s1` retained from the AR10 compatibility boundary;
- unsigned 32-bit run seed;
- non-developer, record-eligible session source;
- successful completion, six waves, final stage 7 and boss defeat;
- Core Integrity, boss time, perfect waves and combo ranges;
- a conservative structural minimum successful duration derived from the frozen spawn/transition schedule;
- completed/missed/total word consistency against the 168 normal targets and at most four Core-damaging misses;
- character-counter consistency;
- independently recomputed accuracy;
- independently recomputed WPM, allowing only the tiny tolerance introduced when the client rounds active milliseconds;
- frozen wave-clear, perfect-wave, boss, Integrity, time and accuracy bonuses;
- exact final-score recomputation.

## Word-points limitation

The server can verify that `wordPoints` is an integer inside the feasible frozen-v1 range for the number of normal targets that could have been completed. It cannot independently reconstruct the exact per-target combo history from the AR11 submission payload because that payload intentionally contains summary metrics rather than a trusted gameplay event trace.

Therefore AR12 is **consistency validation, not gameplay attestation**. It rejects malformed and arithmetically inconsistent results but does not claim that a browser-generated payload proves genuine play. Gameplay attestation remains a separate project as frozen in AR0.

## Database migration

`20260902170000_add_arcade_rush_leaderboard_v1.sql`:

1. extends the board-registry mode check with `arcade_rush`;
2. upserts the `arcade-rush-v1` board without changing the five existing boards;
3. adds a partial ranking index for completed, accepted Arcade Rush submissions;
4. extends `submit_leaderboard_result` to the sixth allowlisted board while preserving profile checks, duplicate protection, the 30/hour rate limit and service-role-only execution;
5. extends `get_public_leaderboard` to the sixth board;
6. filters Rush to completed accepted rules-v1 rows;
7. chooses each player's best Rush result using score → accuracy → duration → timestamp;
8. returns the same safe public row shape expected by the AR11 frontend.

No new Rush-specific table columns are required. The existing generic columns hold rank-critical values (`score`, `accuracy`, `duration_ms`, `completed`, `words_completed`, `integrity_remaining`), while the remaining validated facts and score breakdown are stored in the existing `metrics` JSON object.

## Daily compatibility

Daily Strike remains registered, writable and readable with its existing UTC challenge-date semantics. AR12 does not delete Daily rows, functions, migrations or client behavior.

## AR12 gate

AR12 passes only when repository tests certify:

- a real client-built frozen-v1 Arcade Rush payload passes the server validator;
- field, eligibility, metric, word-counter and score mutations fail with stable error codes;
- Rush reads reject challenge dates;
- server-side ranking exactly follows the frozen v1 order and excludes failed/moderated/wrong-version rows;
- the SQL migration contains the sixth-board identity, service-only grants, completed-only filter and rank order;
- all existing Campaign, Typing Test, Endless and Daily leaderboard tests continue to pass.
