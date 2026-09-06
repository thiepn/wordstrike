# Practice Lab Review Value + Retention Scheduler — PL17

Status: canonical PL17 architecture contract  
Scope: delayed retention verification, review scheduling, Review Value, bounded queue/plan construction, and PL15 Retained-stage evidence  
Persistence envelope: Practice DB v5, `reviewItem` v3, `sessionSummary` v10, foundation analysis v8

---

## 1. Purpose

PL17 answers two questions that earlier Practice Lab phases intentionally did not answer:

1. **Has an acquired skill survived a meaningful delay?**
2. **When several review obligations compete for limited time, which one is most valuable to verify now?**

PL17 does not infer retention from exposure count, recent practice, elapsed wall time alone, a legacy review counter, or the fact that an entity remains strong in aggregate PL11 evidence. Retention requires a delayed, bounded, first-pass verification probe tied to the current review cycle.

PL17 also keeps **review timing** separate from **Review Value**:

- the stability model determines *when* an item becomes reviewable and due;
- Review Value determines *which currently actionable item* deserves scarce review time first.

Performance importance can change ordering, but it never rewrites the due timestamp.

---

## 2. Upstream contracts

PL17 consumes existing Practice Lab evidence instead of replacing it.

### PL11 — persistent skill evidence

PL17 uses canonical `skillStat` v3 evidence for:

- first-pass accuracy;
- normalized fluent residual timing;
- disfluency;
- targeted-history admission evidence;
- context isolation and entity identity.

Retention-review sessions may contribute ordinary PL11 evidence. This is intentional: a delayed probe is still a real observation of the skill.

### PL12 — limiter and impact interpretation

PL17 reuses PL12 peer references, limiter dimensions, hierarchy, and impact where available.

- reference execution quality uses the same underlying PL11/PL12 quality signals;
- impact contributes to Review Value/admission;
- missing impact uses the documented neutral Review Value fallback rather than becoming zero importance.

PL17 does not reinterpret absence from a bounded PL12 candidate snapshot as zero weakness or zero importance.

### PL15 — mastery and Retained stage

PL17 is the canonical retention-evidence provider for PL15.

Before PL17, the default PL15 retention provider was deliberately unverified, so `Retained` was normally unreachable. PL17 makes `Retained` reachable only when the current review cycle contains verified delayed-retention evidence that satisfies PL15’s existing Retained gate.

PL17 does not change PL15’s acquisition, transfer, robustness, automaticity, limiter-guard, or hierarchy formulas.

### PL16 — acquisition and learning curves

PL17 consumes `learningState.acquisition.lastObservedAt` for reacquisition and material reference-upgrade decisions.

A trusted PL17 retention-review session **must not add PL16 acquisition dose**. It can update PL11 evidence, but `retentionMeasurementKind = "entity-review"` causes PL16 acquisition/transfer learning-observation generation to emit zero learning deltas for that session.

---

## 3. Version envelope

PL17 intentionally avoids a structural IndexedDB migration.

| Contract | PL17 version |
| --- | ---: |
| Practice database | 5 |
| `reviewItem` record | 3 |
| `sessionSummary` record | 10 |
| foundation analysis | 8 |
| review model | 1 |
| review policy | 1 |
| review plan | 1 |
| retention probe | 1 |
| retention model | 1 |
| retention policy | 1 |
| Review Value | 1 |
| retention analysis | 1 |
| retention review delta | 1 |

No object store or index is added or removed. Existing `reviewItems` store indexes remain the structural persistence contract.

---

## 4. Canonical review item v3

There is at most one canonical review item per:

`profileId + contextId + entityType + entityKey`

The persisted v3 lifecycle states are:

- `inactive`
- `active`
- `suspended`

PL17 does **not** persist `due`, `overdue`, `learning`, `improving`, `stable`, or `mastered` as timer-driven lifecycle states.

### 4.1 Why due state is derived

Time passing must not require a database write. Due status is computed from the current injected time and the item’s timestamps.

For an active item:

- before `minimumMatureAtUtc`: `not-mature`
- mature but before `dueAtUtc`: `scheduled`
- at/after `dueAtUtc`: `due`
- sufficiently beyond due: `overdue`

Inactive and suspended items are not actionable.

### 4.2 Active-cycle fields

