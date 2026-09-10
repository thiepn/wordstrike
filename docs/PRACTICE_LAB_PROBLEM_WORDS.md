# Practice Lab — PL22 Problem Words

PL22 implements the `problem-words` Practice Lab intervention for one canonical PL11 `word` entity at a time. It trains lexical typing execution, not vocabulary recall and not spelling memorization.

The v1 intervention is deliberately stable:

```text
ONE WORD
  ↓
Baseline
  ↓
Focus
  ↓
Context
  ↓
Mix
  ↓
Check
  ↓
PL11 word + incidental lower-level evidence
PL16 word acquisition dose
```

A word is treated as three related execution problems that must remain distinguishable in analysis:

- **word launch** — how the word begins;
- **internal execution** — how its within-word transitions are executed;
- **whole-word first-pass accuracy** — whether every grapheme is correct on its first encounter.

The intervention does not create a second skill, limiter, mastery, or learning model. PL11, PL12, PL15, and PL16 remain canonical owners.

## 1. Versions and persistent envelope

PL22 v1 keeps the PL19 persistent envelope unchanged:

- Practice DB structural version: **7**;
- `sessionSummary`: **12**;
- `foundationAnalysis.version`: **10**;
- Problem Words: **1**;
- experiment: **1**;
- policy: **1**;
- generator: **1**;
- selection: **1**;
- result: **1**.

PL22 adds no IndexedDB stores and requires no generic record migration.

## 2. Canonical lexical identity

The target is exactly one canonical PL7/PL11 lexical entity:

```text
entityType = "word"
```

English v1 target normalization is:

```text
trim → NFC → lowercase
```

A target must contain **2–24 alphabetic English graphemes**. Capitalized manual input is visibly normalized to the lowercase lexical key. Single-letter words, apostrophes, curly apostrophes, hyphens, digits, symbols, whitespace, and words outside the length bound are unsupported in v1.

The target must resolve through the PL7 training word reverse index. PL22 never treats a substring as a word opportunity: for example, target `he` does not match the letters inside `the`.

Lowercase target surfaces are required in the standard v1 intervention. Capitalization/Shift-heavy lexical practice remains outside PL22.

## 3. Target selection

Targets may come from:

```text
recommended
manual
external-plan
```

`external-plan` is reserved for a later Coach integration; it does not change the v1 treatment.

Recommendation selection may consume canonical PL12 word limiter evidence, PL15 word mastery, and PL16 word learning/saturation state. At most eight recommendations are shown.

Preferred candidates have PL12 `confirmed` or `likely` word-level limiter evidence. `possible` candidates are secondary. Relevant phenotypes include:

- launch-limited;
- slow;
- hesitant;
- inaccurate;
- recovery-heavy;
- unstable;
- mixed.

The same v1 treatment is used regardless of phenotype. PL23 may later add a distinct Accuracy/Recovery intervention family.

### Hierarchy handling

PL12 may explain part of a word weakness through constituent keys/bigrams/trigrams. PL22 uses that explanation only to de-emphasize a recommendation where appropriate; it does not rewrite PL12 hierarchy and does not silently switch to Weak Keys or Combination Repair.

An independently weak or launch-limited word is a natural PL22 candidate. A strongly lower-level-explained word remains manually trainable with restrained explanatory copy.

### Mastery and saturation

PL15 remains the mastery owner. Robust/Retained words are not normally recommended but may be selected manually.

PL16 saturation de-emphasizes recommendations. Manual practice remains allowed with an informational diminishing-returns warning. PL22 itself never assigns mastery or saturation.

## 4. Partition and privacy boundary

Every PL22 source record is approved `training` content and every reverse-index/annotation request is made with training purpose.

A Problem Words plan contains:

```text
0 transfer
0 benchmark
0 diagnostic
0 research-holdout
```

content.

There is no protected-content fallback. A sparse target becomes `limited-content` rather than borrowing protected material.

PL22 uses no Custom Text, runtime LLM, third-party API, Supabase, remote analytics, or physical finger telemetry. New pure/runtime modules have no storage/network/timer/listener side effect merely from import.

## 5. One-word fixed dose

Exactly one word is the direct target of a session. Other keys, n-grams, and words may receive normal incidental PL11 evidence, but they receive no direct PL22 acquisition dose.

The fixed v1 phase quotas are:

| Phase | Direct target word opportunities | Cue |
| --- | ---: | --- |
| Baseline (`entry-probe`) | 3 | none |
| Focus | 4 | strong whole-word cue |
| Context | 3 | subtle whole-word cue |
| Mix (`interleave`) | 2 | none |
| Check (`exit-probe`) | 3 | none |
| **Total** | **15** | |

Therefore:

