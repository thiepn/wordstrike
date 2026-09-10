# Practice Lab PL19 — Full Assessment

Status: PL19 structured assessment battery

## 1. Purpose

PL19 is the first Practice Lab phase that orchestrates the measurement infrastructure built across PL8–PL18 into one coherent assessment. It does not replace latency, error, normalization, skill evidence, limiter, ability, mastery, learning, retention, benchmark, or transfer systems.

The assessment answers what was measured, what the evidence currently suggests, how confident that evidence is, which limitations appear most important, and what remains unknown. It deliberately does **not** produce a universal typing score, grade, or rank.

## 2. Assessment depths

V1 uses one prefix-compatible ordered protocol:

| Depth | Blocks | Typing-time target |
| --- | ---: | ---: |
| Quick | 1–3 | 240 s (~4 min) |
| Standard | 1–6 | 480 s (~8 min) |
| Deep | 1–10 | 720 s (~12 min) |

Deep is recommended only when it is fully available. If Deep is unavailable, Standard becomes recommended; if Standard is unavailable, Quick becomes recommended. An explicit shorter choice is never escalated.

## 3. Assessment is optional

Full Assessment is recommended but never gates Practice modes, later training, Skill Map, Custom Text, or future Coach use. Completing Quick is a legitimate completed assessment; it is not a failed Deep assessment.

## 4. Prefix-compatible protocol

The canonical sequence is:

1. `benchmark-natural` — 60 s
2. `diagnostic-core-keys` — 90 s
3. `diagnostic-word-launch` — 90 s
4. `diagnostic-combinations` — 120 s
5. `diagnostic-punctuation-capitals` — 60 s
6. `diagnostic-numbers-symbols` — 60 s
7. `diagnostic-lexical-extended` — 60 s
8. `diagnostic-combinations-extended` — 60 s
9. `diagnostic-mixed` — 60 s
10. `cold-transfer` — 60 s

Standard is exactly Quick plus blocks 4–6. Deep is exactly Standard plus blocks 7–10.

## 5. Version envelope

PL19 advances only the structural/session/foundation wrapper required by Full Assessment:

```text
Practice DB                         6 -> 7
assessmentRun recordVersion              1
sessionSummary                     11 -> 12
foundationAnalysis                  9 -> 10
assessment protocol version              1
assessment policy version                1
assessment plan version                  1
assessment blueprint version             1
diagnostic form version                  1
diagnostic match policy version          1
assessment analysis version              1
assessment block delta version           1
assessment report version                1
```

Existing PL8–PL18 model formulas remain authoritative.

## 6. Parent/child architecture

A Full Assessment is a multi-session parent orchestration. The parent is an `assessmentRun`; each timed block is an ordinary Practice child session with a trusted assessment binding.

PL19 does not model the battery as one giant session because benchmark, fixed diagnostic, and cold-transfer blocks have different trusted measurement semantics.

## 7. `assessmentRuns`

DB7 adds one store:

```text
assessmentRuns
keyPath: assessmentRunId
```

Indexes:

- `profileId`
- `contextId`
- `status`
- `depth`
- `startedAt`
- `completedAt`
- compound `profileStatus = [profileId, status]`

There is at most one `created` or `active` run per profile, across all contexts.

## 8. Run lifecycle

Canonical lifecycle:

```text
created
active
completed
abandoned
expired
invalid
```

Report integrity is separate:

```text
standard
nonstandard
partial
invalid
```

A run has a two-hour maximum wall span. Expiry is reconciled by comparison on query; no timer is required.

## 9. Frozen plan

The immutable `PracticeAssessmentPlan` is created before Block 1. Its hash binds:

- run identity;
- language;
- depth;
- protocol/plan versions;
- block order/durations/kinds;
- fixed diagnostic form IDs;
- benchmark reservation/artifact identity;
- Deep transfer reservation/artifact identity.

The top-level plan stores IDs and bindings, not protected or diagnostic text.

## 10. Anti-adaptivity rule

