# Arcade Rush v1 Contract Freeze (AR0)

**Status:** Frozen product/data contract  
**Contract version:** 1  
**Gameplay rules version:** intentionally unfrozen until AR10  
**Replacement target:** Daily Strike  

This document is the authoritative AR0 contract for the Daily Strike → Arcade Rush replacement. It freezes the identity, lifecycle, data semantics, eligibility policy, architecture boundaries, and v1 scope that all later Arcade Rush phases must preserve. It does **not** freeze difficulty numbers or score values; AR10 owns the gameplay/leaderboard rules freeze after balancing.

Daily Strike remains the production fourth mode until AR14. AR0 must not rename or disable Daily Strike, change production navigation, alter local saves, or modify the leaderboard backend.

## 1. Product identity

Arcade Rush is WORDSTRIKE's finite short-form score-attack mode.

- Mode ID: `arcade-rush`
- Display name: `Arcade Rush`
- Ready route: `arcade-rush-ready`
- Position after cutover: fourth main mode, replacing Daily Strike
- Target successful-run duration: 4–6 minutes
- Structure: 6 normal waves + 1 final boss
- Starting Core Integrity: 5
- Primary motivation: beat personal bests
- Global leaderboard: optional secondary competition
- Practice Lab: separate destination and not part of Arcade Rush

The final main-mode identities after AR14 are intended to be:

1. Campaign — progression
2. Typing Test — measurement
3. Endless — survival/endurance
4. Arcade Rush — finite score attack

## 2. Non-negotiable v1 behavior

Arcade Rush must work as a complete experience for a single player with no active community and no network connection.

It has:

- no calendar dependency;
- no UTC challenge identity;
- no daily seed;
- no daily streak;
- no daily attempt limit;
- no wait-until-tomorrow loop;
- unlimited normal retries;
- a new run seed on every normal retry;
- deterministic run generation from a supplied seed;
- meaningful local personal records even when leaderboards are unavailable.

A developer/test path may intentionally reproduce a supplied seed. Normal retries must not reuse the previous seed merely so a player can memorize the exact word sequence.

## 3. Canonical lifecycle

Successful progression is:

```text
READY
→ WAVE_1
→ WAVE_TRANSITION
→ WAVE_2
→ WAVE_TRANSITION
→ WAVE_3
→ WAVE_TRANSITION
→ WAVE_4
→ WAVE_TRANSITION
→ WAVE_5
→ WAVE_TRANSITION
→ WAVE_6
→ BOSS_INTRO
→ BOSS
→ COMPLETE
```

`FAILED` is a terminal state reachable from any active normal wave or from the boss encounter when Core Integrity reaches zero.

Wave transitions are non-interactive gameplay transitions. They are not menu screens and must not create independent sessions.

The six normal waves have stable identities even though their numeric tuning remains for later phases:

1. **Ignition** — warm-up/easy vocabulary
2. **Acceleration** — spawn pressure
3. **Crossfire** — simultaneous-target pressure and trajectory decisions
4. **Heavy Words** — longer vocabulary with comparatively lower density
5. **Overdrive** — mixed high pressure
6. **Critical** — peak normal-wave pressure

The seventh stage is a distinct boss/finale, not a normal `WAVE_7`.

## 4. Health and failure contract

- A standard run starts with exactly 5 Core Integrity.
- A damaging Core hit reduces Integrity according to the runtime rules frozen later.
- Reaching zero Integrity terminates the run as `FAILED`.
- The canonical v1 failure reason is `core-destroyed`.
- Failed runs still produce a normal local SessionResult with score, accuracy, WPM, combo, progress, and duration metrics.
- Failed runs are never globally ranked in Arcade Rush v1.

## 5. SessionResult contract

Arcade Rush must use the shared `buildSessionResult()` infrastructure rather than inventing an unrelated result object.

The mode must meaningfully populate these shared fields:

- `sessionId`
- `modeId`
- `variantId`
- `sessionSource`
- `startedAt`
- `endedAt`
- `durationMs`
- `activeDurationMs`
- `seed`
- `developerMode`
- `success`
- `failureReason`
- `score`
- `accuracy`
- `wpm`
- `characters`
- `words`
- `combo`
- `modeData`

`modeId` must be `arcade-rush`.

### Required `modeData`

Arcade Rush `modeData` must contain:

- `contractVersion` — AR0 contract version; v1 is `1`
- `rulesVersion` — numeric gameplay/leaderboard rules version once AR10 freezes it
- `recordEligible` — whether the run used the standard non-developer configuration
- `wavesCompleted` — integer normal waves fully cleared, 0–6
- `finalWave` — last normal wave reached, 1–6 once gameplay begins
- `bossDefeated` — whether the final boss was defeated
- `bossTimeRemainingMs` — non-negative remaining boss time when applicable
- `integrityRemaining` — integer 0–5
- `perfectWaves` — number of perfect normal waves, 0–6
- `wordPoints`
- `waveClearBonus`
- `perfectWaveBonus`
- `bossBonus`
- `integrityBonus`
- `accuracyBonus`
- `timeBonus`

