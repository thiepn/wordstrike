# Practice Lab Error Analyzer and Correction/Recovery Model

Status: PL9 generic foundation analysis  
Practice database structural version: 2 (unchanged)  
Session-summary record version: 4  
Checkpoint record version: 2 (unchanged)  
Foundation-analysis version: 2  
Event-trace semantics version: 3  
Error analyzer version: 1  
Alignment-policy version: 1  
Recovery-policy version: 1  
Error-tracker version: 1

## 1. Purpose

PL9 is the generic error/recovery measurement layer. It does not create a Practice mode or recommendation system. Its job is to describe observable typing errors as bounded **error episodes**, classify their local edit structure/content, measure correction and repair behavior, and expose compact session evidence for later phases.

PL8 answers whether comparable transition timing looks fluent, disfluent, interrupted, or excluded. PL9 answers what observable typing error occurred, how correction proceeded, and how forward typing resumed.

A raw incorrect-character count remains for compatibility, but is no longer sufficient error evidence. Two incorrect positions can be one adjacent transposition episode, and one episode can require many correction actions.

## 2. Canonical error episode

An error episode begins on the first accepted incorrect insertion when no existing unresolved episode owns the mismatch region. It ends when:

1. the wrong active state has been repaired and ordinary forward typing resumes;
2. the session finalizes while the mismatch remains unresolved; or
3. bounded-analysis limits are reached and the episode is degraded safely.

The episode is session-local and transient. Its integer `episodeId` is deterministic within the session and is not persisted in `errorSummary`.

## 3. Structural edit classes

Every finalized episode receives exactly one primary structural class:

- `substitution`
- `insertion`
- `omission`
- `transposition`
- `compound`
- `unknown`

These describe a bounded minimal observed edit structure. They do not infer cognitive intent.

`compound` is used when more than one simple operation is needed or a later post-correction error expands the episode beyond a single simple explanation. `unknown` is used when evidence is unavailable, bounded, or cannot be classified without unjustified certainty.

## 4. Content classes

Every episode also receives one orthogonal primary content class:

- `letter`
- `capitalization`
- `punctuation`
- `whitespace-boundary`
- `numeric`
- `symbol`
- `mixed`
- `unknown`

The classifier uses Unicode property categories rather than an ASCII-only punctuation list. Capitalization is conservative: expected/entered values must be letters, differ in case, and match under safe case folding.

## 5. Classification confidence

Episode-level edit confidence is one of:

- `high`
- `medium`
- `low`
- `unresolved`

It represents ambiguity in the bounded edit explanation, not a probability. A timing-boundary crossing lowers confidence where appropriate. Oversized episodes are `unresolved`.

The persisted session-level classification evidence status is separately one of `none`, `low`, `medium`, or `high` and depends on episode quantity plus unresolved/bounded/coverage quality.

## 6. Bounded edit alignment

`practiceErrorAlignment.js` implements a deterministic Optimal String Alignment / bounded Damerau-Levenshtein-style dynamic program supporting:

- insertion;
- omission/deletion;
- substitution;
- adjacent transposition.

The canonical v1 engineering policy is:

```text
maximumEpisodeEvents                 64
maximumAlignmentGraphemes            48
maximumEditDistanceForSimpleClass     3
recentEpisodeSamples                 64
recoverySampleCap                    64
resumeFluentLookaheadTransitions      8
```

These are engineering limits, not scientific constants.

The aligner never receives whole-session text. If expected or observed local alignment material exceeds 48 graphemes, it returns bounded `unknown / unresolved` without allocating an unbounded matrix.

## 7. Determinism and ambiguity

Equal inputs and policy produce the same distance, operation script, class, and confidence. The deterministic operation preference is:

```text
match
transposition
substitution
omission
insertion
```

That ordering is only a stable implementation tie-break. If multiple minimum scripts materially change semantic error interpretation, PL9 lowers confidence or uses `compound` rather than claiming arbitrary high certainty.

## 8. Adjacent transposition

A local reversal such as:

```text
expected: th
observed: ht
```

is represented as one transposition edit with cost one where the bounded alignment supports it. It is not automatically counted as two substitutions or as a cascade.

## 9. Doubling

Doubling remains a secondary pattern flag, not a seventh structural class.

Example:

```text
expected: letter
observed: lettter
```

may be:

```text
editClass: insertion
isDoubling: true
```

## 10. Conservative cascade signal

An episode increments `cascadeEpisodeCount` only when:

- more than one independent erroneous insertion occurred;
- final structural class is `compound` or `unknown`;
- the evidence is not adequately described as one transposition or simple doubling.

This avoids calling every multi-character mismatch a cascade.

## 11. Event-trace cursor metadata

PL9 event-trace semantics are version 3.

Every newly recorded insertion/correction event includes bounded:

```text
cursorBefore
cursorAfter
```

Accepted insertion normally has `cursorAfter = cursorBefore + 1`.

State-changing corrections additionally record:

