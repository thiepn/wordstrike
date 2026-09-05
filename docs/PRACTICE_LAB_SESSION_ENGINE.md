# Practice Lab Session Engine

Status: current through PL13 ability measurement and uncertainty

## 1. Scope

The modules in `js/practiceLab/` provide the framework-independent Practice typing-session runtime. The engine owns lifecycle, immutable session identity, normalized input handling, timing, bounded event/error tracking, PL8 latency classification, PL9 error/recovery analysis, PL10 context/typability normalization, PL11 contextual skill evidence collection, PL13 ability-measurement assessment, checkpoint/restore continuity, session finalization, and atomic repository commit orchestration.

PL12 remains a post-commit derived limiter service and is not part of the keystroke or commit path. PL13 adds a higher-level measurement observation only at finalization after canonical session metrics exist.

The session engine still does not implement mastery, trends, review scheduling, Coach logic, readiness/state interpretation, treatment selection, public Practice UI, leaderboard behavior, auth, or cloud sync.

## 2. Canonical identity

A session is created with one resolved:

```text
profileId + contextId
```

Both are immutable for the engine lifetime and propagate through snapshots, checkpoints, PL10 normalization, PL11 evidence, PL13 ability observation identity, session summaries, and repository commits.

Changing the profile's active context after `prepare()` never relabels the in-flight session. Restore resolves the checkpoint's exact context.

PL13 ability identity adds one trusted channel:

```text
profileId + contextId + abilityChannel
```

but a session can produce at most one ability observation.

## 3. Current version matrix

| Contract | Version |
| --- | ---: |
| IndexedDB structural version | 3 |
| profile | 3 |
| context | 1 |
| skillStat | 3 |
| abilityState | 1 |
| sessionSummary | 7 |
| reviewItem | 2 |
| checkpoint | 3 |
| foundationAnalysis | 5 |
| event trace semantics | 3 |
| PL8 latency classifier / policy | 1 / 1 |
| PL9 error analyzer / alignment / recovery | 1 / 1 / 1 |
| PL10 normalization analysis / model | 1 / 1 |
| PL11 skill evidence / policy / delta | 1 / 1 / 1 |
| PL11 evidence confidence | 1 |
| PL11 tracker snapshot | 1 |
| PL13 ability estimator / policy | 1 / 1 |
| PL13 ability observation / uncertainty | 1 / 1 |

PL13 advances the outer DB/session/foundation contracts while leaving PL8–PL12 model semantics unchanged.

## 4. Module responsibilities

| Module | Responsibility |
| --- | --- |
| `practiceSessionContract.js` | Experiment/content/input/configuration contracts, trusted `abilityChannel`, grapheme segmentation |
| `practiceInputEngine.js` | Mutable renderer-independent typing state and corrections |
| `practiceMetrics.js` | Canonical Practice WPM/accuracy/correction metrics |
| `practiceEventBuffer.js` | Bounded detailed in-memory event trace and trace-coverage metadata |
| `practiceLatencyClassifier.js` | PL8 robust session-local latency classification |
| `practiceErrorTracker.js` | PL9 bounded streaming error episode state |
| `practiceErrorAnalyzer.js` / `practiceRecoveryAnalyzer.js` | PL9 structural/content error and recovery analysis |
| `practiceContextFeatures.js` / `practiceContextNormalizer.js` | PL10 transition context and normalized timing residuals |
| `practiceTextDifficultyFeatures.js` / `practiceTypabilityModel.js` | PL10 text-difficulty model |
| `practiceEntityResolver.js` | PL11 position → key/bigram/trigram/word attribution |
| `practiceOpportunityTracker.js` | PL11 first-attempt opportunity continuity |
| `practiceSkillEvidenceCollector.js` | PL11 bounded streaming entity evidence |
| `practiceSkillEvidenceDelta.js` | Immutable one-session evidence delta |
| `practiceSkillEvidenceMerge.js` | Canonical skillStat v3 merge |
| `practiceEvidenceConfidence.js` | PL11 evidence confidence |
| `practiceEvidenceRole.js` | Trusted training/transfer/benchmark/diagnostic/custom role resolution |
| `practiceAbilityObservation.js` | PL13 protocol eligibility, PL10 difficulty adjustment, measurement uncertainty |
| `practiceAbilityEstimator.js` | PL13 recursive log-WPM latent update and model interval/SRC |
| `practiceCheckpoint.js` | Checkpoint v3 construction and restore validation |
| `practiceFoundationAnalysis.js` | PL8 + PL9 + PL10 + PL11 + PL13 transient orchestration |
| `practiceSessionResult.js` | Canonical sessionSummary v7/profile update construction |
| `practiceSessionEngine.js` | Lifecycle, streaming collection, restore, finalization, commit orchestration |

