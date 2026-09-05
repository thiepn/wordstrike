# Practice Lab Mastery + Automaticity Model (PL15)

PL15 defines long-term, per-entity typing skill maturity for WordStrike. It is a **derived model** over durable PL11 skill evidence, full PL12 limiter interpretation, trusted role evidence, and a future delay-aware retention provider. It is not a persistence schema, session analyzer, review scheduler, Coach, public Skill Map, or gamification layer.

## 1. Evidence is not mastery

PL11 `skillStat` records remain persistent truth. Exposure count, a single high-WPM performance, one perfect drill, disappearance from a weakness list, XP, and session count are not mastery. PL15 asks whether an individual key, bigram, trigram, or safe persisted word can be executed accurately, quickly, stably, and broadly enough, whether it transfers into protected unseen material, and eventually whether delayed verification shows that the skill persisted.

PL15 does not compute a single global `Typing Mastery` number and does not average unlike entity types together.

## 2. Mastery and automaticity are separate

Automaticity is execution quality supported by sufficient evidence:

```text
speed + accuracy + stability + context robustness + evidence confidence
```

Mastery is broader. Its dimensions are:

```text
25 Accuracy
20 Speed
15 Stability
15 Context Robustness
15 Transfer
10 Retention
```

Missing transfer or retention evidence contributes zero to the mastery score. Missing weight is **not** renormalized away.

The v1 weights and thresholds are centralized product/engineering priors, not claims of scientifically optimal constants.

## 3. Canonical stages

Ordered stages:

```text
unmeasured -> learning -> acquired -> transferred -> robust -> retained
```

User labels are `Unmeasured`, `Learning`, `Acquired`, `Transferred`, `Robust`, and `Retained`.

- **Unmeasured**: no meaningful PL11 opportunity/general-confidence evidence.
- **Learning**: measured, but the acquisition gate is not satisfied.
- **Acquired**: strong enough core execution and automaticity under accumulated evidence; transfer is not yet proven.
- **Transferred**: Acquired plus sufficient protected/unseen `roles.transfer` evidence.
- **Robust**: Transferred plus stronger automaticity, stability, context breadth/diversity, and high evidence confidence.
- **Retained**: Robust plus future delay-aware verified retention evidence.

Stages are derived on every evaluation. They may demote or recover when durable evidence changes. No stage is permanently persisted, and no `promoteMastery()` or manual `Mark Mastered` operation exists.

## 4. Automaticity dimensions

### Speed

PL15 reuses PL12's full `slow` dimension evaluation. When it has sufficient evidence:

```text
SpeedQuality = clamp(100 - SlowSeverity, 0, 100)
```

If the PL12 slow result is `insufficient-evidence`, speed quality is `null`. Absence from the bounded public limiter list is never interpreted as perfect speed.

### Accuracy

Absolute first-pass error rate is:

```text
opportunities.errorCount / opportunities.count
```

V1 absolute-quality thresholds:

| Entity | 100 quality at/below | 0 quality at/above |
| --- | ---: | ---: |
| key | 1.5% | 8% |
| bigram | 2% | 10% |
| trigram | 3% | 12% |
| word | 5% | 20% |

Quality is linearly interpolated between thresholds.

Where PL12 relative inaccuracy evidence is valid:

```text
RelativeAccuracyQuality = 100 - InaccuracySeverity
AccuracyQuality = min(AbsoluteAccuracyQuality, RelativeAccuracyQuality)
```

If only absolute accuracy is available, PL15 uses it with a conservative v1 dimension-confidence cap of **65**. This cap is an engineering default because the PL15 contract requires lower confidence but does not prescribe an exact number. No accuracy evidence yields `null`, never 100.

### Stability

PL15 reuses PL12's full `unstable` dimension:

```text
StabilityQuality = 100 - InstabilitySeverity
```

Insufficient instability evidence yields `null`.

### Context robustness

Context robustness and transfer are intentionally separate. Robustness asks whether strong execution has appeared across varied contexts/roles; transfer asks whether it generalized into protected unseen material.

Breadth:

```text
BreadthScore = 100 * (1 - exp(-breadthEvidencePoints / 12))
```

The scale `12` is a versioned v1 engineering constant.

Eligible robustness roles:

```text
training, diagnostic, transfer, benchmark
```

`custom` and `unclassified` do not count toward role coverage. Benchmark may corroborate robustness but does not substitute for transfer.

Role coverage:

```text
0 roles -> 0
1 role  -> 40
2 roles -> 70
3 roles -> 90
4 roles -> 100
```

For at least two valid role qualities:

```text
Qmin = minimum role quality
Qmax = maximum role quality
RoleConsistency = clamp(Qmin - 0.5 * (Qmax - Qmin), 0, 100)
```

