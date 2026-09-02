# Arcade Rush AR4 — Core Runtime

AR4 implements the six normal Arcade Rush waves as an isolated runtime controller. It remains disconnected from `main.js`, the production mode registry, persistence, leaderboards and Supabase.

## Runtime ownership

The controller owns current wave, Core Integrity, active targets, spawn progression, word resolution, combo, earned score, input counters, non-paused elapsed time, wave transitions, pause/resume state and cleanup.

The runtime does **not** own DOM access, browser timers, global application state or storage. Those capabilities are supplied through the AR1 ports.

## Six-wave lifecycle

`WAVE_1 → TRANSITION → … → WAVE_6 → BOSS_INTRO`

Normal wave completion is based on **resolution**, not merely spawning. A transition begins only after every target in that wave is either completed or breached and no active target remains.

Transitions last 2,500 ms in the AR4 draft implementation. The value remains balanceable before the AR10 rules freeze.

## Core Integrity

A core breach:

1. resolves the target as missed;
2. records its remaining untyped characters as missed characters;
3. resets combo to zero;
4. subtracts exactly one Integrity;
5. triggers the damage renderer port;
6. fails the run immediately at zero Integrity.

There is no Daily Strike-style collision immunity. Every unresolved threat that reaches the Core is meaningful.

## Perfect waves

A wave is perfect only when both are true:

- zero core breaches in that wave;
- zero incorrect keystrokes in that wave.

Perfect-wave and wave-clear points use the AR3 scoring functions rather than duplicating arithmetic inside the runtime.

## Boss boundary

AR4 intentionally stops after Wave 6 with:

- `phase = BOSS_INTRO`
- `runState = awaiting-boss`
- no scheduled animation frame
- session retained in a transitioning state

`onWavesComplete` is exact-once. AR5 will attach the final boss without rebuilding or prematurely completing the session.

## Failure results

Core destruction creates a canonical AR3 failed `SessionResult` and hands it to the session port. Because AR10 has not frozen leaderboard rules, these results remain `rulesVersion: 0` and `recordEligible: false`.

## Pause, restart and cleanup

Pause cancels the active frame. Resume resets the timestamp baseline so paused wall time cannot enter `elapsedMs`. Restart requires the caller to provide a generated plan; this keeps the AR0 rule that normal retries receive a new seed under higher-level orchestration rather than silently reusing one.

Cleanup clears rendered words, resets targeting and cancels the frame. The AR4 stress test repeats this lifecycle across 100 deterministic plans and verifies no RAF handles remain.
