# Arcade Rush AR2 — Deterministic Six-Wave Generator

AR2 implements the deterministic run-plan generator inside the isolated Arcade Rush subsystem. It does **not** expose Arcade Rush in the production mode registry or replace Daily Strike yet.

## Generator version

- Generator version: `1`
- Profile status: `DRAFT_UNTIL_AR10`
- Contract version remains independent from generator/balance revisions.
- AR10 owns the final leaderboard-affecting rules freeze.

## Authored run shape

The generated normal section contains exactly six waves and 120 unique targets:

| Wave | Identity | Targets | Target duration | Main pressure dimension |
| --- | --- | ---: | ---: | --- |
| 1 | Ignition | 18 | 35 s | warm-up / common words |
| 2 | Acceleration | 20 | 40 s | faster cadence |
| 3 | Crossfire | 20 | 40 s | simultaneous-target pressure |
| 4 | Heavy Words | 18 | 45 s | long vocabulary, lower density |
| 5 | Overdrive | 22 | 45 s | mixed high pressure |
| 6 | Critical | 22 | 50 s | peak normal pressure |

A 45-second boss target-duration placeholder is included in the plan envelope. Boss encounter content/mechanics are deliberately deferred to AR5. The authored duration budget is therefore 300 seconds (5 minutes), inside the AR0 4–6 minute target.

## Deterministic inputs

`generateArcadeRushPlan({ seed, vocabulary })` is pure. For identical inputs it returns an identical deeply frozen plan.

The plan pre-determines for every normal target:

- word;
- requested vocabulary source;
- wave and spawn order;
- entry edge;
- edge position ratio;
- provisional base point tier;
- trajectory profile/speed.

Random domains are independently derived from the run seed and stable labels. Seed `0` and seed `1` remain distinct even though the shared project random helper normalizes zero internally.

## Vocabulary model

`createArcadeRushVocabulary()` consumes already-loaded data; it does not fetch or touch storage. Pools are derived from the existing audited five-tier gameplay vocabulary:

- `common` — common word list;
- `low` — tiers 1–2;
- `mid` — tiers 2–3;
- `high` — tiers 3–4;
- `difficult` — tiers 4–5.

A run never repeats a normal target word. If the supplied vocabulary cannot satisfy the authored source/length budget without repetition, generation fails with `null` rather than silently weakening the contract.

## Spawn-plan constraints

- Edge ratios stay within 8%–92% of the selected boundary.
- No wave schedules three consecutive entries from the same edge.
- Wave source counts exactly match the authored profile.
- Word lengths must remain inside each wave's band.
- Maximum simultaneous target caps stay at or below 8 during the draft profile.

## Certification

AR2 has two dedicated test layers:

1. deterministic contract tests for exact budgets, immutability, source counts, seed behavior and plan validation;
2. a 1,000-seed simulation against the actual audited vocabulary checking uniqueness, target-length distributions, edge balance, structural load limits and distinct run signatures.

AR2 still performs no DOM work, storage access, networking, timers, event registration, runtime loop work, scoring, boss mechanics or production routing.