Multi-role robustness:

```text
0.55 * BreadthScore
+ 0.20 * RoleCoverageScore
+ 0.25 * RoleConsistency
```

Single-role robustness:

```text
min(70, 0.75 * BreadthScore + 0.25 * RoleCoverageScore)
```

With no eligible role quality, context robustness is `null` in v1.

## 5. Role quality

A reusable role-quality model consumes PL11 role-lane counters only. Minimum opportunities are:

| Entity | Minimum opportunities |
| --- | ---: |
| key | 20 |
| bigram | 12 |
| trigram | 8 |
| word | 3 |

A participating role also needs at least one session.

Role accuracy uses the same entity-type absolute first-pass thresholds as automaticity.

Where overall means are available:

```text
ExpectedApprox = OverallFluentLatencyMean - OverallFluentResidualMean
RoleRelativeResidual = RoleFluentResidualMean / ExpectedApprox
```

`ExpectedApprox` must be positive. Role speed is 100 at relative residual <=3%, 0 at >=30%, linear between, and 100 for negative residual.

Role disfluency is 100 at <=5%, 0 at >=20%, linear between.

Weights:

```text
45% Accuracy
40% Speed
15% Disfluency
```

Available metrics are renormalized only when their original weight coverage is at least 0.60. Otherwise role quality is `null`.

## 6. Automaticity score and confidence cap

Core weights:

```text
30% Speed
30% Accuracy
20% Stability
20% Context Robustness
```

Missing dimensions contribute zero; they are never reweighted away.

```text
Core = 0.30S + 0.30A + 0.20V + 0.20C
```

PL15 reuses PL11 confidence channels:

```text
AutomaticityConfidence = min(
  GeneralConfidence,
  AccuracyConfidence,
  NormalizedResidualConfidence,
  DisfluencyConfidence
)

AutomaticityScore = min(Core, AutomaticityConfidence)
```

Hard guard: if `AccuracyQuality < 40` or `SpeedQuality < 35`, automaticity is capped at 50.

Statuses:

```text
unavailable score -> unmeasured
0..54             -> developing
55..74            -> emerging
75..89            -> established
90..100           -> strong
```

Repetition count affects confidence only through the existing PL11 evidence model; repetition is never the automaticity score.

## 7. Mastery score and acquisition score

Full mastery:

```text
MasteryScore =
  0.25A + 0.20S + 0.15V + 0.15C + 0.15T + 0.10R
```

`availableWeight` reports the original percentage weight backed by actual dimension evidence.

Core acquisition deliberately excludes transfer and retention:

```text
AcquisitionScore = (25A + 20S + 15V + 15C) / 75
```

Missing core dimensions still contribute zero.

A high scalar mastery score never bypasses stage prerequisites.

## 8. Transfer model

Only the trusted canonical `roles.transfer` lane can establish transfer in PL15. Custom content cannot spoof transfer through arbitrary experiment metadata, and benchmark evidence does not substitute for transfer in v1.

Minimum protected transfer evidence:

| Entity | Opportunities | Sessions |
| --- | ---: | ---: |
| key | 30 | 2 |
| bigram | 20 | 2 |
| trigram | 12 | 2 |
| word | 5 | 2 |

Confidence:

```text
Q = 1 - exp(-opportunities / scale)
S = 1 - exp(-sessions / 2)
TransferConfidence = 100 * (0.65Q + 0.35S)
```

Scales are key 30, bigram 20, trigram 12, word 5. Confidence levels reuse PL11 semantics: none at zero evidence, low <50, medium 50..79, high >=80.

Transfer quality is `computePracticeRoleQuality(stat, "transfer")`. Count increases confidence, not quality.

Where both training and transfer role qualities exist:

```text
TransferGap = TrainingQuality - TransferQuality
```

Transferred-stage eligibility requires `TransferGap <= 20`. If no training quality exists, valid transfer evidence may stand on its own.

## 9. Retention provider contract

PL15 defines a future `getPracticeRetentionEvidence({ profileId, contextId, entityType, entityKey })` provider returning:

```text
status
score
confidenceScore
confidenceLevel
verificationCount
lastVerifiedAt
eligibleForRetained
```

Statuses are `unavailable`, `unverified`, `verified`, `failed`.

The default PL15 provider always returns `unverified`, `score: null`, confidence `none`, and `eligibleForRetained: false`. Therefore **Retained is unreachable in normal PL15 production operation**.

PL15 does not infer retention from `lastObservedAt`, days since practice, or legacy success/failure review counters. It does not hard-code 24-hour/3-day/7-day delays. PL17 owns delay-aware retention and review-value policy. A test-only future provider may demonstrate Retained logic only when `eligibleForRetained === true`.