```text
removedCount
removedIncorrectCount
removedCorrectCount
removedStartPosition
correctionPolicy
```

No removed text is duplicated into the correction event.

## 12. Attempt reconstruction

`reconstructPracticeTypingAttempts(events)` rebuilds a transient virtual attempt stack from chronological `eventIndex` and cursor movement.

Insertion pushes one attempt. Correction removes the cursor range. Multiple attempts at the same text position are valid and remain distinct by event order.

Impossible cursor sequences fail/degrade explicitly. Examples include a correction moving the cursor forward or removing more attempts than exist. The analyzer does not silently continue with corrupted reconstruction state.

Historical PL8 insertion events missing cursor fields can be inferred conservatively from `textPosition`; new PL9 live events always write explicit cursor fields.

## 13. Correction semantics

Backspace and word-delete can participate in the same active episode. Several Backspaces used to repair one mismatch are several correction actions but still one error episode.

Correct-text deletion with no active incorrect episode is tracked separately as non-error correction behavior and does not create a fake error episode.

Ignored and disabled correction attempts remain separate counters when the engine records them reliably. They do not create fake removed characters or mark an error repaired.

## 14. Correction initiation latency

PL9 does not infer subjective awareness. It measures observable **Correction Initiation Latency**:

```text
correctionInitiationMs =
  first state-changing correction active timestamp
  - error start active timestamp
```

Because timestamps use active session time, paused wall-clock duration is excluded.

## 15. Correction distance

`correctionDistanceChars` is the number of accepted insertions **after the initial erroneous insertion and before the first state-changing correction**.

It is descriptive continuation distance, not a claim about cognitive detection distance.

## 16. Removal and over-deletion

For episode-associated repair actions PL9 records:

```text
charactersRemoved
incorrectCharactersRemoved
correctCharactersRemoved
```

Every removed active attempt is classified, so:

```text
incorrectCharactersRemoved + correctCharactersRemoved
= charactersRemoved
```

Over-deletion is directly observable correct text removed while repairing:

```text
overDeletionRate = correctCharactersRemoved / charactersRemoved
```

If no episode-associated characters were removed, the rate is `null`.

These PL9 episode aggregates are separate from the existing legacy whole-session correction metrics. PL9 does not redefine `correctionCostMs`, `charactersRemoved`, `correctedIncorrectCharacters`, or `deletedCorrectCharacters` in the metrics collector.

## 17. Repair completion

The first deletion is not repair completion.

An episode reaches repair completion only when the active incorrect state owned by that episode is gone and the cursor/typed state has been rebuilt through the affected forward region. A subsequent unrelated error can reopen/extend the affected episode until forward recovery is established.

At session finalization, an episode with a restored region but no later forward insertion is still a corrected episode; its forward-resumption timing remains unavailable.

## 18. Observable recovery timings

PL9 defines these durations exactly:

```text
correctionToRepairMs = repairCompleteActiveMs - firstCorrectionActiveMs
errorToRepairMs      = repairCompleteActiveMs - errorStartActiveMs
```

`retypingDurationMs` is transient episode detail from the last state-changing correction action until repair completion. It is not persisted as a canonical session field in v1.

These are observed durations. They are not counterfactual time loss and are not called Recovery Debt.

## 19. Forward resumption

After repair, PL9 distinguishes repair completion from continued forward typing.

```text
repairToResumeMs =
  first subsequent ordinary forward insertion active timestamp
  - repairCompleteActiveMs
```

If the content/session ends before another ordinary forward insertion, it is `null`, not zero.

PL9 also consumes PL8 transient timing classification:

```text
resumeToFluentMs =
  first later PL8-fluent insertion active timestamp
  - repairCompleteActiveMs
```

Only the first fluent transition within the configured eight-transition lookahead is used. If none exists, the result is `null`.

PL8 never imports PL9; dependency direction remains latency → recovery enrichment.

## 20. Streaming error tracker

A bounded `createPracticeErrorTracker()` runs during normal input handling. Per input it performs only bounded local state updates:

- cursor/current incorrect-state tracking;
- active episode updates;
- fixed counters;
- bounded local episode material;
- bounded recovery sample rings.

Full edit alignment is performed only when an episode closes or finalization requests a snapshot. It is not recomputed on every key.

The tracker retains:

- one active episode;
- fixed aggregate counters;
- fixed structural/content count objects;
- recent episode ring capped at 64;
- recovery sample arrays capped at 64.

Memory therefore remains bounded independently of session length.

## 21. Complete-session aggregates vs retained trace

The streaming tracker owns canonical whole-session counts when it has continuous PL9 coverage:

```text
errorEpisodeCount
correctedEpisodeCount
uncorrectedEpisodeCount
structuralCounts
contentCounts
doublingEpisodeCount
cascadeEpisodeCount
correctionAttemptCount
charactersRemoved
incorrectCharactersRemoved
correctCharactersRemoved
```