```text
3 + 4 + 3 + 2 + 3 = 15
15 direct target word opportunities = 1.0 PL16 word acquisition dose unit
```

Dose is opportunity/exposure. A wrong first attempt still counts as the one target opportunity; retrying does not create another opportunity.

The immutable plan is built before Start. Poor performance does not expand the dose, a strong Baseline does not skip phases, and the target never changes mid-session.

## 6. Focus phase

Focus deliberately repeats the target without degenerating into adjacent word spam.

The generator uses approved training-derived lexical material and deterministic generated word sequences. The target is separated by varied neutral words; adjacent `target target` repetition is prohibited. Focus uses a strong accessible **whole-word** cue, never per-letter or constituent-bigram cueing.

Generated Focus units cap target opportunities and use varied distractors. The user is practicing how the whole word launches, flows, and completes rather than memorizing a repeated spelling string.

## 7. Context phase

Context places the target into broader approved natural contexts where possible, with a subtle whole-word cue.

The generator prefers multiple content families and varied launch contexts. v1 prefers three target-bearing families and requires two when the corpus supports the hard minimum.

Launch context is kept distinct from internal execution. Context identity may include bounded information about the preceding lexical context and PL10 keyboard geometry when known. Unknown geometry is valid and never blocks a session.

No QWERTY-specific finger or hand assumption is made.

## 8. Mix phase

Mix combines target-bearing and genuinely target-free lexical material with no cue.

Neutral material is verified at lexical identity level: a neutral word sequence contains zero occurrences of the selected lexical target. v1 prefers at least 12 distinct neutral training-derived words and builds deterministic neutral sequences when natural target-free material is insufficient.

Mix is not allowed to collapse into another target-only phase.

## 9. Exact quota composition

Small phase quotas are solved deterministically with exact-sum composition rather than greedy overshoot. Candidate selection hard-requires the exact planned target opportunity count before soft preferences such as family/context diversity or typability are considered.

Candidate pools are bounded and deterministic. Identical inputs and session identity produce the same plan; a new session ID normally rotates content. Plan identity binds target, versions, ordered source/generated identities, phase quotas/boundaries, cue policy, and context identity.

## 10. Matched Baseline and Check probes

Baseline and Check are both target-enriched **training** probes, not transfer tests.

Each contains exactly **3** target word opportunities. The selected pair must preserve:

- entry/exit family disjointness;
- entry/exit content disjointness;
- the same composition mode;
- target-count equality;
- typability difference ≤ **0.35**;
- modeled feature RMS distance ≤ **0.75**;
- launch-context profile total-variation distance ≤ **0.35** where comparable.

Natural probe bundles are preferred. Generated word-sequence probes are permitted when they are composed only from approved training-derived lexical material and satisfy the same safety contract.

Natural probe construction also protects the target from being placed immediately at the edge: policy requires a three-word first-target buffer and two-word trailing buffer where the natural-probe mode is used, with at least five neutral words between target occurrences. Generated probes use at least three neutral words between targets.

If no responsible pair can be constructed, the target is `limited-content`. Matching thresholds are not silently loosened.

## 11. Cue fading and active feedback

The fixed cue sequence is:

```text
Baseline: none
Focus: strong whole-word
Context: subtle whole-word
Mix: none
Check: none
```

Cues are accessible and not color-only. The active exercise does not expose live aggregate WPM, aggregate accuracy, personal-best, leaderboard, metronome, or rhythm-coach feedback. Normal character correctness/correction remains available through the shared Practice engine.

## 12. Session engine contract

PL22 converts its immutable plan into the canonical Practice `contentPlan` and uses one normal Practice session engine for all five phases.

The session is:

```text
one word target
training role
correctionBehavior = allow
resumable = false
completion = content-complete
abilityChannel = null
performanceMeasurementKind = null
retentionMeasurementKind = null
evaluationMeasurementKind = null
assessmentBinding = null
```

Refresh/exit ends the intervention; there is no active-session checkpoint restore for PL22 v1.

The current phase is derived from the cursor and immutable phase boundaries.

## 13. Word metrics

PL22 computes explicit phase-bound Baseline and Check profiles without replacing canonical evidence owners.

### Whole-word first-pass accuracy

A target word is first-pass correct only when every expected target grapheme is correct on its first encounter. Later correction does not retroactively make the word first-pass correct.

### Word launch

Launch timing is the first expected grapheme insertion of the target word. PL22 reads PL10 normalized first-attempt timing/residual evidence and PL8 fluent/disfluent classification for that boundary.

### Internal execution

Internal timing covers target positions from the second grapheme through the end of the word. It uses the same canonical PL10 normalized timing and PL8 classification, kept separate from launch.