## 10. Stage gates

### Acquired

All required:

```text
AcquisitionScore >= 75
AutomaticityScore >= 70
General confidence >= medium
AccuracyQuality >= 70
SpeedQuality >= 60
StabilityQuality >= 55
ContextRobustness >= 50
no confirmed critical limiter
```

There is no training-role requirement; naturally skilled entities can qualify.

### Transferred

Acquired plus:

```text
TransferScore >= 70
TransferConfidence >= medium
entity-type transfer opportunity minimum met
transfer sessions >= 2
TransferGap <= 20 where calculable
```

Without transfer evidence, stage cannot exceed Acquired.

### Robust

Transferred plus:

```text
AutomaticityScore >= 80
AcquisitionScore >= 80
ContextRobustness >= 75
StabilityQuality >= 75
General confidence >= high
>= 2 eligible non-custom evidence roles
no likely or confirmed critical limiter
```

### Retained

Robust plus:

```text
retention.status = verified
retention.score >= 70
retention.confidence >= medium
retention.eligibleForRetained = true
```

In normal PL15 operation this gate cannot be reached because the default provider is unverified.

## 11. Limiter guards

PL15 evaluates full PL12 dimensions for every relevant entity. It does **not** infer health from omission from `primaryLimiterIds` or the bounded candidate list and does not copy PL12 formulas.

Execution-critical dimensions are:

```text
slow, hesitant, inaccurate, recovery-heavy, unstable
```

Words additionally treat `launch-limited` as critical.

At severity >=50:

- a **confirmed** critical limiter caps stage at Learning;
- a **likely** critical limiter caps stage at Acquired.

PL12 real-world impact does not excuse a severe execution-quality defect. Impact is for downstream priority, not whether the entity itself is mature.

## 12. Stable-anchor eligibility

An entity is anchor-eligible only when:

```text
stage is Robust or Retained
AutomaticityScore >= 80
General confidence = high
no likely/confirmed critical limiter
```

Anchor eligibility means the entity is safe stable material for later mixed practice. It does not mean the entity must never appear again. PL25 decides whether and how much to use anchors.

## 13. Hierarchy readiness

PL15 exposes:

```text
promotionEligible
lowerLevelSupportRequired
blockingEntityIds
```

Promotion eligibility requires stage >=Acquired, automaticity >=75, general confidence >=medium, and no confirmed critical limiter. It only means higher-complexity practice may reasonably build on the skill.

For lower-level support, PL15 consumes PL12 hierarchy output. `explained` or strongly `partially-explained` higher-level entities can surface up to three safe lower-level stat IDs. V1 treats explanation ratio >=0.50 as “strongly partially explained”; the PL15 contract leaves that cutoff unspecified, so 0.50 is an explicit versioned engineering default.

PL15 never rewrites practice content itself.

## 14. Stage demotion and determinism

Mastery is pure derived state. Same PL11 evidence + full PL12 evaluation + retention evidence + policy gives the same result. No randomness, hidden timers, or current-date decay is used.

Later durable PL11 deterioration may demote Robust -> Transferred -> Acquired -> Learning. Later stronger durable evidence may raise it again. A future Retained failure may demote to Robust.

No entity demotes merely because `lastObservedAt` is old or because today is a bad day.

## 15. Temporary-state and ability independence

PL13 `abilityState.estimateWpm` is not a mastery threshold. A fast user can have an unmastered pattern; a slower user can have a highly automatic common pattern.

PL14 `performanceState.currentStates`, temporary readiness, control frontier, burst state, warm-up, fatigue, and day-state labels are not PL15 inputs. A PL14 readiness change alone must leave PL15 output unchanged. Only newly committed durable PL11 entity evidence may legitimately change mastery.

## 16. Context isolation

Mastery is keyed by profile + context + entity. The same `th` entity may be Robust in one context and Learning in another. PL15 does not average across contexts and does not create global cross-context mastery.

## 17. Snapshot and direct query

The context snapshot is immutable and versioned. It reports stage counts, automaticity counts, anchor eligibility count, promotion eligibility count, transfer-unverified count, retention-unverified count, bounded entities, and diagnostics.

Snapshot statuses are `ready`, `partial`, and `insufficient-data`. The default returned entity bound is 512. Full peer/hierarchy evaluation may inspect the entire context; only returned output is bounded.

V1 snapshot `ready` uses >=75% measured core-dimension coverage. The PL15 contract does not prescribe an exact ready/partial threshold, so 0.75 is a documented engineering default. Retention may still remain unavailable in a `ready` snapshot.

Direct `getEntityMastery(profileId, contextId, entityType, entityKey)` queries do not require callers to request all returned snapshot entities, but still evaluate the full context needed for peers/hierarchy.