Plan creation accepts profile/context/language/depth, artifact versions, assessment-history exposure counts, and PL18 reservation services. It does not read:

```text
skillStats
PL12 limiter snapshot
PL15 mastery
PL16 learning state/saturation
PL17 review queue
```

A weakness detected in an early block cannot change later assessment text, diagnostic variants, benchmark form, or transfer unit.

## 11. Target-free assessment sessions

Every assessment child uses:

```text
targetEntities: []
```

This includes diagnostic blocks. Diagnostic content may cover fixed user-independent blueprint categories, but it is not personalized target training.

Consequences:

- PL11 diagnostics enter the `diagnostic` evidence lane;
- `lastPractisedAt` is not falsely advanced by assessment diagnostics;
- benchmark and diagnostics contribute zero PL16 acquisition dose.

## 12. Internal child descriptors

PL19 defines trusted internal-only descriptors:

```text
full-assessment-benchmark
full-assessment-diagnostic
full-assessment-transfer
```

They are not normal experiment cards and cannot launch independently. A valid object-bound `PracticeAssessmentBlockBinding` must match the live parent run, context, current block, plan version/hash, ordinal, and expected descriptor.

## 13. Benchmark child

`full-assessment-benchmark` declares:

```text
evaluationMeasurementKind = benchmark
abilityChannel = cold-natural-text
resumable = false
```

A fresh PL18-eligible benchmark may therefore produce exactly one canonical PL13 cold-natural ability observation.

## 14. Diagnostic child

`full-assessment-diagnostic` declares no PL18 protected evaluation, PL13 ability, PL14 performance, or PL17 retention role. Its fixed diagnostic content enters PL11 through a trusted object-bound assessment diagnostic role, not through mutable metadata.

## 15. Transfer child

`full-assessment-transfer` declares:

```text
evaluationMeasurementKind = cold-transfer
abilityChannel = null
resumable = false
```

Deep transfer can update eligible PL11 transfer evidence and PL16 transfer observations. It does not add a second correlated PL13 cold-natural ability observation.

## 16. Benchmark and transfer precommitment

The benchmark form is reserved during plan creation. For Deep, the cold-transfer unit is also reserved during plan creation, before Block 1 starts.

Reservation is not revelation. At the protected block start PL19 calls PL18 claim first, recording exposure and creating the immutable protected binding, and only then loads protected text.

If a claimed protected block later fails to load or complete, the exposure remains consumed and that parent block becomes invalid. PL19 does not automatically retry or resample protected content inside the same run.

## 17. Diagnostic blueprint

English v1 blueprint categories cover:

- core alphabetic keys;
- word launch and lexical breadth;
- representative fixed bigram/trigram combinations;
- punctuation and capitalization;
- digits and a bounded common-symbol set;
- extended lexical breadth;
- extended combinations;
- mixed natural diagnostic text.

The blueprint is WordStrike-authored engineering policy, not a claim about population frequency.

## 18. Diagnostic form build

`scripts/buildPracticeAssessmentDiagnostics.mjs` is deterministic and binds the diagnostic artifact to:

- PL6 corpus ID/version/checksum;
- PL7 index checksum;
- PL10 typability model/reference/checksum;
- assessment blueprint version;
- diagnostic matching policy version.

The builder accepts diagnostic-partition approved content only. It does not use user data.

## 19. Variant matching

Target design is four variants per diagnostic block with minimum two ready variants. V1 matching gates within a block set are:

```text
difficultyIndex spread <= 0.50
relative percentile spread <= 15
length within +/-10% of median
weighted RMS feature distance <= 0.75
```

Blocks are not matched to each other because they intentionally measure different content features.

## 20. Capacity sizing

Ready forms must support the full timed block under a 400-WPM engineering capacity assumption with 10% buffer:

```text
60 s  -> 2200 graphemes
90 s  -> 3300 graphemes
120 s -> 4400 graphemes
```

This is only capacity sizing, not a claim about maximum human typing speed.

## 21. Current diagnostic readiness

