# Arcade Rush AR2/AR10 — Deterministic Six-Wave Generator

AR2 introduced the deterministic run-plan generator inside the isolated Arcade Rush subsystem. AR10 has now frozen its leaderboard-affecting profile as Arcade Rush rules v1. Arcade Rush remains hidden from the production mode selector until the later cutover phase.

## Version boundary

- Contract version: `1`
- Rules version: `1`
- Generator version: `1`
- Profile status: `FROZEN_V1`
- Scoring version: `1`

Generator version and rules version remain separate concepts. Generator version describes the plan-format/algorithm implementation; rules version identifies the globally comparable gameplay rules. Any later ranked balance change requires a rules-version decision.

## Frozen v1 normal-run shape

The normal section contains exactly six waves and 168 unique targets:

| Wave | Identity | Targets | Target duration metadata | Spawn interval | Speed | Max active |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Ignition | 23 | 35 s | 1500 ms | 60 px/s | 3 |
| 2 | Acceleration | 27 | 40 s | 1350 ms | 64 px/s | 4 |
| 3 | Crossfire | 29 | 40 s | 1250 ms | 70 px/s | 5 |
| 4 | Heavy Words | 25 | 45 s | 1650 ms | 72 px/s | 4 |
| 5 | Overdrive | 31 | 45 s | 1200 ms | 80 px/s | 6 |
| 6 | Critical | 33 | 50 s | 1050 ms | 88 px/s | 7 |

The 35/40/40/45/45/50-second values are authored tuning metadata. AR4 ends a wave when all planned targets resolve; it does not force the player to wait until that metadata duration expires. AR10 therefore certifies actual generated target pressure and run duration separately in `ARCADE_RUSH_BALANCE_V1.md`.

The plan also contains a deterministic 45-second Core Breaker boss descriptor. The authored wave-duration metadata plus boss target duration remains 300 seconds, inside the product's 4–6 minute target.

## Deterministic inputs

`generateArcadeRushPlan({ seed, vocabulary })` is pure. For identical inputs it returns an identical deeply frozen plan.

Every normal target pre-determines:

- word;
- requested vocabulary source;
- wave and spawn order;
- entry edge;
- edge position ratio;
- base point tier;
- trajectory profile/speed.

Random domains are independently derived from the run seed and stable labels. Seed `0` and seed `1` remain distinct even though the shared project random helper normalizes zero internally.

## Vocabulary model

`createArcadeRushVocabulary()` consumes already-loaded data; it does not fetch or touch storage. Pools are derived from the existing audited five-tier gameplay vocabulary:

- `common` — common word list;
- `low` — tiers 1–2;
- `mid` — tiers 2–3;
- `high` — tiers 3–4;
- `difficult` — tiers 4–5.

A run never repeats a normal target word. If supplied vocabulary cannot satisfy the frozen source/length budget without repetition, generation returns `null` instead of silently weakening the rules.

## Plan constraints

- Edge ratios stay within 8%–92% of the selected boundary.
- No wave schedules three consecutive entries from the same edge.
- Wave source counts exactly match the frozen profile.
- Word lengths remain inside each wave's band.
- Maximum simultaneous target caps remain at or below 8.
- Total normal target budget is exactly 168.

## Certification

The generator has three layers of protection:

1. deterministic contract tests for exact budgets, immutability, source counts, seed behavior, plan validation and rules/profile versions;
2. a 1,000-seed simulation against the audited vocabulary checking uniqueness, target-length distributions, edge balance, structural load limits and distinct run signatures;
3. the AR10 balance certification, which consumes generated plans with actual trajectory deadlines and Core Breaker sequencing across synthetic player profiles.

The generator itself performs no DOM work, storage access, networking, timers, event registration, runtime loop work, scoring, or production routing.