No snapshot contains a global mastery score or treatment priority.

## 18. Caching

A bounded in-memory cache is allowed. Cache identity includes:

- profile and context;
- mastery model/policy version;
- automaticity version;
- context-robustness version;
- transfer version;
- mastery-hierarchy version;
- PL12 model/policy identity;
- durable skill-evidence fingerprint;
- retention-provider version/fingerprint;
- output bounds/filter identity.

Durable skill changes, PL12 policy changes, PL15 policy/model changes, or retention changes invalidate reuse. No mastery snapshot is persisted to IndexedDB or localStorage.

## 19. Persistence and legacy fields

PL15 is derived. Persistent versions remain unchanged from PL14:

```text
Practice DB version:          4
skillStat record version:     3
sessionSummary record version:8
foundationAnalysis version:   6
```

PL15 versions:

```text
mastery model version:        1
mastery policy version:       1
automaticity model version:   1
context robustness version:   1
transfer model version:       1
mastery hierarchy version:    1
```

No IndexedDB store is added, `PRACTICE_DATABASE_VERSION` is not bumped, the PL11 `skillStat` schema is not bumped, `foundationAnalysis` is unchanged, and `sessionSummary` is unchanged.

Persisted `skillStat.masteryState` and `reviewItem.masteryState` are legacy/non-authoritative compatibility fields. PL15 neither reads them as canonical mastery nor writes PL15 stages/scores into them. Historical `MASTERY_STATES` remains intact where legacy validation depends on it.

## 20. Service and performance boundary

`createPracticeMasteryService(...)` is side-effect free at construction. PL15 reads context and PL11 skill stats, then derives PL12 full dimension/peer/hierarchy interpretation plus retention-provider data. It does not read raw `eventTrace`, scan hundreds of session summaries, require PL13 ability stores, or require PL14 performance state.

The context path is designed around approximately O(number of context skill stats) work plus bounded hierarchy handling. Peer/hierarchy maps are reused; no intentional entity x entity quadratic pass is introduced. Role quality is derived once per entity evaluation and reused by robustness/transfer/mastery paths where practical.

## 21. Validation and immutability

PL15 exposes pure result validation for bounded mastery/acquisition/available-weight values, automaticity status/score consistency, confidence caps, transfer prerequisites, and Retained eligibility. Derived entity/snapshot results are deep-frozen. Input PL11 stats, PL12 results, and retention evidence are never mutated.

## 22. Privacy

PL15 consumes only safe canonical entities that PL11 persisted. It does not reconstruct arbitrary private Custom Text words. Safe persisted key/bigram/trigram evidence may acquire automaticity normally; custom role does not establish transfer or multi-role robustness by itself.

## 23. Public UI and gamification

PL15 adds no Mastered card, badge, XP reward, animation, Skill Map, exercise generator, or Coach action. It supplies validated skill state only.

## 24. Tests

PL15-focused tests cover absolute accuracy, speed/accuracy/stability semantics, automaticity weighting/confidence/hard guards, breadth, role quality, role consistency, single-role caps, transfer quantity/confidence/quality/gap, acquisition/mastery scores, all reachable stages, default retention unreachability, mocked future Retained behavior, limiter guards, anchors, hierarchy readiness, demotion/recovery, context isolation, PL13/PL14 independence, caching/invalidation, immutability, privacy boundaries, no persistence writes, and bounded snapshots/direct queries.

The full WordStrike suite remains the phase gate so PL8–PL14 behavior is regression-tested together with PL15.

## 25. Non-goals remaining after PL15

PL15 still does not implement:

- delayed retention scheduling;
- retention probability or forgetting/decay;
- review-value calculation or review intervals;
- learning curves;
- saturation/plateau detection;
- marginal learning gain / Learning Value;
- treatment selection or personalization;
- Daily Coach;
- exercise generation;
- public Skill Map;
- public mastery badges.

## 26. Downstream contracts

### PL16 — Learning Curves + Saturation

Consumes recent PL11 evidence, PL13 ability comparisons, and PL15 mastery stages to ask whether the entity is still improving, whether learning has saturated, and whether further acquisition practice remains worthwhile. PL15 does not calculate trajectories.

### PL17 — Review Value + Retention Scheduler

Implements the real delay-aware retention evidence provider and makes Retained reachable. PL17 supplies `eligibleForRetained`; PL15 does not invent delay policy and PL17 must not redesign the stage model.

### PL25 — Daily Coach

May consume mastery stage, automaticity, anchor eligibility, and hierarchy readiness as durable inputs. PL15 does not choose treatments, exercises, practice minutes, or Coach priority. Robust and Retained entities must remain available as potential stable anchors rather than being permanently excluded from future practice.
