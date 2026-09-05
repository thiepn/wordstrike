# Practice Lab Session Engine

Status: current through PL11 contextual skill evidence

## 1. Scope

The modules in `js/practiceLab/` provide the framework-independent Practice typing-session runtime. The engine owns lifecycle, immutable session identity, normalized input handling, timing, bounded event/error tracking, PL8 latency classification, PL9 error/recovery analysis, PL10 context/typability normalization, PL11 contextual skill evidence collection, checkpoint/restore continuity, session finalization, and atomic repository commit orchestration.

PL11 remains an observation layer. The session engine does not implement weakness ranking, limiter interpretation, mastery, trends, review scheduling, target prioritization, Coach logic, ability estimation, public Practice UI, leaderboard behavior, auth, or cloud sync.

## 2. Canonical identity

A session is created with one resolved `profileId + contextId`. Both are immutable for the lifetime of the engine and propagate through snapshots, checkpoints, foundation analysis, skill evidence deltas, session summaries, and repository commits.

Changing the profile's active context after `prepare()` does not relabel an in-flight session. Restore resolves the checkpoint's exact context and never substitutes the current active context.

## 3. Current version matrix

| Contract | Version |
| --- | ---: |
| IndexedDB structural version | 2 |
| profile | 3 |
| context | 1 |
| skillStat | 3 |
| sessionSummary | 6 |
| reviewItem | 2 |
| checkpoint | 3 |
| foundationAnalysis | 4 |
| event trace semantics | 3 |
| PL8 latency classifier/policy | 1 / 1 |
| PL9 error analyzer/alignment/recovery | 1 / 1 / 1 |
| PL10 normalization analysis/model | 1 / 1 |
| PL11 skill evidence/policy/delta | 1 / 1 / 1 |
| PL11 evidence confidence | 1 |
| PL11 tracker snapshot | 1 |

Database, record, experiment, content-generator, analysis, and policy versions are independent contracts. PL11 changes record schemas but does not require an IndexedDB structural-version bump.

## 4. Module responsibilities

| Module | Responsibility |
| --- | --- |
| `practiceSessionContract.js` | Experiment/content/input/configuration contracts and grapheme segmentation |
| `practiceInputEngine.js` | Mutable renderer-independent typing state and corrections |
| `practiceMetrics.js` | Existing Practice WPM/accuracy/correction metrics |
| `practiceEventBuffer.js` | Bounded detailed in-memory event trace and trace-coverage metadata |
| `practiceLatencyClassifier.js` | PL8 robust session-local latency classification |
| `practiceErrorTracker.js` | PL9 bounded streaming error episode state and closed-episode drain |
| `practiceErrorAnalyzer.js` / `practiceRecoveryAnalyzer.js` | PL9 structural/content error and recovery analysis |
| `practiceContextFeatures.js` / `practiceContextNormalizer.js` | PL10 transition context and normalized timing residuals |
| `practiceTextDifficultyFeatures.js` / `practiceTypabilityModel.js` | PL10 text/context difficulty model |
| `practiceEntityResolver.js` | PL11 direct position → key/bigram/trigram/word attribution |
| `practiceOpportunityTracker.js` | PL11 first-attempt cursor/opportunity continuity |
| `practiceSkillEvidenceCollector.js` | PL11 bounded streaming per-entity evidence aggregation |
| `practiceSkillEvidenceDelta.js` | Immutable one-session delta contract and batch validation |
| `practiceSkillEvidenceMerge.js` | Canonical immutable skillStat v3 evidence merge |
| `practiceEvidenceConfidence.js` | Versioned evidence-confidence policy |
| `practiceEvidenceRole.js` | Protected training/transfer/benchmark/diagnostic/custom role resolution |
| `practiceCheckpoint.js` | Checkpoint v3 construction and restore validation |
| `practiceFoundationAnalysis.js` | PL8 + PL9 + PL10 + PL11 orchestration |
| `practiceSessionResult.js` | Canonical sessionSummary v6/profile update construction |
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

`PRACTICE_SESSION_TRANSITIONS` is authoritative. Invalid transitions fail with structured Practice session errors. Repeated terminal completion calls are idempotent through the existing finalization lock/result cache.

## 6. Input and typing state