The exact score component **values** are not frozen in AR0. Their existence and meaning are frozen so client storage, results UI, tests, and server validation can converge on one contract.

## 6. Scoring ownership

The canonical final score is the sum of independently recomputable integer components:

```text
score =
  wordPoints
+ waveClearBonus
+ perfectWaveBonus
+ bossBonus
+ integrityBonus
+ accuracyBonus
+ timeBonus
```

Scoring functions must eventually live in the Arcade Rush subsystem and remain pure. The animation loop may accumulate facts but must not become the only authority capable of reproducing the final score.

AR3 defines formulas and golden fixtures. AR10 may tune numeric constants before freezing `rulesVersion = 1`.

## 7. Completion and global ranking eligibility

A run is globally rankable only when all of the following are true:

- `success === true`;
- final boss defeated;
- standard configuration / `recordEligible === true`;
- developer mode is false;
- future server validation accepts the result.

Failed runs may set local personal milestones but cannot enter the global Arcade Rush leaderboard.

When the Arcade Rush leaderboard is introduced, its ranking contract is:

1. score descending;
2. accuracy descending;
3. active gameplay duration ascending;
4. submission/end timestamp ascending.

The leaderboard is all-time for its rules version and is **not** partitioned by date.

## 8. Personal-record contract

Arcade Rush must remain valuable without a populated leaderboard. The local/profile model must ultimately support at least:

- highest score;
- best completed-run score;
- fastest successful completion;
- highest combo;
- best accuracy;
- best WPM;
- most perfect waves;
- runs started;
- runs completed;
- bosses defeated.

No Daily Strike score, streak, or per-date record is converted into an Arcade Rush record during migration.

## 9. Architecture boundaries

Later implementation phases should converge on an isolated subsystem under `js/arcadeRush/`.

Planned ownership:

```text
js/arcadeRush/
  arcadeRushContract.js   # frozen AR0 semantics
  arcadeRushConfig.js     # gameplay constants/profiles
  arcadeRushGenerator.js  # deterministic run planning
  arcadeRushScoring.js    # pure scoring
  arcadeRushRuntime.js    # run state machine / gameplay runtime
  arcadeRushResult.js     # result assembly/normalization
  arcadeRushBoss.js       # finale mechanics
  arcadeRushUi.js         # Rush-specific presentation helpers if needed
```

Pure config/generation/scoring/result helpers must not depend on `main.js`, DOM globals, Supabase, or mutable app-state singletons.

`main.js` should eventually orchestrate start/pause/exit/complete only; it must not absorb Arcade Rush scoring, generation, or wave algorithms.

Shared generic WORDSTRIKE systems may be reused for input, trajectories, rendering, target separation, sessions, metrics, mobile input, and accessibility.

## 10. Explicit v1 non-goals

The first Arcade Rush release does not include:

- daily seeds or calendar challenges;
- streaks or attempt limits;
- power-ups;
- shops;
- roguelike upgrades/perks;
- currencies;
- permanent Rush skill trees;
- seasons;
- multiple difficulty presets;
- multiple run lengths;
- random rule/gimmick modifiers;
- a new Practice Lab integration;
- gameplay attestation.

Gameplay attestation remains a separate leaderboard-security project. AR12 will validate result consistency but must not claim that a browser-generated result proves genuine gameplay occurred.

## 11. Versioning policy

### Contract version

Increment `ARCADE_RUSH_CONTRACT_VERSION` when a later release makes an incompatible change to lifecycle or result-field semantics.

### Rules version

Do not assign the numeric Arcade Rush leaderboard rules version during AR0. AR10 freezes balanced difficulty/scoring as rules version 1. After that point, any leaderboard-affecting scoring or difficulty change requires an intentional rules-version decision.

This distinction prevents an early architecture decision from prematurely freezing unfinished game balance.

## 12. AR0 change boundary

AR0 adds only the contract, documentation, and contract tests.

It must not yet:

- add Arcade Rush to `modes.js`;
- add Arcade Rush screens;
- add an Arcade Rush app-state domain;
- create gameplay runtime behavior;
- change local storage schema;
- add a leaderboard board;
- modify Supabase validation;
- remove or hide Daily Strike;
- delete Daily code or records.

Those changes belong to later numbered phases.

## 13. AR0 acceptance gate

AR0 passes when:

- the mode identity is unambiguous;
- the six-wave + boss lifecycle is frozen;
- starting Integrity is frozen at 5;
- retry and deterministic-seed semantics are frozen;
- SessionResult and `modeData` field meanings are frozen;
- global completion eligibility is frozen;
- v1 non-goals are explicit;
- contract version and rules version are clearly separated;
- machine-checkable contract tests pass;
- existing Daily Strike production behavior is unchanged.
