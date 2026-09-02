# Arcade Rush — Balance Certification & Rules v1

AR10 freezes the first leaderboard-compatible Arcade Rush ruleset.

## Frozen identity

- `ARCADE_RUSH_RULES_VERSION = 1`
- rules status: `FROZEN_V1`
- generator version: `1`
- scoring version: `1`
- 6 normal waves + Core Breaker
- 5 starting Core Integrity
- target successful run length: 4–6 minutes

Any later change that can alter ranked outcomes — wave counts, spawn cadence, movement speed, concurrency, vocabulary rules, boss rules, scoring, bonuses, or eligibility — requires a new `ARCADE_RUSH_RULES_VERSION` before it can be globally ranked.

## Why AR10 changed the draft pacing

The AR2 profiles authored 255 seconds of nominal wave duration, but the AR4 runtime correctly ends a wave when every planned target is resolved. With only 120 targets and the draft spawn cadence, strong players could schedule and clear all six waves far below the 4-minute lower bound.

Rules v1 fixes this by increasing the deterministic normal-wave budget to 168 targets and certifying the actual runtime pressure curve rather than relying on nominal duration metadata.

| Wave | Identity | Targets | Spawn interval | Speed | Max active |
|---|---|---:|---:|---:|---:|
| 1 | Ignition | 23 | 1500 ms | 60 px/s | 3 |
| 2 | Acceleration | 27 | 1350 ms | 64 px/s | 4 |
| 3 | Crossfire | 29 | 1250 ms | 70 px/s | 5 |
| 4 | Heavy Words | 25 | 1650 ms | 72 px/s | 4 |
| 5 | Overdrive | 31 | 1200 ms | 80 px/s | 6 |
| 6 | Critical | 33 | 1050 ms | 88 px/s | 7 |

The longer Heavy Words interval is deliberate: Wave 4 shifts pressure from raw density toward longer vocabulary before Waves 5–6 combine density, speed, and word complexity.

## Boss v1

Core Breaker remains unchanged:

- 8 HP
- 45-second encounter budget
- 7.5-second attack window
- deterministic phrase sequence from the run seed
- missed attacks damage Core Integrity
- timeout resolves as a final Core-destroying strike
- only gameplay failure reason remains `core-destroyed`

## Scoring v1

AR10 does not change the AR3 score arithmetic. The existing golden fixtures remain authoritative:

- word tier base points: 100 / 125 / 160 / 200 / 250
- combo multiplier: ×1.0 → ×2.0 by combo threshold
- cumulative six-wave clear bonus: 12,000
- perfect wave: +1,500
- boss clear: +8,000
- remaining Integrity: +2,000 each
- boss time: +100 per whole second remaining
- accuracy bonus: 0 / 5 / 10 / 20 / 30 percent

The larger v1 target budget naturally raises the attainable word/combo contribution. Optional letter-grade thresholds were never part of the canonical v1 contract and remain unfrozen/unimplemented.

## Deterministic certification model

`tests/arcade-rush-balance-certification.test.js` generates 96 fixed seeds using the production generator and evaluates eight synthetic player profiles:

- weak: 45 WPM / 90% accuracy
- slow accurate: 55 WPM / 98%
- average: 65 WPM / 94%
- good: 72 WPM / 96%
- fast: 80 WPM / 97%
- fast but inaccurate: 80 WPM / 85%
- very fast: 100 WPM / 99%
- expert: 120 WPM / 99.5%

The model uses production target words, edges, edge ratios, trajectory speeds, Core travel deadlines, max-concurrency limits, transition durations, boss intro duration, Core Breaker phrases, attack cadence, and boss duration.

It intentionally models a simple serial player rather than attempting to recreate human cognition. Accuracy reduces effective forward typing throughput; the player finishes the current target before switching and selects the most urgent remaining target next. The test is a repeatable balance regression gate, not runtime gameplay code.

Certification expectations:

- weak players fail around Waves 3–4;
- slow accurate players progress into Waves 5–6 but do not routinely finish;
- average players concentrate near the final normal waves;
- good players reach and sometimes defeat the boss;
- fast accurate players normally complete;
- equivalent fast but inaccurate play performs materially worse;
- very fast and expert players reliably complete;
- every certified successful good/fast/very-fast/expert run remains inside the 4–6 minute contract;
- expert median successful duration remains 4:00–4:30 rather than collapsing below four minutes.

## Eligibility after AR10

A canonical result is globally record-eligible only when all of these are true:

- rules version is at least 1;
- the run succeeded;
- Core Breaker was defeated;
- developer mode is false.

Failed runs remain valid local history but cannot rank globally. Developer-preview runs remain unranked.

AR11 and AR12 will consume these frozen v1 rules; AR10 itself does not expose a public leaderboard or change the production mode selector.
