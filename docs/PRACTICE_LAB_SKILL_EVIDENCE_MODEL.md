# Practice Lab PL11 — Contextual Skill Aggregation & Evidence Model

## Status

PL11 is the canonical long-term observation layer for Practice Lab. It consumes PL8 fluency classification, PL9 error/recovery facts, and PL10 context-normalized timing, then accumulates bounded evidence by the immutable PL5 identity:

```text
profileId + contextId + entityType + entityKey
```

PL11 answers **what was observed and how much evidence exists**. It does not decide whether an entity is weak, important, mastered, or worth training next.

Current versions:

| Contract | Version |
| --- | ---: |
| Practice IndexedDB structural version | 2 |
| skillStat | 3 |
| sessionSummary | 6 |
| checkpoint | 3 |
| foundationAnalysis | 4 |
| skill evidence schema | 1 |
| skill evidence policy | 1 |
| skill evidence delta | 1 |
| evidence confidence | 1 |
| skill evidence tracker snapshot | 1 |

## Evidence versus judgment

PL11 owns observation. PL12 owns limiter/weakness interpretation, PL15 owns mastery, PL16 owns trends/learning curves, and PL17 owns review semantics. Therefore PL11 preserves but does not update `weaknessScore`, `priority`, `masteryState`, `recentTrend`, `successfulReviewCount`, or `failedReviewCount`.

A high evidence confidence score means WordStrike has broad/repeated evidence. It does **not** mean the user is highly skilled.

## Supported entity identity

PL11 creates canonical evidence for:

- `key`
- `bigram`
- `trigram`
- `word`

Keys and n-grams use expected Practice graphemes. Bigrams and trigrams are raw adjacent sequences and may cross word boundaries. Words use the canonical PL7 `lexicalKey`, so surface capitalization does not split lexical identity. PL11 does not stem or merge morphology.

Historical v2 pattern entities remain migratable for data preservation, but PL11 v1 does not create new evidence deltas for them.

## First-pass opportunity semantics

An **opportunity** is one first encounter with an expected unit during the session. Correction retries never create new opportunities.

The streaming tracker uses the sequential cursor property. It keeps `maxFirstAttemptCursor` and classifies an accepted insertion at position `p` as first attempt when `p >= maxFirstAttemptCursor`; after admission it advances the boundary to `p + 1`. Revisiting an earlier position after Backspace is therefore not a new first encounter.

### Key

A first attempt at expected position `p` creates one opportunity for `expected[p]`. The first insertion determines `correctCount` versus `errorCount` permanently for first-pass accuracy.

### Bigram

For `p >= 1`, the same first attempt creates one opportunity for `expected[p-1] + expected[p]`. Correctness is the terminal first attempt at `p`; both characters are not rechecked.

### Trigram

For `p >= 2`, the same first attempt creates one opportunity for `expected[p-2] + expected[p-1] + expected[p]`, again using terminal first-attempt correctness.

### Word

A canonical word occurrence creates one word opportunity. It is correct only when every position in that word was correct on its first attempt. A later repair cannot convert a first-pass word error into a correct first-pass word.

## Direct versus incidental evidence

An entity is `directTargeted` only when it exactly matches one canonical session `targetEntity`. Targeting a bigram does not automatically target its component keys or containing word.

All naturally encountered but non-target entities are `incidental`. Incidental evidence is retained. `lastPractisedAt` advances only for a directly targeted entity that actually received an eligible opportunity; `lastObservedAt` advances whenever valid evidence is merged.

Direct target slots are reserved before incidental admission so a late direct target cannot be crowded out by earlier incidental entities.

## Observation diversity and breadth

Persistent observation metadata tracks:

```text
sessionCount
completedSessionCount
abandonedSessionCount
dayCount
targetedSessionCount
breadthEvidencePoints
firstObservedAt
lastObservedAt
lastObservedDayKey
```

A stat increments `sessionCount` at most once per committed session regardless of observation volume. `dayCount` increases only when the chronological live path advances to a new local day key. An out-of-order old day never decrements or corrupts the count; PL11 does not attempt exact historical distinct-day reconstruction.

Within one entity/session, contextual breadth is the number of distinct coarse PL10 variants using only:

```text
structuralClass
wordPositionClass
geometryClass
wordFrequencyBand
bigramFrequencyBand
```

Exact entity identity, containing words, and content positions are excluded. The v1 breadth contribution is capped at **8 points per entity per session**.

## Timing evidence

PL11 does not redefine PL8 timing. Canonical persistent timing requires a first-attempt event with valid PL8/PL10 timing continuity. Retries, post-correction insertions, segment starts, interruptions, and invalid timing boundaries do not enter canonical entity timing.

Each timing lane stores:

```text
eligibleCount
fluentCount
disfluentCount
fluentLatency
fluentResidual
disfluentResidual
completeTraceSessionCount
retainedWindowSessionCount
```

`eligibleCount == fluentCount + disfluentCount`.

### Fluent raw latency

`fluentLatency` stores raw observed milliseconds only for correct first-attempt PL8 `fluent` transitions.

### Fluent residual