An active cycle records bounded scalar/audit data including:

- `cycleId`
- cycle start time
- reference evidence time
- reference execution quality
- reference mastery stage
- current stability/interval
- minimum maturity time
- due time
- current-cycle verification counts
- current-cycle successful-day/family evidence
- bounded recent probe-family/audit data

Raw content, typed text, event traces, containing-word lists, passages, and unbounded history are forbidden.

---

## 5. Admission and reconciliation

Review scheduling is reconciled from current canonical state. It is not created from arbitrary session analyzer output.

An entity may enter an active review cycle when all admission conditions hold:

1. PL15 mastery stage is at least `acquired`;
2. PL15 general evidence confidence is at least `medium`;
3. canonical reference execution quality is at least **70**;
4. the entity has targeted history **or** PL12 impact is at least **60**.

Admission is context-local. Evidence is never pooled across contexts.

### 5.1 Bounded admission

- maximum new review items per reconciliation pass: **100**;
- global review-item persistence cap: **5,000**;
- candidate ordering is deterministic.

### 5.2 Suspension

An active item is suspended when current PL15 mastery falls below `acquired`.

Suspension preserves compact historical audit evidence but removes current review actionability.

### 5.3 Reacquisition

A suspended/failed item can begin a new cycle only when newer PL16 acquisition evidence exists after the relevant prior-cycle/failure boundary and the entity again satisfies current admission quality/mastery requirements.

A new cycle receives a new `cycleId`. Evidence from an older cycle remains audit history only and cannot verify the new cycle.

### 5.4 Material reference upgrade

An active cycle is reset for a material reference upgrade only when:

- canonical reference execution quality improves by at least **8 points**; and
- PL16 acquisition evidence is newer than the current cycle start.

Ordinary drift in cumulative PL11 evidence does not continually reset review timing.

---

## 6. Initial review interval

Initial cycle interval depends on the PL15 mastery stage at activation:

| Stage | Initial interval |
| --- | ---: |
| Acquired | 1 day |
| Transferred | 2 days |
| Robust | 3 days |
| Retained | 7 days |

These are scheduler starting points, not claims about biological memory half-life.

---

## 7. Maturity, due, and overdue

Let `I` be the current interval in days.

Minimum maturity delay:

`M = max(0.5, 0.75 * I)` days

A probe cannot verify retention before `minimumMatureAtUtc`. PL17 additionally requires the probe to occur on a different local day from the cycle reference/relevant prior acquisition boundary.

The due time is stored as an exact UTC timestamp derived when the cycle is scheduled.

An item becomes overdue once elapsed scheduled pressure reaches the v1 overdue ratio:

`overdueRatio = 1.5`

Derived due pressure is a prioritization signal only; time passage does not mutate the review item.

---

## 8. Trusted retention-review session contract

Retention verification is privileged experiment metadata.

### 8.1 Trusted descriptor

A retention experiment declares:

`retentionMeasurementKind: "entity-review"`

Ordinary experiments use `null`.

Session configuration cannot set or spoof `retentionMeasurementKind`.

### 8.2 Content partition

`retention-review` is a PL6 corpus purpose mapped to the **training** partition.

A retention review is rejected if the active content plan cannot be proven to originate from trusted training-partition content.

Custom/unclassified content cannot self-label itself as a valid retention probe.

### 8.3 Correction behavior

Retention review requires:

`correctionBehavior = "allow"`

The score is based on first-pass opportunities, so allowing correction does not turn retries into new opportunities.

### 8.4 Plan binding

A review session binds a versioned review plan containing explicit review-item/cycle identities. The plan is validated at preparation and revalidated before retention measurement.

A stale cycle binding is never silently reinterpreted as the current cycle.

---

## 9. Probe construction and first-pass semantics

PL17 reuses the canonical first-attempt chronology already established by PL11/PL16.

A corrected retry does not create another verification opportunity.

Only the earliest bounded eligible target encounters are graded for retention.

| Entity | Minimum opportunities | Maximum graded opportunities |
| --- | ---: | ---: |
| key | 5 | 8 |
| bigram | 4 | 6 |
| trigram | 3 | 5 |
| word | 2 | 4 |

Large same-session repetition therefore cannot manufacture confidence or reacquisition.

