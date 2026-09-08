from pathlib import Path

ADDENDA = {
    "docs/PRACTICE_LAB_REVIEW_VALUE_AND_RETENTION_SCHEDULER.md": """

---

## PL25 Daily Coach addendum

PL25 consumes PL17 as the sole owner of retention scheduling and delayed verification. Daily Coach may place the hidden `daily-coach-review` block first when current due/overdue Review Value justifies it, but that block remains a genuine `retentionMeasurementKind = \"entity-review\"` session using training-partition content and frozen PL17 cycle bindings. It is not an acquisition intervention and emits zero PL16 acquisition observations.

PL25 also hardens the intervening-direct-practice rule. When newer direct practice occurs after an active review cycle's `referenceAtUtc`, PL17 refreshes that reference and recomputes maturity/due timing from current stability while preserving the cycle's verification history. The direct practice itself is not a retention verification. Material reference-quality upgrades and failure/reacquisition retain their existing cycle-reset semantics.

Daily Coach never owns due dates, retention outcomes, stability, verification counts, or Retained-stage eligibility. If a frozen Coach Review binding is stale at block start, the block is blocked rather than silently rebound or replaced.
""",
    "docs/PRACTICE_LAB_LEARNING_CURVES_AND_SATURATION.md": """

---

## PL25 Daily Coach addendum

Daily Coach is a read-only orchestration consumer of PL16. It may use current saturation and marginal-gain evidence to de-emphasize low-headroom targets, but it does not rewrite learning curves, observations, dose, or saturation state.

A PL20-PL23 targeted child preserves its canonical direct-target opportunity contract and therefore contributes the same acquisition dose it would contribute when launched manually. Hidden Coach Review is a PL17 retention measurement and contributes zero acquisition observations. PL24 Real Text remains target-blind and contributes zero direct acquisition dose. Merely including a block in a Daily Coach plan never manufactures a PL16 observation.
""",
    "docs/PRACTICE_LAB_SESSION_ENGINE.md": """

---

## PL25 Daily Coach addendum

PL25 advances `sessionSummary` to v13 solely to add nullable compact `coachBinding`; foundation analysis remains v10. The persisted binding contains `coachPlanId`, `blockId`, `blockOrdinal`, planner version, and plan hash. It is trusted only through object-bound content-plan registration. User/session configuration cannot set `coachBinding`, and `targetSource = \"external-plan\"` is rejected without trusted Coach binding.

At preparation the engine verifies profile/context identity, frozen plan hash, block ordinal, planned child session ID, experiment identity, and the block-specific target/review/Real-Text contract. Assessment and Coach bindings are mutually exclusive. Child completion reconciles exactly once to the matching active Coach block; stale parent state produces a diagnostic instead of reinterpreting the child.
""",
    "docs/PRACTICE_LAB_LIMITER_IMPACT_MODEL.md": """

---

## PL25 Daily Coach addendum

PL12 remains the sole owner of limiter status, phenotype, impact, hierarchy, and priority. PL25 reads a bounded set of likely/confirmed candidates as planning inputs and applies a separate Coach Target Utility for scheduling. This creates no new limiter diagnosis and mutates no PL12 state.

Hierarchy is used defensively so one explained limiter chain is not treated as several independent same-day acquisition targets. A target suppressed or de-emphasized by Daily Coach remains unchanged in PL12 and remains manually trainable through its normal experiment surface.
""",
    "docs/PRACTICE_LAB_MASTERY_AUTOMATICITY_MODEL.md": """

---

## PL25 Daily Coach addendum

PL15 remains the sole owner of mastery, automaticity, robustness, transfer interpretation, and Retained-stage progression. Daily Coach may use current mastery stage as a utility modifier when estimating acquisition headroom, but it never assigns, promotes, demotes, or persists a mastery stage.

PL17 retention evidence and PL11/PL18 transfer evidence continue to reach PL15 through their canonical paths. A Coach block being completed, skipped, blocked, or invalid has no mastery meaning by itself.
""",
    "docs/PRACTICE_LAB_PERFORMANCE_STATE_AND_FRONTIER.md": """

---

## PL25 Daily Coach addendum

PL14 performance state is a read-only readiness input to Daily Coach. Current readiness may down-weight focused-target utility or change ordering so broad Real Text occurs before focused acquisition. `unknown` or stale readiness is not interpreted as poor performance, and PL25 creates no PL14 measurement merely by planning or running a day.

Daily Coach does not modify the control frontier, warm-up model, burst reserve, or any performance-state policy. Dedicated PL14 measurement protocols remain authoritative.
""",
    "docs/PRACTICE_LAB_DATA_ARCHITECTURE.md": """

---

## PL25 Daily Coach persistence addendum

PL25 advances the Practice database to v8 and adds one `coachPlans` store. There is at most one canonical plan per `profileId + contextId + localDayKey`, enforced by the unique `profileContextDay` index. Plans are bounded compact decision records; raw traces, mistyped strings, protected text, custom text, and private notes are forbidden.

`sessionSummary` advances from v12 to v13 to add nullable compact `coachBinding` and a `coachPlanId` lookup index for child reconciliation. `skillStat`, `learningState`, `reviewItem`, `evaluationState`, `assessmentRun`, and foundation-analysis versions do not change. Historical ordinary sessions migrate with `coachBinding = null`.

Coach-plan retention is bounded independently of session history. Current-day/active plans and active Coach child summaries are protected from ordinary pruning; old terminal plans may be removed under PL25's retention limits.
""",
}

for filename, addendum in ADDENDA.items():
    path = Path(filename)
    text = path.read_text(encoding="utf-8")
    if "## PL25 Daily Coach addendum" in text or "## PL25 Daily Coach persistence addendum" in text:
        continue
    path.write_text(text.rstrip() + addendum + "\n", encoding="utf-8")
