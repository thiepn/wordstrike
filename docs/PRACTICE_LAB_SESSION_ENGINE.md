# Practice Lab Session Engine

Status: headless Practice foundation + PL5 context identity + PL8 robust latency + PL9 error/recovery + PL10 context/typability normalization

## 1. Scope

The modules in **js/practiceLab/** provide a framework-independent typing-session engine for future Practice experiments. They implement lifecycle, content/input contracts, typing state, Practice-only compatibility metrics, bounded events, checkpointing/restoration, generic foundation analysis, completion, abandonment, interruption, subscriptions, and diagnostics.

No public Practice route, recommendation system, mastery model, review scheduler, ability estimator, or target prioritizer is implemented here.

## 2. Protected boundaries

The engine imports Practice contracts and a repository interface. It never directly accesses IndexedDB, localStorage, DOM, Supabase, authentication, leaderboards, ranked Typing records, or WORDSTRIKE saves. **js/main.js** does not import the heavy Practice runtime.

Before an engine is created, the caller resolves one valid **profileId + contextId** pair. Both are immutable session identity and propagate through snapshots, checkpoints, foundation/experiment analysis, summaries, and atomic completion.

## 3. Current module map

| Module | Responsibility |
| --- | --- |
| practiceSessionConstants.js | States, transitions, limits, event-trace version, errors |
| practiceSessionContract.js | Experiment, content, input, configuration, segmentation |
| practiceInputEngine.js | Mutable renderer-independent typing state |
| practiceMetrics.js | Legacy-compatible Practice metrics/observations |
| practiceEventBuffer.js | Bounded in-memory detailed event trace + content-free coverage metadata |
| practiceLatencyClassifier.js | PL8 robust session-local latency analysis |
| practiceErrorPolicy.js | PL9 versions, enums, bounded engineering policy |
| practiceErrorAlignment.js | Bounded deterministic local edit alignment |
| practiceErrorTracker.js | Bounded streaming whole-session error episode aggregation |
| practiceErrorAnalyzer.js | PL9 episode/content/reconstruction/session analysis |
| practiceRecoveryAnalyzer.js | Recovery medians + PL8 fluent-resumption enrichment |
| practiceFoundationAnalysis.js | Generic PL8 + PL9 + PL10 analysis orchestration |
| practiceContextFeatures.js / practiceContextNormalizer.js | PL10 coarse transition context + residual normalization |
| practiceTextDifficultyFeatures.js / practiceTypabilityModel.js | PL10 text features + relative typability model |
| practiceNormalizationAnalysis.js | PL10 session normalization orchestration |
| practiceCheckpoint.js | Checkpoint builder and restore validation |
| practiceSessionResult.js | Canonical current summary/profile construction |
| practiceSessionEngine.js | Lifecycle, timing, streaming analysis, checkpoint and completion orchestration |

## 4. Lifecycle

~~~text
created -> ready -> active <-> paused
                    |          |
                    +--> completed
                    +--> abandoned
                    +--> interrupted

ready -------> abandoned
ready -------> destroyed
terminal ----> destroyed
~~~

**PRACTICE_SESSION_TRANSITIONS** is authoritative. Invalid transitions throw a structured Practice session error. Repeated safe operations remain idempotent.

## 5. Public API

**createPracticeSessionEngine()** requires a repository plus resolved **profileId** and **contextId**. It exposes prepare, start, handleInput, pause, resume, visibility handling, content append, tick, checkpoint flush, complete, abandon, interrupt, destroy, immutable snapshots/metrics/trace/observations/diagnostics, and subscription.

**restorePracticeSessionEngine()** validates and restores one checkpoint into a new engine. Clocks, scheduling, repository, logging, checkpoint policy, and segmentation remain injectable.

## 6. Experiment contract

Experiment descriptors are runtime-only objects containing stable ID/version, session schema version, correction behavior, supported completion modes, resumability and optional callbacks.

Optional `analyzeResult()` receives generic frozen foundation analysis but does not own the canonical generic `fluencySummary`, `errorSummary`, or `normalizationSummary`. Callbacks are never persisted.

## 7. Content/input model

A Practice content plan is immutable versioned text plus grapheme-indexed units, target entities, completion policy, metadata and content hash. Content, duration, word-count and manual completion are supported.

Normalized input types are:

- `character`
- `space`
- `backspace`
- `word-delete`

The engine consumes normalized values/timestamps and never reads browser keyboard events directly.

## 8. Unicode segmentation

Canonical Practice segmentation uses `Intl.Segmenter` in grapheme mode where available, with a surrogate-safe fallback. PL7 and PL9 reuse the same segmentation contract so target indexing, typing positions and bounded edit alignment do not silently disagree about grapheme boundaries.

## 9. Typing state and correction policies

Typing state stores expected graphemes, accepted attempts, cursor/current units, error positions and corrected-error history without DOM references.

- **allow** removes one grapheme or the preceding whitespace-delimited word.
- **ignore** records/consumes the correction input without changing typed state.
- **disabled** rejects the correction without typed-state mutation.

PL9 observes those existing semantics; it does not create a different typing interaction model.

## 10. Compatibility metrics remain unchanged

PL8/PL9 do not remove or silently redefine existing metrics including:

- raw WPM;
- correct WPM;
- event accuracy;
- incorrect insertions;
- corrected incorrect characters;
- deleted correct characters;
- correction inputs;
- metrics-collector characters removed;
- `correctionCostMs`;
- uncorrected errors;
- word-start delays;
- legacy coefficient-of-variation consistency.

PL8/PL9 add generic interpretation alongside them.

## 11. Timing model and PL8 timing segments

Injected monotonic time drives active/paused duration and input timing. Wall time drives UTC/local date context and wall duration. Paused time is excluded from active time.

Every PL8/PL9 input event carries deterministic `timingSegmentId`. Ordinary pause/resume and checkpoint restore start fresh comparable timing segments. Correction activity remains in the same segment but creates a separate post-correction boundary for latency interpretation.

A 2,000+ ms insertion transition is an interruption classification; it does not itself mutate the timing segment.

## 12. Event-trace semantics v3

PL9 advances internal event-tail semantics to version 3. Newly recorded insertion/correction events retain the existing minimal fields and add explicit:

```text
cursorBefore
cursorAfter
```

Insertion normally moves one position. Correction events additionally record bounded structural metadata:

```text
removedCount
removedIncorrectCount
removedCorrectCount
removedStartPosition
correctionPolicy
```

Correction events do **not** duplicate the removed text. Earlier insertion attempts already carry the transient expected/entered graphemes needed for local reconstruction.

`eventIndex` remains monotonically increasing and is the canonical attempt identity; repeated attempts at the same `textPosition` are valid.

## 13. Event-buffer limit and coverage

**createPracticeEventBuffer()** still retains at most 20,000 detailed events. `getMetadata()` returns only:

```text
capacity
retainedEventCount
totalEventCount
truncated
```

No expected/entered text appears in metadata. Traces are immutable copies, in-memory only, and cleared during destroy.

PL8/PL9 explicitly distinguish `complete-session` from `retained-window` trace scope rather than pretending an overflowed trace covers the whole session.

## 14. PL8 latency foundation

At finalization PL8 uses median/MAD plus a versioned adaptive session threshold to classify comparable insertion timing into:

```text
fluent
disfluent
interruption
excluded
```

It remains finalization-only rather than sorting the trace on each key. PL9 does not change PL8 threshold/count semantics.

See **PRACTICE_LAB_LATENCY_CLASSIFICATION.md**.

## 15. PL9 streaming error tracker

PL9 adds a bounded `createPracticeErrorTracker()` to normal input handling. Each input performs only bounded/local updates:

- cursor/current wrong-state update;
- active episode update;
- fixed counters;
- bounded local episode material;
- capped recovery samples.

The tracker keeps one active episode, fixed aggregate objects, a recent episode ring capped at 64 and recovery sample arrays capped at 64. It does not accumulate full session history.

Local edit alignment runs when an episode closes or at session finalization, not on every accepted character.

## 16. Error episodes

An error episode starts on an accepted incorrect insertion when no unresolved episode owns that mismatch region. It may include additional insertions, corrections, over-deletion and retyping.

PL9 classifies each finalized episode into one structural class:

```text
substitution
insertion
omission
transposition
compound
unknown
```

and one orthogonal content class:

```text
letter
capitalization
punctuation
whitespace-boundary
numeric
symbol
mixed
unknown
```

Adjacent transposition can therefore be one episode even though legacy incorrect-character count is two.

See **PRACTICE_LAB_ERROR_RECOVERY_MODEL.md**.

## 17. Observable correction/recovery timing

PL9 uses active timestamps and precise observable names:

```text
correctionInitiationMs = first state-changing correction - error start
correctionDistanceChars = accepted insertions after initial error before correction
correctionToRepairMs = repair complete - first correction
aerrorToRepairMs = repair complete - error start
repairToResumeMs = next ordinary forward insertion - repair complete
resumeToFluentMs = first later PL8-fluent transition - repair complete
```

(`aerrorToRepairMs` above is the formula for the canonical field **errorToRepairMs**; the persisted field name has no prefix.)

At content end, forward-resumption metrics are `null`. These durations are observed windows, not Recovery Debt/counterfactual time loss.

## 18. Checkpoint cadence

Defaults remain 15 seconds minimum, 50 accepted insertions threshold, one timeout and no interval. Meaningful changes mark state dirty; writes coalesce. Pause, hidden visibility, interruption and explicit flush force resumable state where applicable.

## 19. Checkpoint payload and PL9 tracker state

Checkpoint record version remains **2**. Its already-extensible `metricsSnapshot` now includes one bounded `errorTrackerSnapshot` alongside the bounded recent event tail and event-trace coverage metadata.

The error tracker snapshot contains aggregate counters, capped recovery samples and at most one bounded active episode. It is bound to content hash and cursor position and contains no full historical error trace.

Checkpoint top-level record version did not need to change because the new state fits safely inside the existing bounded extensible metrics snapshot contract.

## 20. Restoration

Restore validates schema/expiry/profile/context/experiment/content identity and resumability. It reconstructs typing state, aggregate metrics and the recent tail, then begins a fresh PL8 timing segment.

For PL9:

- a valid tracker snapshot is restored only when tracker version, content hash and cursor anchors match;
- otherwise the auxiliary tracker is discarded without invalidating the typing session;
- a historical checkpoint with no tracker state begins a fresh `post-restore` error-analysis coverage boundary;
- no pre-restore error phenotype is invented from missing raw attempts.

An active restored episode is marked as crossing a timing boundary so recovery/classification confidence can be reduced appropriately.

## 21. Generic foundation analysis v2

Canonical current foundation analysis is:

```text
foundationAnalysis = {
  version: 2,
  latency,
  errors
}
```

PL8 latency analysis is computed first. PL9 then consumes the streaming tracker snapshot, retained trace metadata and transient PL8 classifications for recovery enrichment. The complete object is deeply frozen before optional experiment analysis.

`foundationAnalysis.errors` may contain transient recent episode diagnostics. Only `foundationAnalysis.errors.sessionSummary` is eligible for durable generic persistence.

## 22. Experiment analysis hook

Optional `experiment.analyzeResult()` still receives:

```text
sessionSnapshot
metricsSnapshot
eventTrace
observations
foundationAnalysis
```

All are frozen/cloned according to Practice conventions. Experiment output may consume PL8/PL9 evidence but cannot override canonical generic `fluencySummary` or `errorSummary` because the session-result builder sources those fields only from foundation analysis.

Analyzer failure remains a structured recoverable `PRACTICE_SESSION_ANALYSIS_FAILED` boundary and blocks a half-built commit.

## 23. Session result construction

Current `sessionSummary` record version is **4**.

**buildPracticeSessionResult()** persists immutable profile/context/session identity, content descriptor, dates/durations, legacy-compatible metrics, targets, canonical PL8 `fluencySummary`, canonical PL9 `errorSummary`, and bounded experiment-specific result fields.

It never persists raw/classified traces, recent error episodes, edit scripts, full wrong strings or custom-text excerpts.

## 24. PL9 errorSummary ownership

The compact generic `errorSummary` contains:

- version/policy identifiers;
- coverage;
- episode outcome counts;
- fixed structural/content count objects;
- doubling/cascade counts;
- correction/removal counts;
- over-deletion rate;
- recovery medians;
- corrected episode rate;
- episodes per 1000 accepted insertions;
- bounded evidence confidence.

Streaming tracker totals own whole-session counts when aggregate coverage is complete. Retained trace enrichment never double-counts those episodes.

## 25. Atomic completion

~~~text
lock finalization
 -> freeze active timing
 -> await checkpoint write
 -> finalize bounded streaming error tracker
 -> PL8 latency analysis
 -> PL9 error/recovery analysis + trace enrichment
 -> freeze foundationAnalysis v2
 -> optional experiment analysis
 -> build + validate v4 session summary/profile update
 -> repository.commitCompletedPracticeSession()
 -> transaction clears checkpoint
 -> enter terminal state
 -> emit once
~~~

The repository still enforces profile/context ownership for every atomic record change.

## 26. Analysis failure and retry

Foundation-analysis or experiment-analysis failures do not commit garbage. The engine preserves/refreshes resumable state where possible and returns a structured recoverable analysis error. Completion retry remains explicit and idempotent.

## 27. Abandonment/interruption/destruction

Abandonment thresholds and profile accounting are unchanged. Interruption freezes timing and checkpoints resumable state without creating a session summary. Destroy cancels scheduled work, waits for safe in-flight work, emits once, clears subscribers/events/content references and is idempotent.

Neither PL8 nor PL9 introduces a hidden background task or storage writer.

## 28. Diagnostics

`getDiagnostics()` remains bounded and content-free. In addition to lifecycle/timing/checkpoint/event-buffer data it may expose PL9 episode count and whether one active error episode exists.

It excludes expected/entered passages, custom text, raw event arrays, episode histories, authentication and storage secrets.

## 29. Persistence/version matrix

Current Practice persistence after PL9:

| Contract | Version |
| --- | ---: |
| IndexedDB structural version | 2 |
| Profile record | 3 |
| Context record | 1 |
| Skill-stat record | 2 |
| Session-summary record | 4 |
| Review-item record | 2 |
| Checkpoint record | 2 |
| Foundation analysis | 2 |
| Event-trace semantics | 3 |
| PL8 latency classifier/policy | 1 / 1 |
| PL9 error analyzer/alignment/recovery | 1 / 1 / 1 |

PL9 changes no IndexedDB stores or indexes.

## 30. Historical migrations

PL8 historical summaries still migrate honestly with `fluencySummary: null` when raw timing evidence is unavailable.

PL9 adds sequential:

```text
sessionSummary v3 -> v4
errorSummary: null
```

Earlier summaries therefore follow `v1 -> v2 -> v3 -> v4`. Old aggregate incorrect/corrected counts cannot reconstruct transpositions, omissions, correction initiation or repair timing, so PL9 does not fabricate them.

Checkpoint remains v2; historical v2 checkpoints simply lack PL9 tracker state and restore with a fresh analysis continuity boundary.

## 31. Testing strategy

The suite covers:

- lifecycle and normalized input;
- WPM/accuracy/legacy correction metric regressions;
- PL8 robust latency behavior;
- PL9 deterministic edit alignment;
- Unicode content classes;
- doubling/transposition/cascade semantics;
- cursor reconstruction failure handling;
- single/multi correction repairs;
- word-delete over-deletion;
- correction initiation/distance/repair timings;
- forward resumption and PL8 fluent resumption;
- uncorrected/content-end episodes;
- bounded active episodes;
- complete streaming counts beyond 20,000 retained events;
- no streaming/trace double count;
- checkpoint tracker restore + legacy restore;
- session v3 -> v4 migration;
- durable-summary privacy/size;
- import side-effect isolation;
- full WordStrike regressions.

## 32. Known limitations / later phases

PL9 intentionally does not implement target opportunity-normalized errors, contextual latency residuals, typability, per-entity persistent error phenotype, Recovery Debt, Clean WPM, correction-efficiency composite scores, limiter labels, weakness ranking, ability estimation, target prioritization, Accuracy Control, Daily Coach, adaptive drills or public Practice UI.

PL10 may add contextual expected-latency modeling; PL11 may persist contextual entity evidence; PL12 may interpret limiter phenotypes. Those systems consume PL8/PL9 evidence rather than replacing the foundational measurement contracts.

## PL10 normalization extension

At `prepare()`, the engine resolves and freezes the exact PL5 context record for the immutable session `profileId + contextId`. At finalization, generic **foundationAnalysis v3** is built as `{ latency, errors, normalization }`. PL10 consumes the current content plan plus frozen context and uses PL8 fluent/disfluent classifications without altering PL8 or PL9 outputs.

`sessionSummary` is now v5 and may contain compact **normalizationSummary**. WPM, raw WPM, accuracy, correction metrics, PL8 fluency and PL9 error/recovery formulas are unchanged. Full normalized transitions and text feature vectors remain transient. See **PRACTICE_LAB_CONTEXT_TYPABILITY_MODEL.md**.
