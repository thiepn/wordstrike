# Practice Lab — PL25 Daily Coach v1

PL25 adds **Daily Coach v1**, a local-first orchestration layer over the canonical Practice Lab evidence and training systems delivered in PL11–PL24. It does not introduce a new typing model, a new skill-state owner, or a new measurement channel. Its job is to choose and freeze a small same-day sequence from existing protocols, then preserve the ownership and interpretation rules of each child session.

## Version envelope

PL25 changes the persistence envelope only where a durable daily plan requires it:

- Practice database: **v8**
- `sessionSummary`: **v13**
- Foundation analysis: **v10**, unchanged
- `coachPlan`: **v1**
- Coach planner: **v1**
- Coach policy: **v1**
- Coach utility: **v1**
- Coach Review generator: **v1**

Database v8 adds `coachPlans`. Session summary v13 adds nullable `coachBinding`. No new foundation-analysis layer is introduced.

## Ownership boundary

Daily Coach is an orchestrator. Canonical ownership remains:

- PL11: skill evidence
- PL12: limiter identification, hierarchy and impact
- PL13/PL14: ability/current-state measurement where an existing child protocol explicitly owns it
- PL15: mastery
- PL16: learning curves, acquisition dose, saturation and marginal gain
- PL17: retention schedule and delayed verification
- PL18: protected evaluation / cold transfer
- PL19: Full Assessment
- PL20: Combination Repair
- PL21: Weak Keys
- PL22: Problem Words
- PL23: Accuracy & Recovery
- PL24: Real Text / protected Cold Transfer surface

PL25 does not write mastery, limiter, ability, performance, learning or retention state directly. Child sessions continue through the canonical Practice session engine and repository.

## Same-day frozen plan

A canonical Coach plan is unique for:

`profileId + contextId + localDayKey`

Once created, the plan is frozen. Its plan hash binds its block identities and protocol choices. Child completion, skipping, blocking or interruption updates lifecycle fields only; it does not substitute another target or recalculate the rest of the plan.

Reopening Daily Training on the same local day reads and reconciles the existing plan. It does not create a second plan.

A local-day rollover expires an unfinished plan. The next day may create a new plan from fresh evidence.

## Supported budgets

Daily Coach v1 accepts exactly:

- 5 minutes
- 8 minutes
- 12 minutes — default
- 15 minutes

An invalid stored/requested value normalizes to 12 minutes and is retained as a planning diagnostic. The planner may intentionally underfill a budget rather than invent a protocol or alter a canonical child dose.

## Block types

A plan can contain at most four blocks:

1. **Review** — internal PL17 delayed verification, when warranted
2. **Targeted intervention** — one canonical PL20–PL23 dose; a second target is possible only in the 15-minute plan under the v1 utility/diversity rules
3. **Real Text** — target-blind broad integration using the largest supported duration that fits: 10, 5 or 3 minutes

Review is always first when included.

If readiness is reduced, or a sufficiently supported warm-up pattern is observed, broad Real Text may precede focused acquisition. Review still remains first.

## Coach Target Utility

PL25 v1 uses a transparent bounded utility score rather than a new optimizer:

`CoachTargetUtility = BaseNeed × MasteryModifier × Headroom × ReadinessModifier × InterventionMatch`

where:

- `BaseNeed` uses PL12 priority when available; weakness is a fallback.
- `MasteryModifier` de-emphasizes later PL15 stages.
- `Headroom = min(SaturationModifier, MarginalGainModifier)` from PL16.
- `ReadinessModifier` only down-weights acquisition under reduced/unknown current state. It never creates a new measurement claim.
- `InterventionMatch` reflects whether the chosen existing protocol matches the measured execution pattern.

Only PL12 `likely` and `confirmed` limiter candidates enter the v1 target pipeline. Candidate construction and feasibility checks are bounded.

## Intervention mapping

The v1 default intervention family is deterministic:

- Accuracy & Recovery when accuracy/recovery pressure materially dominates and the entity type is supported.
- Weak Keys for key-level limiters.
- Combination Repair for bigrams/trigrams.
- Problem Words for word-level limiters.

No finger, hand, physical-key or QWERTY assumptions are introduced by Daily Coach.

## Hierarchy and duplicate-treatment suppression

PL12 hierarchy remains authoritative. Two candidates are treated as overlapping when they are the same stat/entity or when either candidate's `hierarchy.explainedBy` references the other.

Daily Coach avoids selecting a second target from the same hierarchy chain. Entities already covered by the included Review block are also suppressed from same-day acquisition selection.

## PL17 review semantics

Coach Review is a **retention measurement**, not acquisition practice.

The preflight generator:

- uses only training-partition reverse-index/word-summary APIs;
- uses fresh families where possible through each review binding's `excludeFamilyIds`;
- creates exactly the PL17 minimum opportunities for each included entity;
- caps the review plan at four bindings/cost units;
- interleaves multiple review targets rather than turning them into sequential acquisition drills;
- uses no target cues;
- stores a deterministic content-plan binding hash in the frozen Coach block.

The canonical PL16 learning analysis explicitly suppresses acquisition observations when a trusted retention measurement is active. Therefore Coach Review does **not** add acquisition dose.