## 5. Lifecycle

```text
created -> ready -> active <-> paused
                    |          |
                    +--> completed
                    +--> abandoned
                    +--> interrupted

ready -------> abandoned
ready -------> destroyed
terminal ----> destroyed
```

Invalid transitions fail through structured Practice session errors. Repeated terminal completion calls remain protected by the existing finalization lock/result cache.

PL13 ability measurement is stricter than PL11 observational evidence:

- only `completed` sessions may produce an ability observation;
- abandoned sessions never update ability;
- interrupted sessions do not update ability until restored and validly completed;
- invalid sessions never update ability.

## 6. Trusted experiment ability declaration

A registered experiment descriptor has optional:

```text
abilityChannel
```

Canonical default:

```text
null
```

Valid v1 values are:

```text
cold-natural-text
controlled-speed
common-words
burst
endurance
punctuation
numbers-symbols
```

No `overall` channel exists.

`validatePracticeExperimentDescriptor()` rejects unknown channels.

Session/user configuration is forbidden from setting `abilityChannel`; only the trusted registered descriptor establishes measurement intent. This prevents a targeted drill from spoofing a benchmark channel.

Descriptor intent alone does not make the session eligible. The resolved PL11 evidence role and all channel policy conditions must also pass.

## 7. Ability protocol eligibility

All PL13 v1 channels require:

```text
targetEntities.length === 0
correctionBehavior === allow
status === completed
```

Allowed default completion reasons are:

```text
time-complete
content-complete
word-target-complete
```

`manual-stop` does not produce an ability observation.

Channel role/duration/volume/accuracy thresholds are centralized in `practiceAbilityPolicy.js`; arbitrary experiment configuration cannot redefine them.

Ordinary protocol mismatch returns:

```text
not-eligible
```

with bounded reason codes. It does **not** invalidate the typing session or block an otherwise valid session commit.

Experiments with `abilityChannel: null` return:

```text
not-requested
```

and create no observation.

## 8. Input, metrics, and WPM authority

The engine consumes normalized `character`, `space`, `backspace`, and `word-delete` inputs. Browser keyboard events are outside the engine.

Canonical Practice WPM remains owned by the existing metrics layer. PL13 uses final:

```text
summary.wpm
```

as observed performance and never substitutes `rawWpm` for the latent update.

Accuracy is a measurement-validity and uncertainty signal; PL13 does not compute `wpm × accuracy`.

PL13 does not change WPM, raw WPM, accuracy, correction, PL8, PL9, PL10, or PL11 formulas.

## 9. Timing and bounded traces

Injected monotonic time drives performance timing. Wall time drives UTC/local-day context. Paused time remains excluded from active time.

Event traces remain bounded and transient. PL8 classifies comparable transitions; PL10 may attach context-normalized expected latency/residual. PL11 consumes those outputs for entity evidence.

PL13 never reads raw trace content for its latent state. It consumes only final session metrics plus compact PL8/PL10 analysis needed to estimate observation uncertainty/difficulty adjustment.

