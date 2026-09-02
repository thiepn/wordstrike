# Arcade Rush AR3/AR10 — Canonical Scoring & Result Model

AR3 defined the deterministic, independently recomputable scoring model and canonical Arcade Rush `SessionResult`. AR10 has now certified the balance and frozen these scoring semantics as rules v1.

## Version boundary

- Contract version: `1`
- Rules version: `1`
- Generator version: `1`
- Scoring implementation version: `1`
- Status: `FROZEN_V1`

The legacy `ARCADE_RUSH_DRAFT_RULES_VERSION` export is retained only as a compatibility alias for earlier internal modules; after AR10 its value is the frozen `ARCADE_RUSH_RULES_VERSION` (`1`). There is no active rules-v0 leaderboard ruleset.

## Word points

The generator assigns each normal word a point tier from 1–5. Base values are 100, 125, 160, 200 and 250 points.

The runtime calculates a completed word using the **combo after that word is completed**:

| Combo after completion | Multiplier |
| ---: | ---: |
| 1–9 | 1.00x |
| 10–19 | 1.10x |
| 20–39 | 1.25x |
| 40–69 | 1.50x |
| 70–99 | 1.75x |
| 100+ | 2.00x |

All point calculations resolve to integers using canonical basis-point arithmetic.

## Run bonuses

Wave-clear bonuses accumulate only for fully cleared waves: 500, 1,000, 1,500, 2,000, 3,000 and 4,000 points for Waves 1–6 respectively.

Each perfect wave adds 1,500 points. A successful Core Breaker clear adds 8,000 points. A successful run adds 2,000 points per remaining Core Integrity. Boss time adds 100 points per whole second remaining, capped by the 45-second boss duration.

Failed runs keep word, cleared-wave, perfect-wave and accuracy points already earned, but receive no boss, Integrity or boss-time bonus.

## Accuracy bonus

Accuracy applies to the subtotal of every non-accuracy component:

- below 90%: 0%
- 90–94.99%: 5%
- 95–97.99%: 10%
- 98–99.99%: 20%
- exactly 100%: 30%

The accuracy component is then added to produce the final integer score.

## Canonical result semantics

Arcade Rush results use the shared `buildSessionResult()` infrastructure. `modeData` stores every score component required to recompute the total, along with waves completed, final stage, boss state, boss time, Integrity, perfect-wave count, contract version and rules version.

`finalWave` is a stage index: normal failures report the wave entered next (`wavesCompleted + 1`), while any run that clears all six normal waves reports stage `7`, representing the boss/finale.

The canonical gameplay failure remains `core-destroyed`. Failed results require zero remaining Integrity. Successful results require all six normal waves cleared, Core Breaker defeated, and at least one remaining Integrity.

## Rules-v1 record eligibility

A canonical Arcade Rush result has `recordEligible: true` only when:

- `rulesVersion >= 1`;
- `success === true`;
- Core Breaker was defeated;
- developer mode is false.

Failed runs remain useful local history and can update local non-completion personal records, but they cannot rank globally. Developer runs remain ineligible.

## Validation

`validateArcadeRushCanonicalResult()` verifies:

- required shared/result fields;
- contract and frozen rules versions;
- seed validity;
- success/boss/wave/Integrity consistency;
- character and word counter consistency;
- combo ordering;
- exact record eligibility;
- every stored score component;
- final score equality after independent recomputation.

Golden fixtures cover a perfect completion, average completion, one-Integrity completion, Wave 4 failure and Wave 6 failure. AR10 deliberately kept their arithmetic totals unchanged. They remain intended shared client/server scoring evidence for AR12.

## Balance relationship

AR10 changed the normal target budget and spawn cadence, so attainable word/combo totals are naturally different from the AR3 draft environment even though the scoring formula itself did not change. See `ARCADE_RUSH_BALANCE_V1.md` for the frozen 168-target pressure curve and deterministic player-profile certification.

Optional letter-grade thresholds were never part of the canonical result contract and are not frozen in rules v1.