A verification probe is invalid/non-verifying if required chronology is unavailable, the trace is not trustworthy for the bound plan, the plan is stale, maturity is not met, or minimum entity evidence is missing.

---

## 10. Shared execution-quality primitive

PL17 does not invent a second accuracy/speed/disfluency scale.

The shared execution-quality components are:

- accuracy weight: **0.45**
- speed weight: **0.40**
- disfluency weight: **0.15**

A score is produced only when the sum of available original weights is at least:

`0.60`

When that minimum is met, available components are renormalized over their available original weight.

This primitive is also reused by PL15 role quality and PL16 session learning quality so the three phases do not drift into lookalike formulas.

### 10.1 Reference quality

Persistent reference quality is derived from canonical PL11/PL12 evidence:

- absolute/relative first-pass accuracy;
- normalized residual speed quality;
- disfluency quality.

### 10.2 Probe quality

Probe execution quality uses the same component scales on the bounded first-pass review opportunities.

---

## 11. Retention quality

Let:

- `Qref` = cycle reference execution quality;
- `Qprobe` = delayed probe execution quality.

Preservation quality:

`PreservationQuality = clamp(100 + 2 * (Qprobe - Qref), 0, 100)`

Retention score:

`RetentionScore = 0.50 * Qprobe + 0.50 * PreservationQuality`

This rewards both absolute execution and preservation relative to the acquired reference state.

---

## 12. Retention outcomes

The v1 outcome is determined by probe and retention quality:

### Strong

- `Qprobe >= 80`
- `RetentionScore >= 85`

### Pass

- `Qprobe >= 70`
- `RetentionScore >= 70`

### Fragile

- `RetentionScore >= 55`
- and not Strong/Pass

### Fail

- otherwise

A valid bad probe is evidence. It is not discarded merely because performance was poor.

---

## 13. Stability update

Let:

- `S` = prior stability days;
- `d` = elapsed delay days at verification.

V1 updates are:

### Strong

`Snext = max(2.2 * S, 1.5 * d)`

### Pass

`Snext = max(1.6 * S, 1.15 * d)`

### Fragile

`Snext = max(0.5, min(1.05 * S, d))`

### Fail

`Snext = max(0.5, min(0.5 * S, 0.5 * d))`

Final stability is bounded to:

`0.5 <= Snext <= 180` days

The next due timestamp is scheduled from the resulting stability/interval policy. No daily decay write is performed.

---

## 14. Retention aggregate

The current cycle retains a bounded aggregate of the latest **5** retention scores.

PL17 uses the canonical PL8 robust-statistics median implementation for the aggregate median rather than duplicating median semantics.

Aggregate evidence is cycle-scoped. A cycle reset prevents historical successes from certifying the new cycle.

---

## 15. Retention confidence

Confidence intentionally depends on independent delayed evidence dimensions, not raw repetition count.

Let:

- `V` = verification count;
- `D` = distinct successful review-day count;
- `L` = maximum successful delay in days.

Factors:

`FV = 1 - exp(-V / 2)`

`FD = 1 - exp(-D / 2)`

`FL = 1 - exp(-L / 7)`

Confidence score:

`100 * (0.40 * FV + 0.25 * FD + 0.35 * FL)`

Levels:

- `none` when `V = 0`
- `low` below 50
- `medium` from 50 through 79.999...
- `high` at 80 or above

Same-session repetition cannot independently inflate `D` or `L`.

---

## 16. PL15 Retained eligibility

PL17 supplies `eligibleForRetained = true` only when the **current cycle** satisfies all of:

1. retention score at least **70**;
2. retention confidence at least **medium**;
3. at least **2 successful verifications**;
4. at least **2 distinct successful review days**;
5. maximum successful delay at least **3 days**;
6. at least **2 distinct successful probe families**.

PL15 still applies its own Retained gate afterward, including Robust prerequisite, retention score, confidence, and provider eligibility.

Thus PL17 evidence is necessary but not sufficient if PL15’s current mastery state has regressed.

---

## 17. Failure and cycle semantics

A failure is preserved as meaningful retention evidence.

It may:

- reduce stability;
- increase fragility/risk;
- prevent current-cycle retained eligibility;
- lead to suspension when current mastery no longer supports acquired status.

