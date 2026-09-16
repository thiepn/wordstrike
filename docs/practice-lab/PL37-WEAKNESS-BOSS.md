# PL37 — Weakness Boss

## Status

Developer-preview Practice experiment. PL37 is implemented on top of the certified PL36 architecture without a storage migration.

- Practice database: **DB11**
- session summary record: **v13**
- Practice foundation analysis: **v10**
- experiment ID: `weakness-boss`
- experiment version: **1**
- resumable: **false**
- evidence partition: **training only**

## Ownership doctrine

PL37 does not create a new weakness, mastery, learning, retention, transfer, readiness, or physical-keyboard model.

- **PL12** is the only Boss-target/limiter authority.
- **PL15** stable anchors are excluded from Boss eligibility.
- **PL16** owns acquisition-dose and learning evidence.
- **PL17/PL18** retain their existing review/measurement ownership.
- **PL32** owns delayed treatment-response evidence.
- **PL33** does not consume Weakness Boss response history in v1.
- **PL36** remains an optional observational sidecar only; PL37 never reads physical-key telemetry for targeting or damage.

Boss HP is deterministic protocol progress. It is not skill, accuracy, health, mastery, or a permanent-fix score. Boss defeat means the fixed encounter protocol was completed.

## Target selection

Supported targets are exactly:

- `key`: lowercase `a-z`
- `bigram`: two lowercase letters
- `trigram`: three lowercase letters
- `word`: 2–24 lowercase letters

A candidate must come from the current PL12 limiter snapshot, be `likely` or `confirmed`, be independent or partially explained, not be a PL15 stable anchor, not have PL16 saturation `supported`/`resolved`, have valid approved training material, and have Boss utility at least 35.

Boss utility uses existing Practice need/mastery/learning semantics:

`BossTargetUtility = clamp(BaseNeed × MasteryModifier × min(SaturationModifier, MarginalGainModifier), 0, 100)`

It deliberately has no readiness modifier and no Treatment Response modifier. Selection inspects at most 32 PL12 candidates, performs at most eight expensive content preflights, retains at most eight internal candidates, and renders at most five choices. Ties resolve by utility, PL12 priority, impact, limiter confidence, entity-type order (`key`, `bigram`, `trigram`, `word`), then deterministic entity key.

The recommended target is the highest eligible candidate. Manual choice is limited to the same current eligible set. Start revalidates the selected target and current context before freezing the encounter plan.

## Cosmetic archetypes

Archetypes are presentation only and never alter ranking, content dose, HP damage, evidence, or treatment identity.

- slow → **The Anchor**
- hesitant → **The Fog**
- inaccurate → **The Trickster**
- recovery-heavy → **The Hydra**
- launch-limited → **The Gatekeeper**
- unstable → **The Storm**
- mixed → **The Chimera**

## Fixed protocol

The phase order is immutable:

1. Opening Probe — cues off
2. Break Guard — strong cues
3. Pressure — subtle cues
4. Final Form — cues off, with target-free interleaving
5. Final Probe — cues off

Target opportunity quotas:

| Target | Opening | Break Guard | Pressure | Final Form | Final Probe | Battle dose | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| key | 8 | 24 | 32 | 24 | 8 | 80 | 96 |
| bigram | 5 | 15 | 20 | 15 | 5 | 50 | 60 |
| trigram | 4 | 10 | 15 | 10 | 4 | 35 | 43 |
| word | 3 | 4 | 7 | 4 | 3 | 15 | 21 |

Opening and Final probes are matched but disjoint canonical training probes. They contribute normal PL11 evidence but do not count toward the PL16 Boss acquisition dose. Only Break Guard + Pressure + Final Form count as the Boss acquisition dose. Exactly one normalized Boss dose is emitted only when the full protocol is observed; abandon/incomplete sessions do not create a partial Boss dose.

## HP and streak semantics

Boss HP starts at 100 and reaches 0 only through protocol progress:

- Opening Probe: 0 HP
- Break Guard: 30 HP
- Pressure: 30 HP
- Final Form: 30 HP
- Final Probe: 10 HP

Every planned target opportunity within a damage-bearing phase contributes the same deterministic progress. First-pass correctness, recovery, error severity, typing pace, and physical key events do not change damage.

Clean streak is descriptive encounter feedback only. A first-pass-correct target opportunity increments it; a first-pass target error resets it. Neutral interleaving does not reset it.

## Immediate result

The result stores compact aggregate evidence only:

- Boss/target identity
- Opening Probe aggregate metrics
- battle opportunity count, first-pass accuracy, and max clean streak
- Final Probe aggregate metrics
- `ImmediateQualityDelta = FinalQuality - OpeningQuality`

The UI labels this as **“Final probe vs opening probe in this encounter.”** It is not durable learning evidence. A Boss clear never claims mastery, retention, transfer, robustness, or a permanent fix.

## PL32 treatment response

Weakness Boss is a PL32 `targeted` treatment with variant `one-boss-dose-v1`.

The family/protocol identity binds Boss experiment, policy, generator, probe, gameplay versions and target entity type. Cosmetic archetype/theme is excluded. Assignment is manual.

- baseline = Opening Probe
- baseline timestamp = Opening completion
- baseline quality coverage must be at least 0.60
- treatment exposure begins on entry into Break Guard
- Final Probe is not an immediate Treatment Response outcome
- a future compatible Boss Opening Probe can satisfy an earlier delayed same-protocol retest under existing PL32 delay/contamination rules
- existing retention and transfer outcomes remain owned by PL32

PL33 v1 explicitly rejects `weakness-boss:` treatment-family history for coach personalization.

## Privacy and isolation

PL37 stores no raw typing text, raw event trace, raw physical-key sequence, or physical-key telemetry in its result. Generation uses approved `training` content only and does not use benchmark, transfer, research-holdout, or Custom Text as Boss material.

No PL37 runtime networking, WebHID, WebUSB, cloud analytics, leaderboards, Campaign state, Campaign difficulty, Campaign Boss code, or Arcade Rush code is introduced.

## UI contract

The setup screen is developer-preview gated and shows one recommended Boss plus at most four alternatives. Before start it states:

> The Boss challenge uses one fixed Practice dose. Boss HP represents challenge progress, not your skill score.

The active encounter shows Boss name, target, HP, current phase, and clean streak. It intentionally omits WPM, overall accuracy, mastery state, limiter score, pace pressure, metronome cues, and read-ahead manipulation.

The Final Probe is always named **Final Probe**, never “Mastery Test.” The result reiterates that defeat is challenge completion only.