### Recovery observations

PL9 remains the error/recovery owner. PL22 may summarize bounded error episodes associated with target-word ranges, such as episode count and available error-to-repair timing; it does not create a second correction model.

### Execution quality

The analyzer reuses the shared execution-quality model:

```text
Accuracy   45%
Speed      40%
Disfluency 15%
```

with at least 0.60 original available-weight coverage. PL22 does not invent an alternate word score.

## 14. Result semantics

The result view reports Baseline and Check information separately for the word and keeps launch/internal/accuracy dimensions visible.

`ImmediateProbeDelta` is the same-session Check execution quality minus Baseline execution quality. Additional deltas may describe first-pass accuracy in percentage points and launch/internal residual changes where evidence coverage supports them.

These are **immediate within-session comparisons** only. They do not prove durable learning, mastery, retention, transfer, or causal treatment effect.

Required interpretation boundary:

> This compares the beginning and end of this practice session. Long-term improvement requires later sessions and transfer evidence.

The Check phase remains target-enriched training evidence and must never be labeled Transfer.

## 15. PL11 integration

The selected word is the sole direct target. Its normal PL11 word evidence, `lastPractisedAt`, direct-target counts, first-pass evidence, timing, and related aggregates update through the generic evidence pipeline.

Constituent keys, bigrams, trigrams, and other words continue to receive their ordinary incidental evidence. PL22 does not mutate PL12 hierarchy directly.

## 16. PL16 integration

A successfully completed standard session contributes exactly:

```text
15 / 15 = 1.0
```

word acquisition dose to the selected word and zero direct acquisition dose to incidental entities.

PL16 now recognizes trusted intervention phase bounds for PL20–PL22. For an object-bound trusted intervention plan, PL16 may use the explicit `entry-probe` and `exit-probe` phase ranges for acquisition entry/exit semantics. Serialized configuration/metadata alone cannot spoof that privilege. Generic sessions retain their existing fallback behavior.

PL16 remains the owner of cumulative dose, longitudinal learning curves, saturation, and transfer observations.

## 17. Recommendations and manual practice

Recommendation failure is non-gating. If no well-established word limiter exists, the detail screen reports that no problem word is currently well-established and still allows manual lexical input.

A manually selected word must pass the same PL7 training-index and content-feasibility checks as a recommended word before Start becomes valid.

## 18. Repeat behavior

`Practice again` creates a new session ID, a new deterministic content rotation where possible, and a new PL16 acquisition observation. Repeat never auto-starts and never launches protected transfer.

## 19. Non-goals and remaining limitations

PL22 v1 does **not** implement:

- apostrophe or hyphen word training;
- capitalization-heavy target-word training;
- correction-specialized interventions;
- protected cold transfer;
- Real Text mode;
- Pace Ladder;
- Burst Sprints;
- Common Words;
- Endurance;
- treatment-effect causality;
- treatment personalization;
- automatic mode selection;
- Daily Coach;
- public Practice release.

## 20. Future contracts

### PL23 — Accuracy / Recovery

PL23 owns specialized error/correction interventions: error episodes, correction initiation, over-deletion, repair, and return to pace. An inaccurate Problem Word still receives the stable PL22 v1 word intervention; PL22 does not dynamically become PL23.

### PL24 — Real Text / Cold Transfer

PL24 owns broader natural-text transfer integration with PL18 protected material. PL22 Check remains training evidence.

### PL25 — Daily Coach

A future Coach may pass an `external-plan` word target. PL22 must still execute the same stable v1 treatment.

### PL32 — treatment-effect tracking

PL32 must be able to identify the stable intervention family:

```text
experimentId = problem-words
experimentVersion = 1
policyVersion = 1
```

Any material change to the 15-opportunity dose, phase quotas, cue fading, launch-context policy, repetition constraints, probe matching, or content-selection policy requires the appropriate version increment.

## 21. Final architectural rule

Problem Words trains a lexical execution skill, not a spelling list:

```text
STARTING THE WORD
  → launch timing / hesitation

EXECUTING THE WORD
  → within-word transitions

COMPLETING THE WORD CORRECTLY
  → whole-word first-pass accuracy
```

The correct intervention moves from uncued Baseline to deliberate but spaced whole-word Focus, broader Context, uncued target/neutral Mix, and a different matched uncued Check. A constituent n-gram may partly explain a word, but PL22 does not silently turn into Combination Repair. A corrected target-word error remains a first-pass error. A strong Check remains immediate practice evidence, not proof that the word is mastered, retained, transferred, or fixed forever.

## PL30 boundary

Problem Words v1 remains lowercase alphabetic lexical practice; punctuation-bearing tokens are not promoted into PL22 word targets by PL30.