Failure evidence is protected from casual quota pruning because it explains why the scheduler may demand reacquisition or earlier review.

A later reacquisition opens a new cycle. Old failure/success history remains bounded audit data but does not verify the new reference state.

---

## 18. Review Value

Review Value ranks actionable work. It does not decide whether an item is due.

Base components:

- due pressure: **0.30**
- retention risk: **0.25**
- verification need: **0.20**
- fragility: **0.15**
- mastery need: **0.10**

`BaseValue = 0.30*DuePressure + 0.25*RetentionRisk + 0.20*VerificationNeed + 0.15*Fragility + 0.10*MasteryNeed`

### 18.1 Importance multiplier

When PL12 impact is unavailable:

`ImportanceMultiplier = 0.75`

When impact is available on 0–100:

`ImportanceMultiplier = 0.60 + 0.40 * Impact/100`

Impact changes prioritization, never due timing.

### 18.2 Review cost

V1 relative cost units:

| Entity | Cost |
| --- | ---: |
| key | 1.00 |
| bigram | 1.05 |
| trigram | 1.10 |
| word | 1.25 |

Review Value is cost-aware so a marginally useful expensive review does not automatically outrank several cheap high-value verifications.

### 18.3 Bands

- urgent: `>= 70`
- high: `>= 50`
- medium: `>= 30`
- low: below 30

Non-actionable items remain non-actionable regardless of numeric base signals.

---

## 19. Queue construction

The context queue is bounded and deterministic.

Maximum evaluated/returned review candidates in the v1 queue surface:

`100`

Normal queue construction uses context-batched repository reads and precomputed indexes/maps. It does not scan session history and does not execute one IndexedDB query per entity.

The queue may optionally admit near-due items when explicitly requested by the caller; default planning does not treat near-due items as due.

---

## 20. Review plan

A v1 review plan is a compact binding from selected queue items to exact review-item/cycle identities.

Bounds:

- maximum bindings: **8**
- maximum cost units: **8**
- near-due inclusion default: **false**

Plan selection is deterministic for identical evidence, time, policy, and bounds.

The plan does not persist user content.

---

## 21. Session integration

Foundation analysis advances from v7 to **v8** by adding a retention slot.

Ordinary sessions expose a frozen retention analysis with `status = "not-requested"` and persist `retentionReviewSummary = null`.

A valid entity-review session:

1. validates its trusted descriptor and content purpose;
2. validates the bound plan at preparation;
3. records ordinary PL11 evidence during typing;
4. excludes itself from PL16 acquisition/transfer learning-dose generation;
5. revalidates plan/cycle bindings before retention measurement;
6. builds bounded retention review deltas;
7. persists a compact v10 `retentionReviewSummary`;
8. applies review deltas inside the existing completed-session transaction.

---

## 22. Atomicity and exactly-once behavior

PL17 reuses the existing Practice completed-session transaction.

The atomic boundary includes, as applicable:

- session summary;
- PL11 skill evidence deltas;
- PL13 ability observation;
- PL14 performance-state delta;
- PL16 learning deltas;
- PL17 review-item changes;
- profile/checkpoint bookkeeping.

### 22.1 Duplicate session

If the same completed `sessionId` is replayed with the identical summary, the existing repository idempotency guard returns the prior commit result and no review verification is applied twice.

A conflicting payload for the same session ID is rejected.

### 22.2 Stale cycle delta

A structurally valid retention delta bound to an old cycle is skipped rather than applied to the new cycle.

A structurally invalid delta fails validation and prevents the transaction from committing.

This distinction prevents stale plans from corrupting current retention state while preserving strict input validation.

---

## 23. Restore and checkpoint behavior

PL17 v1 deliberately does not checkpoint or restore a live retention verification plan.

A restored typing session may continue ordinary Practice behavior/evidence, but it cannot emit a PL17 retention verification for a plan whose exact current-cycle binding was not revalidated from a fresh preparation path.

This is a conservative anti-stale rule, not a claim that retention cannot be measured after an interruption in future versions.

---

## 24. Persistence migration

### 24.1 `reviewItem` v2 to v3

Legacy v2 fields are preserved under:

`legacyReviewV2`

Canonical PL17 lifecycle/retention state starts fresh.

In particular, legacy fields such as:

