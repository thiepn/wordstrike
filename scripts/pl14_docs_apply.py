from pathlib import Path

root = Path(__file__).resolve().parents[1]

sections = {
    "docs/PRACTICE_LAB_DATA_ARCHITECTURE.md": r'''

## PL14 — performance state persistence (current DB v4)

PL14 advances the **current Practice IndexedDB structural version from 3 to 4**. The v3 PL13 `abilityStates` store remains unchanged and continues to own slow-changing latent ability. DB v4 adds exactly one new store:

```text
performanceStates
```

`performanceStates` is keyed by `performanceStateId` and owns one bounded record per `(profileId, contextId)`. Its indexes are:

```text
profileId
contextId
updatedAt
profileContext = [profileId, contextId]  // unique
```

The persisted domains are deliberately separate:

```text
abilityStates
= slow-changing latent ability

performanceStates.currentStates
= temporary, channel-specific performance state/readiness

performanceStates.warmupModels
= cross-session model of within-session warm-up response

performanceStates.controlFrontier
= controlled-speed speed/control boundary
```

The performance-state record is version 1 and capped at 64 KiB. It stores no passage/custom text, raw event trace, target entity list, word list, or containing-word data. Current-state observations are one latest observation per canonical PL13 ability channel; warm-up evidence is bounded to 24 observations per channel; frontier evidence is bounded to 64 aggregate stage points.

A v3→v4 schema upgrade creates only `performanceStates`; existing stores and indexes are not rewritten. Practice reset clears `performanceStates`. Ordinary quota retention does **not** prune it because the record is bounded, context-scoped, and high-value model state.

Session summaries advance from v7 to v8 solely to add compact `performanceMeasurementSummary`. Historical v7 summaries migrate with:

```text
performanceMeasurementSummary: null
```

No historical readiness, warm-up, or frontier is inferred or backfilled.

Completed-session persistence accepts an optional `performanceStateDelta`. The existing session-summary duplicate check runs before the delta is merged. When present, the repository loads/creates the matching `(profileId, contextId)` performance state, merges the bounded delta, validates the complete record, and writes it inside the same atomic completed-session transaction as PL11 skill evidence, PL13 ability observation, review/profile changes, and checkpoint clearing. Identical retries therefore apply the performance delta once; conflicting reuse of a session ID applies it zero times.
''',
    "docs/PRACTICE_LAB_ABILITY_ESTIMATION.md": r'''

## PL14 boundary — latent ability is not current readiness

PL14 does not change the meaning of `abilityStates`. PL13 ability remains a **slow-changing latent capability estimate** scoped by `(profileId, contextId, abilityChannel)`. It is not a container for current readiness, warm-up response, or the control frontier.

A PL14 `state-probe` loads a frozen copy of the relevant PL13 ability state and compares the current adjusted log performance against that reference. Under the PL14 v1 trusted-descriptor contract, a session cannot simultaneously declare an `abilityChannel` measurement and a PL14 `performanceMeasurementKind`. Consequently, a temporary state probe cannot update ability merely because the user is unusually slow or fast today.

Likewise, PL14 control-frontier stage points never write `abilityStates`. The frontier is a separate speed/control boundary learned from controlled-stage observations. A future protocol may deliberately support more than one measurement role, but that requires a new versioned contract rather than implicit pooling.

The shared adjusted-performance extraction introduced by PL14 preserves PL13's v1 ability-observation mathematics exactly: the same typability adjustment, uncertainty components, sigma/reliability calculations, eligibility gates, and recursive ability estimator remain authoritative. PL14 consumes those pure calculations; it does not redefine them.
''',
    "docs/PRACTICE_LAB_SESSION_ENGINE.md": r'''

## PL14 trusted performance-measurement contract

PL14 extends the runtime experiment descriptor with trusted metadata:

```text
performanceMeasurementKind:
  null | "state-probe" | "control-frontier"

performanceReferenceChannel:
  canonical PL13 ability channel for state-probe
  "controlled-speed" for control-frontier
```

These fields are descriptor-owned. Session configuration cannot assign or spoof them. PL14 v1 rejects a descriptor that simultaneously declares `abilityChannel != null` and `performanceMeasurementKind != null`.

A trusted `control-frontier` descriptor must additionally provide runtime-only:

```text
buildPerformanceMeasurement(input) -> { stages: [...] }
```

The callback is forbidden for other measurement kinds. It receives frozen finalization data (session/metrics snapshots, retained event trace, foundation analysis before PL14 performance attachment, and bounded content-plan metadata). The experiment supplies stage **candidates only**; generic PL14 code validates the callback output, applies canonical text-difficulty adjustment, constructs aggregate frontier points, and owns persistence. Stage text is never persisted.

`state-probe` requires no experiment-supplied measurement callback. Generic PL14 finalization loads the current ability state for `performanceReferenceChannel` before calculating innovation/readiness. A low-confidence or unavailable reference produces bounded `not-eligible` diagnostics and no current-state write rather than inventing readiness.

Foundation analysis advances from v5 to v6 and now has the permanent top-level shape:

```text
{
  version: 6,
  latency,
  errors,
  normalization,
  skills,
  ability,
  performance
}
```

`foundationAnalysis.performance` is version 1 and contains the bounded measurement result plus the non-durable `performanceStateDelta`. Ordinary sessions carry `status: "not-requested"` and no delta. Experiment analyzers receive the final frozen foundation analysis but do not own the canonical PL14 state/frontier result.

Session summary v8 adds only compact:

```text
performanceMeasurementSummary
```

No full current-state record, warm-up window trace, warm-up evidence ring, or frontier-point ring is copied into a session summary.

The completed-session commit API now accepts:

```text
commitCompletedPracticeSession({
  sessionSummary,
  skillEvidenceDeltas,
  abilityObservation,
  performanceStateDelta,
  reviewItemChanges,
  updatedProfileSummary,
  clearCheckpoint
})
```

The delta is validated and merged only after the duplicate-session guard and inside the existing atomic transaction. A valid typing session can still complete when an auxiliary frontier callback fails: PL14 records `measurement-failed`, omits the performance-state update, and preserves otherwise valid PL8–PL13 evidence. Invariant corruption remains a hard failure.

No PL14 state/frontier model rebuild runs per keypress. State and warm-up analysis run at finalization; the frontier model rebuilds only when a bounded frontier batch is committed or explicitly requested.
''',
}

for rel, section in sections.items():
    path = root / rel
    text = path.read_text()
    marker = section.strip().splitlines()[0]
    if marker not in text:
        path.write_text(text.rstrip() + section + "\n")

for rel in ["scripts/pl14_docs_apply.py", ".github/workflows/pl14-docs-apply.yml"]:
    path = root / rel
    if path.exists():
        path.unlink()

print("PL14 required documentation integrations applied")