## 10. PL9 error and PL11 evidence boundary

PL9 owns streaming error episodes. PL11 consumes bounded compact episode facts rather than PL9 private tracker history.

PL13 does not reinterpret error episodes into ability. Their practical correction cost is already reflected substantially in canonical WPM active-time performance, while PL13 uses accuracy/rhythm/interruption/difficulty information only to characterize measurement reliability.

## 11. PL11 first-pass evidence remains independent

PL11 keeps its monotonic first-attempt cursor and entity opportunity rules. Correction retries do not become new first-pass opportunities.

PL13 ability observation is a separate session-level measurement. Ability state is never stored in `skillStats`, and PL11 entity evidence is never duplicated inside an ability state.

## 12. Evidence roles and privacy

PL11 freezes one role at `prepare()`:

```text
training
transfer
benchmark
diagnostic
custom
unclassified
```

PL13 reuses that trusted role for ability eligibility.

`custom` and `unclassified` sessions do not update v1 ability. This prevents ability state from becoming an alternate durable index of private Custom Text.

Default PL11 Custom Text word suppression remains unchanged.

## 13. Content append continuity

`appendContent()` preserves PL11 evidence continuity as before.

PL13 does not maintain an incremental ability estimate while text is being typed. Ability is assessed only once during finalization; therefore content append does not create partial ability updates.

## 14. Checkpoint v3 and restore

Checkpoint v3 remains unchanged by PL13. It continues to preserve typing/PL8/PL9/PL11 continuity as defined by earlier phases.

PL13 does not checkpoint an ability observation or latent state. A resumable interrupted session has no permanent ability update until it is restored and completed under a valid measurement protocol.

## 15. Foundation analysis v5

Canonical final foundation analysis is deeply frozen before experiment-specific analysis:

```text
foundationAnalysis = {
  version: 5,
  latency,        // PL8
  errors,         // PL9
  normalization,  // PL10
  skills,         // PL11
  ability         // PL13
}
```

The PL8–PL11 components retain their existing versions and meanings.

The engine first builds PL8–PL11 foundation evidence, then takes final canonical session metrics and calls the pure PL13 ability observation builder using:

```text
session identity/status/completion reason
canonical wpm/rawWpm/accuracy
active duration / typed character count
trusted experiment descriptor
contentPlan target list
resolved evidence role
PL8 compact latency summary
PL10 text-difficulty metadata
```

The resulting ability assessment is attached immutably to foundation analysis before optional experiment analysis.

For ordinary experiments:

```text
ability.status = not-requested
ability.observation = null
```

A session can contain at most one PL13 ability observation.

## 16. Experiment analysis boundary

Optional `experiment.analyzeResult()` receives immutable session/metrics/event/foundation inputs. It may derive experiment-specific fields but does not own canonical generic summaries, PL11 skill writes, or PL13 ability-state updates.

Canonical ability intent comes only from the trusted descriptor and canonical observation comes only from the PL13 observation builder.

## 17. Session summary v7

`buildPracticeSessionResult()` persists compact durable session evidence:

- immutable profile/context/session identity;
- timestamps/durations and existing typing metrics;
- compact content descriptor and target list;
- PL8 `fluencySummary`;
- PL9 `errorSummary`;
- PL10 `normalizationSummary`;
- PL11 `skillEvidenceSummary`;
- optional PL13 `abilityMeasurementSummary`;
- bounded experiment-specific summary fields.

For no requested ability measurement:

```text
abilityMeasurementSummary = null
```

For requested measurement, the compact field may contain:

```text
analysisVersion
observationVersion
channel
status
reasons
sourceRole
adjustedWpm
measurementSigmaLog
reliabilityWeight
difficultyAdjustmentLog
difficultyModelStatus
```

It records the **measurement assessment**, not the resulting ability state. `newAbilityEstimate` and `abilityObservation` are forbidden persisted summary fields.