The retained event trace is secondary. It supports reconstruction diagnostics and PL8 `resumeToFluentMs` enrichment for recent episodes. It never replaces or double-counts streaming totals.

## 22. Coverage

Persisted `errorSummary.coverage` contains:

```text
aggregateScope: complete-session | retained-window | post-restore
traceScope: complete-session | retained-window
retainedEventCount
totalEventCount
traceTruncated
activeEpisodeTruncatedCount
```

A long session can therefore report complete streaming episode counts while honestly reporting that the richer raw trace covers only a retained window.

A legacy checkpoint restored without PL9 tracker state uses `post-restore` aggregate scope. Typing state remains valid; PL9 simply refuses to invent pre-restore episode classifications.

## 23. Checkpoint behavior

Checkpoint record version remains 2. The existing extensible `metricsSnapshot` now carries one bounded `errorTrackerSnapshot` containing aggregate counters, bounded recent samples, and at most one bounded active episode.

The tracker snapshot is bound to content hash and cursor position. On restore it is reused only when those anchors match and the tracker version is supported. Otherwise the auxiliary tracker is discarded safely and a fresh `post-restore` analysis boundary is started.

No historical checkpoint schema migration is needed because the checkpoint record itself did not change shape at its top-level version boundary. Historical v2 checkpoints without tracker state remain valid.

## 24. Foundation analysis v2

Canonical generic foundation analysis is now:

```text
foundationAnalysis = {
  version: 2,
  latency,
  errors
}
```

Finalization semantics are:

1. finalize bounded streaming error state;
2. run the unchanged PL8 latency analyzer;
3. analyze/reconcile PL9 error/recovery evidence;
4. freeze foundation analysis;
5. pass it to optional experiment analysis.

`foundationAnalysis.errors` may contain transient recent episode diagnostics. Only its compact `sessionSummary` becomes durable `errorSummary`.

## 25. Session-summary schema

`sessionSummary` advances from record version 3 to 4 and adds nullable generic:

```text
errorSummary
```

The v1 compact summary contains versions, coverage, episode outcomes, fixed structural/content counts, doubling/cascade counts, correction/removal aggregates, over-deletion rate, robust recovery medians, corrected episode rate, episodes per 1000 accepted insertions, and bounded classification confidence.

It contains no per-episode event arrays or wrong strings.

## 26. Rates and nullability

```text
correctedEpisodeRate = correctedEpisodeCount / errorEpisodeCount
```

With zero episodes, it is `null`.

```text
episodesPer1000Insertions =
  1000 * errorEpisodeCount / acceptedInsertions
```

When there are no accepted insertions, it is `null`.

A session with no errors has no correction-efficiency evidence; PL9 does not fabricate a 100% score.

## 27. Historical migration

Migration is sequential:

```text
sessionSummary v3
  -> v4
  -> errorSummary: null
```

Older summaries still follow the existing chain:

```text
v1 -> v2 -> v3 -> v4
```

PL9 never reconstructs historical transpositions, omissions, correction initiation, or repair timing from old `incorrectCharacterCount` / `correctedErrorCount` fields. Those aggregates do not preserve the sequence required for honest episode analysis.

## 28. Privacy

Raw timing/error evidence is transient. Durable session summaries do not add:

- raw typing traces;
- classified event traces;
- full wrong strings;
- expected passages;
- custom-text excerpts;
- episode histories;
- edit scripts.

Correction events do not duplicate removed text. The bounded active checkpoint episode may contain only the minimal local grapheme material required to resume an in-progress error analysis; it is not a historical trace and is capped by policy.

## 29. Compatibility

PL9 does not remove or redefine existing:

- `incorrectInsertions`;
- `correctedIncorrectCharacters`;
- `deletedCorrectCharacters`;
- `correctionInputs`;
- metrics-collector `charactersRemoved`;
- `correctionCostMs`;
- `uncorrectedErrors`;
- `accuracy`;
- `wpm` / `rawWpm`;
- PL8 fluency/disfluency classification.

`incorrectCharacterCount` and PL9 `errorEpisodeCount` intentionally remain different dimensions.

## 30. Non-goals

PL9 does not implement:

- real-world target error opportunity rates;
- contextual latency residuals;
- typability/context normalization;
- persistent per-entity error phenotypes;
- Recovery Debt;
- Clean WPM;
- correction-efficiency composite scores;
- slow/hesitant/inaccurate limiter labels;
- weakness ranking;
- ability estimation;
- target prioritization;
- Accuracy Control or Recovery UI/modes;
- Daily Coach recommendations;
- adaptive target selection;
- public Practice release.

## 31. Future phase contract

PL10 may combine PL8/PL9 evidence with contextual expected latency without changing historical classifier versions. PL11 may aggregate error/fluency evidence per `profile -> context -> entity`. PL12 may combine frequency, opportunity, timing, recovery burden, and goals into limiter/weakness interpretation.

Those phases consume PL9 episode evidence. They must not collapse it back into one undifferentiated incorrect-character count.