`fluentResidual` stores `observedLatencyMs - expectedLatencyMs` for correct first-attempt PL8 `fluent` transitions that PL10 could normalize. Negative residuals are valid and mean faster than expected under the PL10 model.

### Disfluent residual

`disfluentResidual` is separate. It stores normalized residuals for correct first-attempt PL8 `disfluent` transitions when PL10 supplied a finite expected value. It is never merged into the fluent residual mean.

### Word launch versus internal execution

For a `word` entity, the transition into the first grapheme is stored in `launchTiming`; transitions ending on later graphemes belong to normal word `timing`. A one-grapheme word can therefore have launch evidence and zero internal execution transitions. Non-word entities use `launchTiming: null`.

## Welford aggregates and recent sample rings

Raw latency and residual streams use stable Welford-compatible aggregates:

```text
count
meanMs
m2
minMs
maxMs
recentSamples
```

The empty convention is `count=0`, `meanMs=0`, `m2=0`, `minMs=null`, `maxMs=null`, `recentSamples=[]`.

Two aggregates merge with the canonical Welford combination equation rather than reconstructing from rounded session means. Recent medians/MAD are derived later from `recentSamples`; they are not duplicated persistent fields.

Overall recent rings hold at most **64** values. A single session contributes at most **8** samples to each timing stream, chosen deterministically across the chronological range with approximately even positions. Role lanes keep at most **16** recent fluent residual samples and accept at most **4** from one session.

## Primary error attribution

PL9 exposes bounded compact closed-episode facts through `drainClosedEpisodes()` plus a final preview for an active episode. PL11 never reads PL9 private tracker state and never persists surrounding text.

Each error episode has one deterministic primary attribution position. Normal substitution/insertion/omission/compound/unknown episodes use PL9 primary position. A high/medium-confidence adjacent transposition uses the second expected position so the ending bigram is the transposed expected pair.

From one position PL11 attributes the episode at most once to:

```text
1 key
1 ending bigram
1 ending trigram
1 containing word
```

This multi-level evidence is intentional, but primary attribution is observational: **the episode occurred at this entity context**. It is not a causal claim that every attributed entity caused the error.

Error evidence contains fixed structural counts, corrected/uncorrected counts, Welford correction-initiation/error-to-repair timing, and `correctCharactersRemovedCount`. PL11 does not calculate Recovery Debt.

## Evidence roles

Canonical roles are:

```text
training
transfer
benchmark
diagnostic
custom
unclassified
```

Trusted static PL6/PL7/PL10 content maps its validated partition to the corresponding role. Custom Text maps to `custom`. Generated/unknown content maps to `unclassified` unless a future validated content-use contract establishes another role.

`transfer` and `benchmark` cannot be spoofed by arbitrary experiment configuration. Protected roles require static content identity/hash/corpus binding and the PL6 content-use guard. Role is resolved/frozen for the session and checkpoint snapshots retain that role across restore.

Each role lane is intentionally compact: opportunity/accuracy counts, timing counts, fluent residual Welford state plus bounded samples, primary episode count, session count, and last observation time. Overall opportunity count equals the sum of role opportunity counts.

## Custom Text privacy

Default PL11 policy allows local Custom Text evidence for keys, bigrams, and trigrams but disables persistent `word` skill entities. This avoids building a secondary durable word index of private names, notes, secrets, medical terms, or accidentally pasted credentials.

Skill stats and checkpoint evidence snapshots do not persist:

- full Custom Text;
- sentence excerpts;
- lists of containing words;
- content-family history;
- raw event traces;
- growing session-ID histories.

A future explicit opt-in can change word-level Custom Text learning under a new contract; PL11 v1 does not.

## Evidence deltas

Finalization creates at most one immutable delta for each `(profileId, contextId, entityType, entityKey, sessionId)`. A delta contains exactly one session's evidence and one frozen evidence role. Duplicate stat IDs, mixed session/profile/context identities, invalid stat IDs, mixed roles, zero-evidence deltas, and oversized batches are rejected.

The transient generic foundation becomes:

```text
foundationAnalysis v4
  latency
  errors
  normalization
  skills
    summary
    deltas
```

Only the compact `skillEvidenceSummary` is persisted in `sessionSummary v6`; entity deltas are not stored inside the session summary.

## Atomic repository merge and idempotency

Experiment analyzers no longer own canonical full skill-stat replacement. Non-empty `updatedSkillStats` is rejected by the canonical commit API. The session engine passes `skillEvidenceDeltas` created by foundation analysis.

Inside one atomic transaction the repository:

1. validates context ownership;
2. checks the session-summary ID boundary;
3. returns idempotent success immediately for an identical existing summary;
4. rejects a conflicting duplicate session ID;
5. loads/migrates or creates each skill stat;
6. merges each delta with `mergePracticeSkillEvidence`;
7. validates the merged v3 stat;
8. applies review/profile writes;
9. writes the session summary;
10. clears the checkpoint and updates reconciliation metadata.

Any failed delta rolls back the whole transaction. Duplicate-session detection occurs before evidence application, so retrying an already committed session cannot apply skill evidence twice. Skill stats do not need unbounded per-stat applied-session ID lists.