- successful review count;
- failed review count;
- consecutive successes;
- last outcome;
- legacy mastery state;
- legacy priority/state/due scheduling

do **not** become canonical PL17 retention verifications.

A legacy record with many historical “successes” therefore migrates with current-cycle canonical verification count zero.

### 24.2 `sessionSummary` v9 to v10

Migration adds:

`retentionReviewSummary: null`

No historical retention evidence is fabricated.

### 24.3 Database version

Because no store/index structure changes, IndexedDB remains Practice DB **v5**.

---

## 25. Quota retention and deletion coupling

PL17 updates quota cleanup semantics for canonical review states.

- obsolete/inactive review schedules are preferred for pruning before active schedules;
- failure evidence is protected where possible;
- active v3 schedules are not mistaken for legacy `mastered`/`suspended` priority classes;
- if a canonical skill stat is pruned, its dependent PL16 learning state and PL17 review item are pruned together.

Orphan review items are also removed during scheduler reconciliation.

Practice reset clears review items with the rest of Practice-local data.

---

## 26. Privacy and bounded storage

Review data remains local Practice data and follows the same privacy boundary as preceding phases.

Forbidden durable review content includes:

- raw key/input event traces;
- typed buffers;
- full passages;
- custom-text bodies;
- containing-word arrays;
- raw latency sequences;
- unbounded probe histories.

`reviewItem` has an explicit **32 KiB** serialized-size cap.

Recent retention score/family audit rings are bounded by policy.

Session v10 stores only a compact retention-review summary, not raw review traces or deltas.

---

## 27. Performance boundary

PL17 normal service paths are designed around bounded, context-batched work:

- one context-level skill-stat read;
- one context-level review-item read;
- one context-level learning-state read when reconciliation requires reacquisition data;
- PL12 peer reference precomputation;
- PL15 mastery evaluation over the context evidence set;
- maps keyed by stat/entity/cycle;
- bounded queue and plan outputs.

It does not require scanning historical session summaries to decide current due state, confidence, reacquisition, or current-cycle retention eligibility.

PL15 retention evidence uses a batch map/fingerprint path so a mastery snapshot does not issue one review-item lookup per skill.

---

## 28. Determinism and clocks

All time-dependent evaluation receives an injected `now`/clock boundary.

For identical:

- persistent evidence;
- review state;
- trusted plan/content identity;
- policy versions;
- injected time;
- queue/plan bounds;

the resulting due state, retention score, stability update, confidence, Review Value, queue order, and plan selection are deterministic.

There is no random review promotion and no background daily decay write.

---

## 29. UI and gamification non-goals

PL17 provides model/service/session infrastructure only.

It does not add:

- badges;
- streak pressure;
- points/XP;
- public rankings;
- celebratory mastery claims;
- a new Practice Lab UI flow.

Future UI phases may consume the bounded queue/plan outputs but must not redefine PL17 timing or retention semantics.

---

## 30. Certification coverage

PL17 focused regressions cover at least:

- exact maturity/due/overdue derivation;
- retention/preservation formulas;
- outcome thresholds;
- stability formulas and bounds;
- confidence factors/levels;
- two-day/two-family Retained eligibility;
- Review Value and queue/plan bounds;
- trusted descriptor/config/content-purpose enforcement;
- first-pass bounded probe semantics;
- review v2→v3 migration without fabricated verification;
- session v9→v10 migration without fabricated retention;
- atomic review commits;
- stale-cycle skipping;
- duplicate-session exactly-once behavior;
- PL16 acquisition-dose exclusion;
- context isolation;
- privacy/size/ring bounds;
- reset/quota coupling;
- PL8–PL16 regression compatibility within the PL17 wrapper envelope.

---

## 31. Downstream contract

Later Practice Lab phases may tune recommendation strategy, content assembly, or UI presentation around PL17, but they must preserve these separations:

1. persistent skill evidence is not retention proof;
2. current mastery is not delayed retention proof;
3. due timing is not Review Value;
4. repeated same-session practice is not independent retention evidence;
5. old-cycle success cannot verify a new cycle;
6. review importance cannot move due timestamps;
7. retention-review practice cannot inflate PL16 acquisition dose;
8. legacy v2 review counters are compatibility history, not canonical PL17 evidence.