The current English diagnostic partition contains only two approved 15-grapheme probes from one family, 30 total graphemes. It cannot satisfy the smallest 2200-grapheme capacity floor, a–z coverage, lexical breadth, combinations, punctuation, digits/symbols, or the minimum two matched variants.

Therefore `data/practice/assessment/en-v1/diagnostic-forms-v1.manifest.json` is intentionally `draft` with zero ready form sets. PL19 does not create unnatural repeated probe strings merely to make the UI appear runnable.

## 22. Current depth availability

The PL18 English benchmark suite and cold-transfer pool also remain draft under their existing release gates. Combined with the draft diagnostic artifact, current English availability is:

```text
Quick     unavailable
Standard  unavailable
Deep      unavailable
recommendedDepth = null
```

The dev-gated detail UI shows the reasons rather than silently falling back or fabricating content. Other languages are unavailable until real language-specific artifacts exist.

## 23. Child integrity

All v1 child blocks use:

- duration completion;
- expected `time-complete` terminal reason;
- `correctionBehavior = allow`;
- on-first-input timing;
- no live WPM;
- no aggregate live accuracy;
- no rhythm coaching/metronome;
- no target hints/adaptive prompts;
- no append content;
- no child resume.

Pause, visibility-hidden pause, manual stop, content exhaustion, append attempt, or restore makes the child invalid for assessment. The parent may continue later blocks, but the final report becomes partial.

## 24. Foundation and session linkage

`foundationAnalysis.version = 10` adds an explicit `assessment` component. Ordinary sessions receive:

```text
assessment.status = not-requested
assessmentBlockDelta = null
```

`sessionSummary.version = 12` adds compact `assessmentBinding`:

```text
assessmentRunId
blockId
blockOrdinal
protocolVersion
```

Historical v11 summaries migrate with `assessmentBinding = null`. Historical sessions are not retroactively certified as Full Assessment blocks.

## 25. Atomic block commit

An assessment child commit includes `assessmentRuns` in the same canonical IndexedDB transaction as its session summary and allowed evidence updates.

A valid child cannot commit while the parent remains `pending`. Duplicate session idempotency is checked first and the block delta cannot apply twice. Run/block/context/session/ordinal mismatches fail closed.

Assessment children cannot update PL14 performance state or PL17 retention-review state.

## 26. Report model

The persisted report is bounded and rebuildable from one assessment run plus current context model snapshots. It does not scan the entire session history.

Sections:

1. Natural Text
2. Accuracy & Control
3. Diagnostic Coverage
4. Main Limiters
5. Transfer
6. Measurement Coverage

There is **no universal overall assessment score**.

## 27. Control aggregates

Standardized control metrics are aggregated from diagnostic blocks only. First-pass accuracy uses summed PL11 counts:

```text
sum(firstPassCorrect) / sum(firstPassOpportunity)
```

Disfluency uses summed eligible transition counts. Correction/error rates use summed numerators and explicit denominators. Undefined zero-denominator values remain `null`, never fabricated zero or NaN.

## 28. Limiter, ability, and mastery snapshots

At finalization PL19 stores compact historical snapshots:

- up to eight PL12 limiter summaries, with up to five in the primary results view;
- one compact PL13 `cold-natural-text` ability snapshot;
- PL15 mastery-stage distribution counts;
- optional PL15 automaticity distribution counts.

PL19 does not assign mastery stages and does not prescribe treatment.

## 29. Transfer reporting

Deep may report descriptive cold-transfer WPM, adjusted WPM, accuracy, freshness/integrity, and count of valid post-hoc transfer-evidence entities.

A benchmark-to-transfer adjusted-WPM delta may be shown only as `descriptive`. PL18 forms are not empirically equated, so PL19 does not call it an equated transfer gap or infer target-specific transfer from the global passage delta.

## 30. Measurement coverage and unknowns

The report explicitly inventories measured, partial, not-measured, and unavailable capabilities. PL19 does not pretend to measure canonical:

```text
Controlled WPM
Burst WPM
Common-word ability
Endurance WPM
```