## skillStat v3 and migration

Canonical v3 replaces old top-level attempt/latency accumulators with `evidenceVersion`, `evidence`, evidence confidence, observation timestamps, and optional `legacyEvidenceV2`.

A pristine/default v2 record migrates with `legacyEvidenceV2: null`. A non-empty v2 record preserves its fixed old raw accumulator shape under `legacyEvidenceV2`, but canonical v3 evidence remains empty and confidence starts at `0 / none`.

This is deliberate: v2 counters did not have PL11 first-pass opportunity semantics, role evidence, context breadth, or PL10 residual attribution. Reinterpreting them as canonical v3 evidence would fabricate information. Legacy evidence never drives v3 confidence.

Historical `sessionSummary v5 -> v6` adds `skillEvidenceSummary: null`. Historical `checkpoint v2 -> v3` adds `skillEvidenceTrackerSnapshot: null`.

## Confidence policy v1

Confidence is a versioned engineering policy, not a probability of weakness.

For entity-specific quantity `n`:

```text
Q = 1 - exp(-n / Se)
S = 1 - exp(-sessions / 3)
D = 1 - exp(-days / 3)
B = 1 - exp(-breadthPoints / 12)

Confidence = 100 * (0.45 Q + 0.25 S + 0.15 D + 0.15 B)
```

Quantity scales `Se`:

| Entity | Scale |
| --- | ---: |
| key | 80 |
| bigram | 50 |
| trigram | 35 |
| word | 15 |
| future/default | 30 |

Levels:

```text
0          none
>0..<50    low
50..<80    medium
80..100    high
```

Dimension-specific confidence is derived on demand for `general`, `accuracy`, `fluent-timing`, `normalized-residual`, `disfluency`, `errors`, and `word-launch`. Only general confidence is persisted.

## Admission and record bounds

Per-session v1 entity admission limits are:

```text
key       512
bigram   1500
trigram  2000
word     2000
```

Direct targets are reserved/admitted ahead of incidental entities. Existing admitted entities continue accumulating after a cap is reached. Rejected new incidental observations set truncation metadata and increment omitted-observation diagnostics. Direct target counts exceeding a type cap fail setup instead of being silently discarded.

A skill stat is capped at **64 KiB** serialized size. The fixed six-role enum and bounded sample rings keep the schema finite. Existing global retention caps remain unchanged.

Low-confidence pruning uses canonical v3 confidence and deterministic tie-breakers. At equal confidence, purely incidental evidence is pruned before evidence with targeted sessions where practical. Review-linked entities remain protected by current repository integrity rules.

## Checkpoint continuity

`checkpoint v3` carries `skillEvidenceTrackerSnapshot v1` inside metrics state. The snapshot contains the first-attempt cursor boundary, current word first-pass state, bounded admitted entity aggregates, frozen evidence role, truncation flags, and the last processed closed-episode boundary.

The configured snapshot cap is **1024 entities**. Compaction order is deterministic: direct targets, entities with errors, highest opportunity count, then entity type/key. A compacted snapshot marks checkpoint evidence truncated; restored evidence cannot claim complete-session accuracy for omitted data.

A historical v2 checkpoint or any checkpoint without a PL11 tracker restores the typing session but starts canonical PL11 evidence at the current cursor with `partial-session` accuracy scope. A valid new v3 snapshot continues complete-session opportunity coverage and avoids duplicate first-pass opportunities across pause/restore.

Appending content rebuilds the position/entity resolver for the extended text without resetting accumulated evidence or `maxFirstAttemptCursor`.

## Session status eligibility

Completed sessions are eligible. Meaningful abandoned sessions also contribute their valid observations and increment `abandonedSessionCount`, preventing survivor bias. Existing meaningful-activity thresholds remain authoritative. Tiny abandoned sessions are not committed. Interrupted resumable sessions do not create permanent skill evidence until restored/finalized. Invalid sessions never update skills.

## Integration contracts

PL12 consumes first-pass accuracy, fluent residuals, disfluency, primary error evidence, confidence, and role lanes to classify slow/hesitant/inaccurate/unstable evidence and estimate impact. PL12 must not reinterpret raw event traces.

PL15 uses role separation to distinguish training success from transfer/retention success. PL16 can derive learning curves from bounded recent samples plus session/day/timestamp evidence without PL11 calculating `recentTrend`. PL17 combines evidence confidence with mastery/retention/decay for review scheduling.

## Explicit non-goals

PL11 does not implement weakness classification, real-world impact, low-frequency target de-prioritization, explanatory hierarchy suppression, slow/hesitant/inaccurate/unstable labels, mastery, automaticity, review scheduling, ability estimates, plateau detection, target priority, Learning Value, Daily Coach, treatment personalization, or public Skill Map UI.

The canonical long-term chain is:

```text
expected content
  -> first-pass opportunity
  -> PL8 fluent/disfluent
  -> PL9 error/recovery
  -> PL10 expected-vs-observed residual
  -> PL11 persistent entity evidence
  -> profile + context + entity
```