Raw event traces, normalized transition arrays, PL11 skill deltas, custom-text excerpts, auth/leaderboard payloads, and other high-volume/private transient data remain forbidden.

Historical v6 summaries migrate to v7 with:

```text
abilityMeasurementSummary: null
```

No historical ability backfill is fabricated.

## 18. Atomic completion

Current completion is conceptually:

```text
lock finalization
 -> freeze active timing
 -> await checkpoint write
 -> finalize PL9 tracker
 -> PL8 latency analysis
 -> PL9 error/recovery analysis
 -> PL10 normalization analysis
 -> PL11 evidence finalization
 -> build PL13 ability assessment from final canonical metrics
 -> freeze foundationAnalysis v5
 -> optional experiment analysis
 -> build + validate sessionSummary v7/profile update
 -> repository.commitCompletedPracticeSession(
      skillEvidenceDeltas,
      abilityObservation | null,
      ...
    )
 -> atomically merge skillStats + optional abilityState
      + session/review/profile/checkpoint/meta writes
 -> enter terminal state and emit once
```

A PL13 ability observation is never applied in a separate post-commit write.

## 19. Ability transaction discipline

Before opening the write transaction, the repository validates any supplied ability observation and verifies its:

```text
sessionId
profileId
contextId
channel
```

against the completed session and compact measurement summary.

Inside the same transaction, and only **after duplicate session detection**, the repository:

1. derives deterministic `abilityStateId` from profile/context/channel;
2. loads the existing state inside the transaction;
3. creates a default unmeasured state when absent;
4. applies `mergePracticeAbilityObservation()`;
5. validates versions, interval/confidence/SRC invariants, evidence counts, privacy and size;
6. writes the merged state.

The state is never read outside the transaction and written later. This matches the concurrency discipline already used for PL11 skill evidence.

If an eligible observation or merged state is invalid, the whole completed-session transaction rolls back.

## 20. Idempotency and failure safety

`sessionId` remains the single exactly-once boundary.

An identical existing completed summary returns idempotent success **before** PL11 skill deltas or PL13 ability observation are applied.

A conflicting duplicate session ID fails without mutating either skill or ability state.

No unbounded applied-session-ID list is stored on ability records.

Ordinary `not-eligible` ability assessment has no observation and therefore does not prevent a normal session commit.

## 21. Abandonment and interruption

Meaningful abandoned sessions may contribute PL11 observational evidence, reducing survivor bias.

They do **not** contribute PL13 ability observations.

Interrupted resumable sessions create no permanent ability update until restored and completed. Navigation/refresh never become valid ability observations.

## 22. Boundedness and diagnostics

PL11 entity admission remains capped as before.

PL13 estimator update is O(1) per eligible completed session and does not load historical session summaries. Ability state keeps only a 32-entry compact recent-observation ring and is capped at 32 KiB serialized size.

Developer diagnostics may eventually expose bounded channel/estimate/model-interval/confidence/SRC metadata. They do not expose raw text or traces.

## 23. Persistence boundaries and later phases

The layers remain intentionally separate:

```text
PL10  context/text difficulty normalization
PL11  persistent entity evidence
PL12  derived limiter/impact interpretation
PL13  context/channel latent ability + uncertainty
```

PL13 ability does not feed back into PL12 limiter results in this phase.

Later phases may consume PL13 without rewriting it:

- PL14: control frontier and temporary state/readiness;
- PL15: mastery semantics;
- PL16: long-term learning trajectories using neutral ability comparisons/model intervals/SRC;
- PL17: review semantics;
- PL18: empirical benchmark/passage calibration may replace PL13's heuristic observation difficulty adjustment;
- PL25: later Coach/Learning Value composition.

The detailed PL13 formulas, channel policy, uncertainty model, estimator, interval/SRC, persistence and privacy contract are documented in `PRACTICE_LAB_ABILITY_ESTIMATION.md`.