If fresh content or the frozen review binding is no longer valid, the block is blocked. Daily Coach does not silently weaken PL17 criteria or replace it with an acquisition session.

## Intervening direct-practice hardening

PL25 hardens a PL17 boundary needed for correct scheduling:

When an entity with an active review cycle receives newer **direct acquisition practice** after the cycle's current `referenceAtUtc`, PL17 refreshes the scheduling reference to that direct-practice time and recomputes due/maturity timestamps from the current stability.

This refresh:

- keeps the same review cycle ID;
- preserves current-cycle and lifetime verification counts;
- preserves recent verified probe history and family history;
- does not count the direct practice as retention verification;
- cannot move the reference backward;
- does not reset the cycle unless the existing PL17 material-reference-upgrade/reacquisition rules independently require a reset.

## Real Text semantics

Daily Coach Real Text is target-blind. The frozen block contains no target entity and binds an exact supported duration. Current weak targets, limiter identities and review targets are not used to resample the Real Text passage.

A stale or incompatible Real Text block is blocked rather than replaced.

## Measurements remain optional and separate

Full Assessment and Cold Transfer may be surfaced as optional suggestions when their canonical systems say they are available/useful. They are not part of the Daily Coach training budget and never auto-run.

Daily Coach does not consume protected benchmark/transfer material during ordinary plan creation.

## Trusted `external-plan` boundary

Targeted Coach children use `targetSource="external-plan"`.

`external-plan` is privileged. A serializable configuration field or look-alike metadata object cannot grant it. The Coach service creates an object-bound binding in a `WeakMap` for the exact child `contentPlan` object.

The canonical session engine verifies:

- Coach plan identity/hash;
- profile/context identity;
- exact block ID/ordinal;
- exact precommitted `plannedSessionId`;
- active block state;
- exact experiment ID;
- exact direct target for targeted acquisition;
- exact review bindings/content hash for Coach Review;
- zero targets and exact duration for Real Text.

A child cannot simultaneously belong to Full Assessment and Daily Coach.

## Session summary v13

Every trusted Coach child persists compact provenance:

```text
coachBinding = {
  coachPlanId,
  blockId,
  blockOrdinal,
  plannerVersion,
  planHash
}
```

Ordinary sessions migrate to and persist `coachBinding: null`.

Raw daily-plan evidence snapshots, protected text and user content are not copied into `sessionSummary`.

## Lifecycle

Plan statuses:

- `planned`
- `active`
- `finished`
- `abandoned`
- `expired`

Block statuses:

- `pending`
- `active`
- `completed`
- `skipped`
- `blocked`
- `invalid`

A non-resumable active child with no canonical terminal summary reconciles to `invalid`. A target that was directly practiced after plan creation becomes `blocked` rather than being replaced. A stale PL17 review becomes `blocked` rather than being regenerated in place.

All-terminal plans become `finished` unless already abandoned/expired.

## UI contract

Daily Training is exposed only through the existing Practice Lab developer-preview gate in PL25 v1.

Before plan creation, the user can choose 5/8/12/15 minutes. After creation, the block list is frozen. Only the actual next pending block exposes Start/Skip. The UI shows concise, non-causal rationales based on the evidence used at planning time.

The UI does not claim mastery, retained skill, transfer success or causal improvement. Optional Full Assessment and Cold Transfer suggestions remain visually separate from the training plan.

## Failure policy

Daily Coach fails closed when a frozen child can no longer be executed responsibly:

- stale target → block, no substitution
- stale review cycle/hash → block, no substitution
- unavailable target-blind Real Text duration → block, no substitution
- interrupted non-resumable child → invalid
- local-day rollover → expire unfinished plan

This is intentional. Replanning after seeing a child result would change the protocol after treatment and make same-day orchestration harder to audit.

## Certification expectations

PL25 certification requires dedicated tests for:

- exact v1 constants/policy/utility math;
- intervention mapping and hierarchy suppression;
- budget/order/underfill/determinism;
- Review preflight and zero acquisition dose;
- DB v8 / `coachPlans` / session v13 migration;
- one canonical plan per profile/context/day;
- lifecycle reconciliation and idempotency;
- PL17 intervening-direct-practice refresh;
- object-bound Coach trust and spoof rejection;
- target-blind Real Text behavior;
- Daily Training route/UI/responsive/reduced-motion/non-causal copy;
- full existing WordStrike regression suite.

The phase remains a draft/developer preview until the exact latest branch head passes the normal repository `Tests` workflow.

## PL29 catalog availability

PL29 implements `consistency-trainer` and the `endurance` surface, but Daily Coach v1 does not automatically schedule either intervention. This is intentional: PL29 adds protocols and measurements without changing the stable PL25 planner policy. A future Coach version may consider pace variability, sustained decline, or low Endurance ability when choosing interventions.

## PL30 scheduling boundary

PL30 domains now exist, but Daily Coach v1 remains version-stable and does not automatically schedule `punctuation-capitals` or `numbers-symbols`. A later Coach policy may use domain ability or treatment-effect evidence.
