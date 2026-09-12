# Practice Lab — Weakness Boss

`weakness-boss` is a developer-preview, fixed-dose Practice experiment that turns one current PL12 limiter into a focused encounter without creating a parallel weakness model.

## Canonical invariants

1. PL12 is the sole limiter/weakness authority.
2. Boss HP is protocol progress only. It is never a skill, accuracy, mastery, readiness, or treatment-response score.
3. Boss defeat means the fixed protocol completed. It never means mastered, retained, transferred, robust, or permanently fixed.
4. PL15 stable anchors are excluded.
5. PL16 owns acquisition evidence. Opening/Final probes are evidence-eligible but excluded from the Boss acquisition dose.
6. Exactly one Boss acquisition dose is committed only after the complete fixed protocol. No partial normalized Boss dose is created on abandon/incomplete completion.
7. PL32 owns delayed treatment response. Final Probe is a same-session comparison only.
8. PL33 v1 does not consume Weakness Boss treatment-response history.
9. PL36 is observational only and cannot target a Boss or change HP/damage.
10. Protected evaluation partitions, Custom Text, Campaign, Arcade Rush, leaderboards, and cloud/network services are outside PL37.

## Version and storage contract

PL37 introduces no migration and no new store:

- database version 11
- session summary record version 13
- foundation analysis version 10
- Weakness Boss experiment/protocol components version 1

The encounter plan is immutable after start and binds the active PL5 context, training corpus/index, one direct target, five phase materials, protocol versions, and material hashes. Sessions are not resumable.

## Eligibility and utility

Allowed entity identities are `key`, `bigram`, `trigram`, and `word`, using lowercase ASCII alpha syntax only (`[a-z]`, `[a-z]{2}`, `[a-z]{3}`, `[a-z]{2,24}`).

Eligibility requires a current PL12 `likely`/`confirmed` candidate, independent or partially-explained hierarchy, no stable-anchor exclusion, nonterminal PL16 saturation, approved training content, and utility >= 35.

The utility calculation is:

`clamp(BaseNeed × MasteryModifier × min(SaturationModifier, MarginalGainModifier), 0, 100)`

BaseNeed uses PL12 priority when known, otherwise 0.75 × WeaknessScore. Mastery and marginal-gain modifiers reuse the existing Practice utility semantics. Boss saturation modifiers are insufficient-data .75, not-detected 1, approaching .85, possible .65, likely .40, supported/resolved 0. Readiness and Treatment Response are intentionally absent.

Bounds are 32 initial PL12 candidates, eight expensive content preflights, eight final internal candidates, five visible candidates. Deterministic ordering is utility, priority, impact, limiter confidence, entity type (`key`, `bigram`, `trigram`, `word`), entity key.

## Protocol

Phase sequence and cue policy:

1. Opening Probe — off
2. Break Guard — strong
3. Pressure — subtle
4. Final Form — off
5. Final Probe — off

Exact opportunities are:

| Entity | Opening | Break Guard | Pressure | Final Form | Final Probe | Acquisition dose | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| key | 8 | 24 | 32 | 24 | 8 | 80 | 96 |
| bigram | 5 | 15 | 20 | 15 | 5 | 50 | 60 |
| trigram | 4 | 10 | 15 | 10 | 4 | 35 | 43 |
| word | 3 | 4 | 7 | 4 | 3 | 15 | 21 |

Approved `training` content and the established PL20–PL22 generators/indexes are reused to obtain target-bearing material and canonical matched/disjoint probes. Final Form interleaves target-free training material. No protected corpus partition is consumed.

## Gameplay presentation

HP allocation is deterministic: Opening 0, Break Guard 30, Pressure 30, Final Form 30, Final Probe 10. Correct, recovered, and unresolved target attempts all advance the same planned protocol damage. There is no player HP, lives system, fail state, score, grade, or stars.

Clean streak is limited to target first-pass correctness. Neutral material is ignored for streak resets.

The live UI exposes only Boss identity, selected target, HP, current phase, and clean streak. WPM, overall accuracy, mastery state, limiter score, pace pressure, metronome treatment, and read-ahead manipulation are intentionally absent.

## Probe/result semantics

Opening and Final probe quality use the canonical shared quality model and require at least 0.60 available quality coverage for a comparable quality delta. `ImmediateQualityDelta` is `FinalQuality - OpeningQuality` and is labeled “Final probe vs opening probe in this encounter.”

The persisted result is compact aggregate data. It contains no raw prompt text, raw user input, event trace, timestamp sequence, or physical-key sequence.

## PL32 contract

PL37 is a targeted PL32 treatment with protocol variant `one-boss-dose-v1`. The family/protocol fingerprint includes Boss experiment, policy, generator, probe, gameplay versions and target entity type. Cosmetic Boss archetype/theme is excluded.

Opening Probe is the baseline. Baseline observation time is Opening completion and baseline quality coverage must be >= .60. Exposure starts with Break Guard. Final Probe is excluded from immediate treatment-response interpretation. A future compatible Weakness Boss Opening Probe may satisfy a prior delayed same-protocol retest; PL32's existing minimum delay, different-local-day, 14-day expiry, first-eligible-outcome, contamination, retention, and transfer rules remain authoritative.

## Privacy/isolation

PL37 has no network sync, analytics endpoint, WebHID/WebUSB usage, leaderboard integration, Campaign changes, Campaign Boss reuse, or Arcade Rush coupling. Physical keyboard telemetry may continue independently through PL36 only when that sidecar is enabled; PL37 itself neither reads nor persists it.

See `docs/practice-lab/PL37-WEAKNESS-BOSS.md` for implementation-level details and certification notes.