Those remain `not-measured` until their dedicated later protocols exist. Punctuation/capitalization and numbers/symbols are diagnostic evidence, not dedicated stable ability channels.

## 31. Profile and context state

The first valid complete assessment sets profile-level `firstAssessmentCompleted` and `firstAssessmentCompletedAt` once. Later valid complete assessments update `lastAssessmentAt` without overwriting the first-completion timestamp.

Canonical assessment history is `assessmentRuns`, not profile cache fields. Context-specific state derives from runs for the active context:

```text
never-started
incomplete
complete
stale
```

V1 freshness is 30 days. A context change does not inherit another context's completed state.

## 32. Finalization and idempotency

Finalization persists report, run completion state/timestamps, and profile first/last assessment metadata transactionally. Equivalent finalization retries return idempotent success. A materially different report for the same finalized run fails.

The report is rebuildable from durable child block summaries and current bounded PL12/PL13/PL15 snapshots; no transient raw event array is required.

## 33. Retention and pruning

Assessment runs are capped at 50 per profile. Pruning never removes:

- active runs;
- the first valid complete assessment per context;
- the latest valid complete assessment per context.

Performance does not affect pruning priority.

While a run is active, its referenced active/completed child session summaries are passed to the existing session-retention `preserveSessionIds` mechanism. Once the run is no longer active, old child summaries are eligible for ordinary bounded retention because the parent report stores the compact audit information needed later.

## 34. Privacy

Assessment runs/reports/plans contain IDs, compact aggregates, counts, timestamps, hashes, reservations, and model summaries. They do not persist:

- protected benchmark text;
- protected transfer text;
- diagnostic passages;
- raw typing traces;
- mistyped strings;
- custom text.

Full Assessment v1 cannot use Custom Text, user-supplied assessment text, or research-holdout content.

## 35. Comparison

`comparePracticeAssessmentRuns()` requires the same context and compatible protocol for direct change comparison. Different depths compare only overlapping prefix blocks/capabilities.

Benchmark comparison delegates to PL18. Ability comparison delegates to PL13 where compatible historical compact estimates exist. Diagnostic comparison covers first-pass accuracy, disfluency, correction cost, and blueprint coverage.

No helper emits a global `Overall improved by X%` verdict; PL16 remains the trajectory layer.

## 36. Dev-gated product UI

PL19 keeps the existing Practice feature gate as the sole public gate. It adds a minimal internal Full Assessment view with:

- Quick ~4 min;
- Standard ~8 min;
- Deep ~12 min, recommended only when fully available;
- disabled reasons;
- neutral `Block X of N` progress;
- no intermediate weakness interpretation;
- results sections for Natural Text, Accuracy & Control, Diagnostic Coverage, Main Limiters, Transfer, and Measurement Coverage;
- visible partial/nonstandard integrity limitations.

PL19 does not expose Practice publicly, add authentication, leaderboards, Supabase, or network analytics.

## 37. Non-goals

PL19 does not implement:

- Combination Repair;
- Weak Keys training;
- Problem Words;
- Accuracy/Recovery mode;
- Real Text training mode;
- Pace Ladder;
- Burst Sprints;
- Common Words mode;
- Endurance training;
- Daily Coach;
- treatment selection/personalization;
- public Assessment release;
- empirically equated benchmark forms;
- population percentile norms.

## 38. Downstream contracts

PL20 Combination Repair, PL21 Weak Keys, PL22 Problem Words, PL23 Accuracy/Recovery, and PL24 Real Text will consume the same canonical post-assessment evidence without PL19 preselecting an intervention.

PL25 Daily Coach may later use assessment age/depth/coverage plus limiter, ability, mastery, learning, and review state as inputs. Assessment age is informational and does not become a hard prerequisite unless a future explicit policy changes that rule.

## PL30 dedicated Check boundary

PL19 Full Assessment retains its own fixed battery. Its punctuation/numbers blocks do not substitute for PL30 dedicated ability Checks and receive no historical PL30 ability backfill.
