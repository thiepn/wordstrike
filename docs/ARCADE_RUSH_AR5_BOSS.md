# Arcade Rush AR5 — Core Breaker Boss

AR5 completes the isolated Arcade Rush run lifecycle by attaching a deterministic final boss to the AR4 six-wave runtime.

## Encounter

- Boss: `CORE BREAKER`
- Boss version: `1`
- Target duration: `45,000 ms`
- HP: `8`
- Attack window: `7,500 ms`
- Starting Core Integrity is whatever remains after Wave 6.
- Boss phrase order is deterministic from the AR2 boss seed.
- Completing a phrase removes one boss HP.
- Missing an attack window damages Core by one and advances to the next phrase.
- Boss attacks reset the runtime combo.
- Boss phrase words extend the runtime combo and session word counters, but do not generate normal word points.
- Backspace remains available; the boss does not introduce a no-backspace modifier.

## Timeout semantics

Arcade Rush has only the contract failure reason `core-destroyed`.

Therefore the 45-second boss timeout is not represented as a second arbitrary failure type. When the total boss timer expires, Core Breaker performs a final strike that removes all remaining Core Integrity. The resulting canonical session still fails as `core-destroyed`.

## Determinism and arbitration

The phrase sequence is a seeded permutation of the fixed Core Breaker phrase pool.

Terminal events are ordered chronologically:

1. If the final required character is accepted while the encounter is still active, the boss becomes `DEFEATED` immediately.
2. Once defeated, later timer updates cannot reverse the victory.
3. If an attack or timeout reaches zero first and destroys Core, the encounter becomes `FAILED` and later input is ignored.

This makes final-key / final-frame races deterministic.

## Runtime integration

AR4's existing `bossPort` seam is now implemented by `createCoreBreakerBossPort()`.

With a boss port supplied:

`WAVE_6 -> BOSS_INTRO -> BOSS -> COMPLETE | FAILED`

Without a boss port, the AR4 `awaiting-boss` handoff remains available for isolated wave tests and alternative future boss implementations.

The runtime merges boss character/word metrics into the same canonical session result and uses AR3 for final scoring. Draft `rulesVersion: 0` remains unchanged; AR10 still owns balance certification and the Rules v1 freeze.

## Exact-once behavior

Boss finalization, session completion, success/failure callbacks, and terminal callbacks are guarded against duplicate invocation. Boss pause/resume uses the same one-RAF runtime scheduler and resets its timestamp baseline after resume.

## Deferred

AR5 does not add:

- DOM boss UI
- production navigation
- persistence
- records/statistics
- leaderboard/backend behavior
- Rules v1 balance freeze