The engine consumes normalized `character`, `space`, `backspace`, and `word-delete` inputs. It never reads browser keyboard events directly. Canonical segmentation is grapheme-based and shared with PL7/PL9/PL11 attribution so target positions, typing positions, error episodes, and evidence entity resolution use one indexing contract.

Correction behavior remains owned by the existing input engine. PL11 does not reinterpret a corrected retry as a second opportunity.

## 7. Timing and bounded traces

Injected monotonic time drives performance timing. Wall time drives UTC/local-day context. Paused time remains excluded from active time.

Event traces remain bounded to the configured PL8/PL9 session capacity and are never durable evidence. Event metadata records only capacity, retained count, total count, and truncation state. Raw expected/entered text is not persisted in the session summary or skill stat.

PL8 classifies comparable insertion transitions as `fluent`, `disfluent`, `interruption`, or `excluded`. PL10 may attach a finite expected-latency model and residual. PL11 consumes those outputs; it does not redefine them.

## 8. PL9 error episodes and PL11 consumption boundary

PL9 owns streaming error episodes. PL11 consumes only bounded compact closed-episode facts through the public drain/preview boundary. It does not reach into PL9 private tracker history.

Each closed episode receives one deterministic primary attribution position. PL11 maps that position directly to at most one key, ending bigram, ending trigram, and containing word. Adjacent transposition uses the expected ending bigram when PL9 supplies sufficient confidence. This is observational attribution, not a causal diagnosis.

## 9. PL11 first-pass opportunity semantics

The evidence tracker keeps a monotonic `maxFirstAttemptCursor`. An accepted insertion at position `p` is a first encounter only when it reaches the not-yet-seen frontier. Revisiting an earlier position after correction is a retry and cannot increment first-pass opportunity counts.

One first encounter may contribute to:

- one expected key;
- one ending bigram when available;
- one ending trigram when available;
- one containing canonical word.

A word is first-pass correct only if every position in that word was correct on its first encounter. Repairing the word later does not rewrite first-pass accuracy.

## 10. Evidence roles and Custom Text privacy

At `prepare()`, PL11 resolves and freezes one evidence role:

```text
training
transfer
benchmark
diagnostic
custom
unclassified
```

Protected roles require trusted content provenance and cannot be spoofed by arbitrary experiment configuration. The frozen role is included in the PL11 tracker checkpoint so restore cannot relabel prior evidence.

Default Custom Text behavior permits durable key/bigram/trigram motor evidence but suppresses word skill entities. This prevents a secondary durable index of private pasted words while retaining short-sequence motor evidence.

## 11. Content append continuity

`appendContent()` extends the immutable content plan and typing state. PL11 rebuilds only the position/entity resolver for the extended plan; it preserves all accumulated evidence, the first-attempt cursor boundary, current first-pass word state, truncation state, and observation state.

Appending content therefore adds future resolvable positions without turning previously seen positions into new opportunities.

## 12. Checkpoint v3

Checkpoint v3 adds a bounded `skillEvidenceTrackerSnapshot` inside `metricsSnapshot`. The snapshot carries:

- tracker/evidence/policy versions;
- frozen evidence role;
- first-attempt frontier and accuracy coverage scope;
- current word first-pass state when needed;
- bounded admitted entity evidence;
- last processed closed-episode boundary;
- omission/truncation flags.

The configured checkpoint entity cap is bounded and deterministic compaction prioritizes direct targets, error-bearing entities, stronger opportunity evidence, then stable entity identity ordering.

Checkpoint persistence remains one checkpoint per profile and uses the checkpoint's immutable `contextId`.

## 13. Restore behavior

Restore validates checkpoint schema, expiry, profile/context, experiment/version, content identity, and resumability before reconstructing the session.

A valid PL11 tracker snapshot resumes first-pass continuity, so corrected retries after reload do not become new opportunities. If a historical checkpoint lacks PL11 tracker state, the typing session can still restore, but PL11 begins at the restored cursor with `partial-session` accuracy coverage. Missing historical evidence is never fabricated.

PL8 timing starts a fresh restore timing boundary as before. PL9 and PL11 each retain their own bounded continuity semantics.

## 14. Foundation analysis v4

Canonical current foundation analysis is deeply frozen before experiment analysis:

