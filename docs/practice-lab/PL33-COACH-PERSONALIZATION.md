# PL33 — Coach Personalization

## Status

PL33 upgrades Daily Training from the generic PL25 Coach to **Coach v2**. It consumes the bounded longitudinal Treatment Response state introduced by PL32 and may use that evidence to make a small, conservative choice between already-compatible targeted interventions.

The governing rule is:

> **Current evidence decides whether a target needs practice. Treatment Response may only influence which compatible method is selected.**

PL33 does not increase workload, create new target types, infer causation, or let historical response evidence resurrect a target that current evidence does not justify.

## Frozen need gates

PL25 need and workload rules remain authoritative:

- actionable targeted intervention: **Base Coach Utility >= 35**;
- second targeted block in a 15-minute plan: **base utility >= 60**;
- review priority and review cost remain unchanged;
- Daily Training budgets remain 5 / 8 / 12 / 15 minutes;
- no response modifier is applied before these inclusion gates;
- personalized utility cannot make a base-ineligible target actionable;
- personalized utility cannot make a base-<60 target eligible as the second target.

`NeedUtility` is the pre-treatment component of the existing Coach utility calculation. Personalization is deliberately downstream of this calculation.

## Compatible treatment set

PL33 only compares interventions that are compatible with the target entity and available at plan creation time:

- key -> Weak Keys;
- bigram / trigram -> Combination Repair;
- word -> Problem Words;
- Accuracy & Recovery may be added as an alternative for key/bigram/trigram/word targets only when current accuracy/recovery pressure is **>= 20**.

The existing PL25 default intervention remains preferred when response evidence is absent, insufficient, stale, incompatible, or neutral.

Treatment family keys are resolved from the **current protocol/configuration identity**. A protocol or material version change therefore prevents stale evidence from silently carrying into a new treatment family.

## Evidence selection

PL33 reads only PL32 Treatment Response states matching all of the following:

- same profile;
- same Practice context;
- current Treatment Response model version;
- current treatment family;
- compatible target entity type;
- observations inside the recent **180-day** window.

Evidence selection is hierarchical:

1. sufficiently deep exact-target evidence;
2. otherwise sufficiently deep treatment-family evidence with the required target diversity;
3. otherwise no personalization.

Exact-target evidence is not pooled with family evidence merely to cross a threshold. Historical PL32 summaries are re-evaluated for the PL33 recent window rather than blindly trusting lifetime depth.

Only directional `positive-signal` and `negative-signal` histories can change the modifier. `little-signal`, `mixed`, low-depth, and insufficient histories are exactly neutral.

## Bounded response modifier

For an eligible response profile:

```text
Adjustment =
    Direction
  * 0.20
  * Magnitude
  * DepthWeight
  * FreshnessWeight
  * AssignmentWeight
  * MeasurementGradeWeight

ResponseModifier = clamp(1 + Adjustment, 0.80, 1.20)
```

Where:

- `Direction` is +1 for positive signal, -1 for negative signal, otherwise 0;
- `Magnitude` is bounded by the PL32 practical threshold and cannot exceed 1;
- Medium evidence receives half depth weight; High receives full depth weight; Low/insufficient receive zero;
- older eligible evidence is damped by freshness;
- Coach-only assignment histories are damped relative to histories containing manual assignments;
- hybrid measurement evidence is damped and cannot behave like fully prospective clean evidence.

The final modifier can therefore never leave **[0.80, 1.20]**.

For each compatible option:

```text
PersonalizedInterventionMatch = BaseInterventionMatch * ResponseModifier
PersonalizedOptionUtility = NeedUtility * PersonalizedInterventionMatch
```

The option with the highest personalized utility is selected. Ties retain the PL25 default preference before deterministic experiment-ID ordering.

## Persistence and same-day stability

PL33 is a **record-shape upgrade only**:

- Practice database remains **DB10**;
- no object stores or indexes are added;
- `coachPlan` record version becomes **v2**;
- Coach plan / planner / policy / block envelopes become v2;
- PL32 Treatment Response model version remains unchanged.

Legacy v1 Coach plans migrate to record shape v2 while preserving:

- `plannerVersion: 1`;
- `policyVersion: 1`;
- frozen treatment choices;
- frozen block ordering and session identity;
- no invented personalization metadata.

A same-day legacy plan is returned rather than replanned. PL33 never rewrites an already-frozen day simply because new code or response evidence became available.

## Audit data and UI

For new Coach v2 plans, targeted blocks may retain bounded personalization audit metadata:

- Need Utility;
- base and personalized utility;
- selected treatment family;
- response modifier;
- evidence scope/depth/pattern/freshness;
- assignment and measurement grade summaries;
- at most four compatible-option comparison rows;
- bounded PL32 response-state provenance.

No raw key events, mistyped strings, protected evaluation text, custom text, or private notes are persisted in Coach personalization diagnostics.

Normal Daily Training UI is intentionally restrained. When response evidence actually influenced the comparison it may say:

> Recent response evidence slightly influenced which compatible practice method was selected. Current need still determined whether the target was included.

This wording is observational. The UI must not claim that one treatment caused improvement, is proven best, or is guaranteed to work.

Detailed comparison values are visible only in developer preview diagnostics.

## Failure behavior

Treatment Response is optional input to Coach v2. If PL32 state loading fails or yields no compatible evidence:

- the response-state snapshot becomes empty;
- every response modifier is neutral (`1.0`);
- PL25-compatible default intervention selection remains available;
- Daily Training can still be created;
- no response-informed explanation is shown.

Response states are loaded once per profile/context/local-day planning pass and reused for the bounded candidate set; PL33 does not perform per-option longitudinal queries.

## Certification

The PL33 gate covers:

- frozen >=35 and >=60 base gates;
- Accuracy & Recovery alternative threshold;
- exact-target versus family fallback;
- context/entity/family/model isolation;
- 180-day recency;
- medium/high evidence rules;
- positive/negative cap behavior;
- freshness, Coach-only, and hybrid damping;
- neutral little-signal/mixed histories;
- narrow treatment override behavior;
- no-response equivalence with the PL25 default;
- Coach v1 -> v2 migration and same-day stability;
- DB10 / zero-new-store persistence;
- bounded UI diagnostics and non-causal copy;
- response-state read failure fallback and one-load behavior.

The full WordStrike suite remains the release regression gate because PL33 changes the shared Coach record version. Historical PL25/PL13 tests continue to protect their behavioral contracts, while version-envelope assertions track the current PL33 record shape.

## Rollback

PL33 can be rolled back by restoring the PL25 treatment-selection path and ignoring v2 personalization fields. PL32 Treatment Response stores do not need to be deleted or rewritten. Existing v2 plans remain auditable records; already-frozen same-day plans must not be silently replanned during rollback.
