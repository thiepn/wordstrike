# Arcade Rush AR3 — Canonical Scoring & Result Model

AR3 defines a deterministic, independently recomputable scoring model and a canonical Arcade Rush `SessionResult` builder. The numbers in this document are **draft balance values**. They are not leaderboard Rules v1; AR10 owns the final balance freeze.

## Version boundary

- Contract version: `1` (frozen in AR0)
- Generator version: `1` (AR2)
- Scoring implementation version: `1`
- Draft rules version: `0`
- Status: `DRAFT_UNTIL_AR10`

Because rules version `0` is not leaderboard-final, AR3 results always have `recordEligible: false`. AR10 will promote the balanced ruleset to a positive rules version.

## Word points

The AR2 generator assigns each word a point tier from 1–5. Base values are 100, 125, 160, 200 and 250 points.

The runtime must calculate a completed word using the **combo after that word is completed**. Combo thresholds use integer basis points:

| Combo after completion | Multiplier |
| ---: | ---: |
| 1–9 | 1.00x |
| 10–19 | 1.10x |
| 20–39 | 1.25x |
| 40–69 | 1.50x |
| 70–99 | 1.75x |
| 100+ | 2.00x |

All point calculations resolve to integers.

## Run bonuses

Wave-clear bonuses accumulate only for fully cleared waves: 500, 1,000, 1,500, 2,000, 3,000 and 4,000 points for Waves 1–6 respectively.

Each perfect wave adds 1,500 points. A successful final boss adds 8,000 points. A successful run adds 2,000 points per remaining Core Integrity. Boss time adds 100 points per whole second remaining, capped by the 45-second boss duration.

Failed runs keep word, cleared-wave, perfect-wave and accuracy points already earned, but receive no boss, Integrity or boss-time bonus.

## Accuracy bonus

Accuracy applies to the subtotal of all non-accuracy components:

- below 90%: 0%
- 90–94.99%: 5%
- 95–97.99%: 10%
- 98–99.99%: 20%
- exactly 100%: 30%

The accuracy component is then added to produce the final integer score.

## Canonical result semantics

Arcade Rush results use the shared `buildSessionResult()` infrastructure. `modeData` stores every score component required to recompute the total, along with waves completed, final stage, boss state, boss time, Integrity, perfect-wave count, contract version and rules version.

`finalWave` is a stage index: normal failures report the wave entered next (`wavesCompleted + 1`), while any run that clears all six normal waves reports stage `7`, representing the boss/finale.

AR0 currently defines only one terminal gameplay failure: `core-destroyed`. Therefore failed AR3 results require zero remaining Integrity. Successful results require all six normal waves cleared, boss defeat and at least one remaining Integrity.

## Validation

`validateArcadeRushCanonicalResult()` verifies:

- required shared/result fields
- contract and draft rules versions
- seed validity
- success/boss/wave/Integrity consistency
- character and word counter consistency
- combo ordering
- record eligibility
- every stored score component
- final score equality after independent recomputation

Golden fixtures cover a perfect completion, average completion, one-Integrity completion, Wave 4 failure and Wave 6 failure. These fixtures are intended to become shared client/server scoring evidence in AR12.