```text
foundationAnalysis = {
  version: 4,
  latency,
  errors,
  normalization,
  skills: {
    version: 1,
    policyVersion: 1,
    summary,
    deltas
  }
}
```

`latency` is PL8, `errors` is PL9, `normalization` is PL10, and `skills` is PL11. The PL11 collector finalizes after the error tracker has drained closed episodes and previewed any still-active terminal episode.

## 15. Experiment analysis boundary

Optional `experiment.analyzeResult()` receives immutable session/metrics/event/foundation inputs. It may derive experiment-specific result fields and may consume PL11 evidence, but it does not own canonical generic summaries or skill writes.

In particular, analyzer-provided `updatedSkillStats` is not used as a canonical write path. Repository commit rejects non-empty direct full skill-stat replacement. Canonical skill evidence comes only from `foundationAnalysis.skills.deltas`.

## 16. Session summary v6

`buildPracticeSessionResult()` persists compact durable session evidence:

- immutable profile/context/session identity;
- timestamps/durations and existing typing metrics;
- compact content descriptor and target list;
- PL8 `fluencySummary`;
- PL9 `errorSummary`;
- PL10 `normalizationSummary`;
- PL11 `skillEvidenceSummary`;
- bounded experiment-specific summary fields.

The summary explicitly forbids raw event traces, normalized transition arrays, skill evidence deltas, custom-text excerpts, auth/leaderboard payloads, and other high-volume/private transient data.

Historical v5 summaries migrate to v6 with `skillEvidenceSummary: null`; old summaries are not backfilled from evidence that was never recorded.

## 17. Atomic completion

Current completion is:

```text
lock finalization
 -> freeze active timing
 -> await checkpoint write
 -> drain/finalize PL9 tracker
 -> PL8 latency analysis
 -> PL9 error/recovery analysis
 -> PL10 normalization analysis
 -> PL11 evidence finalization -> compact summary + deltas
 -> freeze foundationAnalysis v4
 -> optional experiment analysis
 -> build + validate sessionSummary v6/profile update
 -> repository.commitCompletedPracticeSession(skillEvidenceDeltas, ...)
 -> atomically merge skillStats + session/review/profile/checkpoint writes
 -> enter terminal state and emit once
```

The repository validates the whole evidence batch against one session/profile/context identity before writing. Each delta is merged into an existing migrated skill stat or a new default v3 record within the same transaction.

## 18. Idempotency and failure safety

An identical existing `sessionId` returns idempotent success before skill deltas are applied. A conflicting duplicate session ID fails. This gives exactly-once evidence application without storing unbounded applied-session-ID histories on each skill stat.

Invalid/mixed evidence, context ownership mismatches, invalid review mutations, or merged-stat validation failures abort the transaction. Analysis failure also blocks commit. Recoverable failures preserve checkpoint behavior where possible.

## 19. Abandonment and interruption

Meaningful abandoned sessions may persist valid observation evidence and are labeled as abandoned in PL11 observation metadata, reducing survivor bias. Existing meaningful-activity thresholds remain authoritative; tiny abandonment does not create skill evidence.

Interrupted resumable sessions do not create permanent skill evidence until they are restored and finalized. Destroy remains idempotent and clears in-memory content/event/evidence references.

## 20. Boundedness and diagnostics

PL11 per-session entity admission is capped by policy; direct target capacity is reserved ahead of incidental admission. Existing admitted entities may continue accumulating after a cap is reached, while omitted new incidental observations set explicit truncation metadata.

`getDiagnostics()` may expose content-free bounded PL11 state such as evidence role, entity counts/coverage, and truncation metadata. It does not expose raw text, raw traces, private Custom Text words, auth secrets, or cloud identifiers.

## 21. Persistence boundaries and later phases

PL11 skill stats contain observation/evidence plus evidence confidence. They deliberately preserve but do not update judgment fields such as `weaknessScore`, `priority`, `masteryState`, `recentTrend`, and review-success counters.

Later phases consume PL11 rather than rewriting its measurement semantics:

- PL12: limiter/weakness interpretation and impact;
- PL15: mastery semantics;
- PL16: trends/learning curves;
- PL17: review semantics.

The detailed PL11 evidence contract is documented in the dedicated PL11 contextual skill aggregation/evidence-model document. PL8, PL9, and PL10 model documents remain authoritative for their respective measurement layers.