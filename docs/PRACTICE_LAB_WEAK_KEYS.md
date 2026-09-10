# Practice Lab — Weak Keys (PL21)

Status: developer preview  
Experiment ID: `weak-keys`  
Experiment version: `1`  
Weak Keys version: `1`  
Policy version: `1`  
Generator version: `1`  
Selection version: `1`  
Result version: `1`

PL21 adds WordStrike's second deliberate-practice intervention. It trains one persistent PL11 `key` entity as a context-dependent typing skill rather than as an isolated button.

The fixed v1 intervention is:

```text
ONE KEY
  ↓
BASELINE
  ↓
FOCUS
  ↓
CONTEXT
  ↓
MIX
  ↓
CHECK
  ↓
PL11 direct key evidence
+
PL16 direct key learning dose
```

The beginning and end probes are both training observations. They are not transfer observations, and a positive Check result is not a mastery, retention, or causal-treatment claim.

## 1. Purpose

Weak Keys strengthens one measured expected-character key through varied lexical positions and surrounding transitions. It is deliberately not a repeated-key tapping exercise. The standard protocol never emits isolated strings such as `rrrrrrrr` or `r r r r` as its training material.

The intervention is intended to give PL11 and PL16 a stable, interpretable direct-target exposure while allowing ordinary incidental key, bigram, trigram, and word evidence to continue through the shared Practice session engine.

## 2. Canonical key entity semantics

The target is the existing PL11 entity:

```js
{
  entityType: "key",
  entityKey: "r"
}
```

`entityKey` is the canonical expected grapheme represented by the Practice text/evidence model. PL21 does not introduce a new key identity.

## 3. Textual key versus physical key

A Weak Keys target is not necessarily a physical `KeyboardEvent.code`, USB scancode, switch, hand, or finger. For example, textual `z` may occupy different physical locations on QWERTY and QWERTZ layouts. PL5 context identity already separates evidence by the active typing context.

PL21 consumes that context; it does not redefine it.

## 4. Eligible targets

English v1 accepts exactly one lowercase alphabetic grapheme `a`–`z`.

Manual input normalization is:

```text
trim
→ NFC
→ English lowercase
```

Therefore manual `R` is displayed and trained as `r`.

English v1 rejects:

- multiple graphemes such as `th`;
- space, tab, and newline;
- digits `0`–`9`;
- punctuation;
- symbols;
- non-ASCII letters such as `é`.

This is a language-specific v1 policy, not a generic assertion that future Practice languages must be ASCII. A future language policy may support additional canonical letter graphemes.

## 5. Lowercase English policy

Shift/capitalization coordination is outside PL21. PL30 owns punctuation/capital/number/symbol coordination. Weak Keys therefore normalizes manual English uppercase to the lowercase expected-character entity instead of creating a second treatment identity.

## 6. Target availability

A target is usable only when the PL7 training reverse index provides approved target evidence through `key → words` and/or `key → content` paths.

The target availability contract is:

```js
{
  eligible,
  status, // ready | limited-content | unsupported | unavailable
  entityType: "key",
  entityKey,
  trainingEvidence,
  contextCoverage,
  reasons
}
```

`ready` means the complete standard v1 intervention can be constructed. `limited-content` means the key exists but the approved training material cannot satisfy the complete diversity/probe contract. `unsupported` means the target/language class is outside v1. `unavailable` means no usable reverse-index evidence exists or the trusted corpus/index cannot be loaded.

PL21 never borrows protected content to turn `limited-content` into `ready`.

## 7. Recommended targets

`buildWeakKeyCandidates()` consumes existing evidence rather than creating a second weakness model.

The candidate source is PL12 key-level limiter evidence. `confirmed` and `likely` limiters are preferred; `possible` may appear secondarily. Supported v1 phenotypes include slow, hesitant, inaccurate, recovery-heavy, unstable, and mixed evidence. The treatment itself is not phenotype-specific in PL21.

PL15 mastery is used as a recommendation filter. Learning and Acquired are preferred when limiter evidence remains unresolved. Robust and Retained are not normally recommended, although a user can still choose a valid key manually.

Recommendations are bounded to eight entries.

## 8. PL12 hierarchy and downstream relevance

A key may appear in higher-level PL12 explanations for bigram, trigram, or word limiters. PL21 reports bounded downstream relevance as:

```text
downstreamExplainedCount
bigramCount
trigramCount
wordCount
```

Only likely/confirmed higher-level limiter candidates whose `hierarchy.explainedBy` includes the key stat ID are counted.

UI wording is intentionally non-causal: a key may "also appear in several higher-level limiter explanations." PL21 never claims that the key causes all those higher-level problems.

## 9. PL16 saturation handling

PL21 uses the canonical PL16 saturation evaluator. Likely/supported saturation de-emphasizes recommendations rather than deleting the target. A manually selected saturated key remains allowed and receives a warning that another unresolved limiter may have higher expected value.

This is recommendation policy only. PL21 does not write or redefine saturation state.

## 10. Recommendation ordering

Within eligible evidence, ordering uses PL12 priority/status first, then hierarchy relevance, confidence, weakness evidence, PL15 stage preference, and a deterministic key tie-break. When canonical impact is unknown, weakness/confidence/downstream relevance provide the fallback evidence.

Saturation applies a de-emphasis factor before final recommendation ordering so heavily saturated candidates do not dominate solely because of old high-priority evidence.

## 11. Training partition only

All source content is:

```text
partition = training
purpose = training
```

Weak Keys plans contain zero source content from:

- `diagnostic`;
- `transfer`;
- `benchmark`;
- `research-holdout`.

The PL18 corpus-use guard and PL7 index loader remain the canonical partition boundaries. Weak Keys never calls protected reverse-index paths.

## 12. One-key rule

Every v1 session has exactly one direct target:

```js
[
  {
    entityType: "key",
    entityKey: selectedKey,
    directTarget: true
  }
]
```

There are no key bundles such as `q, p, x, z` in one intervention. Target source is one of `recommended`, `manual`, or reserved `external-plan`.

The one-key rule gives PL16 a stable acquisition identity and gives future PL32 treatment-effect work one stable intervention family.

## 13. One-dose session

PL16 v1 defines the direct key dose scale as 80 opportunities. Weak Keys therefore uses exactly:

```text
Baseline   8
Focus     24
Context   20
Mix       20
Check      8
----------
TOTAL     80
```

Thus:

```text
80 direct key opportunities = 1.0 PL16 key dose unit
```

A target opportunity is the first encounter with one expected occurrence of the selected key. A wrong first attempt still represents one opportunity. Corrections/retries do not create a second target opportunity or additional dose.

## 14. Immutable five-phase plan

The phase sequence is fixed:

1. `entry-probe` — Baseline;
2. `focus` — Focus;
3. `context` — Context;
4. `interleave` — Mix;
5. `exit-probe` — Check.

The plan is immutable after construction. Poor performance does not double the dose; a strong Baseline does not skip Focus; the target never changes mid-session.

The plan hash binds target, versions, explicit phase boundaries, ordered source IDs/hashes, generated word IDs, cue policy, corpus/index identity, and the active PL5 context identity. If the active Practice context fingerprint changes between plan generation and session start, the session fails instead of reusing geometry/content assumptions under another context.

## 15. No isolated-letter spam

Focus is high density but remains lexical. It prefers short approved target-containing words and deterministic sequences of approved training-derived words.

V1 preferences include:

- target words approximately 2–6 graphemes when available;
- moderate/easier typability where available;
- at most two selected-key opportunities per lexical item;
- at most four selected-key opportunities per generated unit;
- at least five usable distinct target words as the hard lexical floor;
- eight distinct target words preferred.

The same word is not intentionally spammed when unvisited usable candidates remain.

## 16. Word-position diversity

Canonical PL10/Practice word-position classes are reused:

```text
word-start
word-middle
word-end
single-character-word
non-word
unknown
```

For ordinary alphabetic key practice, Context prefers start/middle/end coverage. If the available approved corpus supports at least two classes, Context must retain at least two. Three classes are preferred when natural/approved candidates permit it.

PL21 never fabricates linguistically unnatural text solely to force three classes.

## 17. Preceding/following context diversity

Because key timing is observed at insertion of the selected expected grapheme, the immediately preceding expected grapheme is a useful incoming-transition context. Across Focus + Context + Mix, PL21 prefers at least six distinct preceding graphemes and six distinct following graphemes when the indexed corpus permits them.

Beginning-of-text and end-of-text are valid boundary conditions. No fake preceding/following grapheme is invented.

Only bounded aggregate coverage is kept in the plan/result. PL21 does not persist long lists of containing words/sentences as a separate history.

## 18. Keyboard geometry

Where PL10 knows the active layout, incoming target transitions use existing geometry classes:

```text
same-key
same-side-near
same-side-far
cross-side
unknown
```

PL21 prefers at least three non-unknown classes over the complete intervention when available.

This describes expected-key locations. It is not finger-motion telemetry.

## 19. Layout neutrality

The geometry provider already supports layout-specific maps such as QWERTY, QWERTZ, AZERTY, Colemak, and Dvorak. Weak Keys calls the canonical classifier with the active PL5 keyboard layout.

An unknown layout produces geometry coverage `unavailable`; it does not fail an otherwise valid session and is never silently treated as QWERTY.

## 20. Mix / interleaving

Mix intentionally breaks target-only attention. It combines target-bearing units with genuine target-free units while the target cue is off.

V1 prefers at least one neutral unit for each target-bearing unit where feasible. A neutral unit must contain zero selected-key opportunities according to canonical training annotations / verified generated lexical items.

For common letters such as `e` or `a`, safe target-free natural prose may be scarce. In that case PL21 can build a deterministic neutral word sequence from approved training-derived words whose PL7 annotations contain zero selected-key occurrences.

If sufficient genuine neutral material cannot be constructed, the key is `limited-content`. PL21 does not rename a target-only phase "Mix."

## 21. Exact-opportunity composer

Every target-bearing phase uses a bounded deterministic exact-sum solver. Candidate items carry a target-opportunity count plus family/lexical/context/typability metadata.

The maximum single phase quota is 24, so a bounded dynamic-programming exact-sum selection is inexpensive. It never performs greedy "add until >= quota" composition.

Hard exact-count feasibility is evaluated first. Among valid exact-count solutions, tie-breaks prefer:

1. more unique families;
2. more distinct lexical items;
3. broader position coverage;
4. broader preceding/following context coverage;
5. broader known geometry coverage;
6. less lexical repetition;
7. phase-appropriate typability;
8. deterministic hash order.

Candidate loading is bounded (target references 256, neutral references 128) and remains behind PL7 lazy loading.

## 22. Determinism and rotation

Candidate ordering is hashed from the session ID, target, generator version, policy version, candidate identity, and a phase-specific salt. Identical inputs therefore produce the same plan. A new session ID changes deterministic ordering and normally rotates content where alternatives exist.

"Practice again" always creates a new session ID and therefore a new PL16 observation/dose event.

## 23. Matched Baseline and Check probes

Baseline and Check each contain exactly eight selected-key opportunities. Both are uncued and suppress live aggregate feedback.

Hard matching requirements include:

- Baseline/Check family disjointness;
- source content ID disjointness;
- identical composition mode;
- exact 8 vs 8 target opportunities.

Natural approved phrases/sentences are preferred when a responsible pair can be built. A generated word-sequence probe is an allowed fallback, but every word remains derived from approved training content; no LLM generates probe text.

The probe matcher applies these v1 thresholds:

```text
abs(entryTypability - exitTypability) <= 0.35
feature RMS distance                <= 0.75
word-position profile TV            <= 0.25
geometry profile TV                 <= 0.35 (when geometry is available)
```

Unknown position lowers profile coverage. Unknown geometry makes the geometry comparison unavailable rather than invalid.

If a responsible pair cannot be built, the target is `limited-content`. Thresholds are not silently loosened.

## 24. Cue fading

Target cues are:

```text
Baseline: off
Focus:    strong
Context:  subtle
Mix:      off
Check:    off
```

The active UI's strong cue uses underline structure in addition to color/background. Context uses a reduced dashed underline. The cue therefore does not depend on color alone.

Live aggregate WPM/accuracy, PBs, metronome, rhythm coach, and leaderboards are absent during the intervention. Normal character correctness/correction feedback remains available.

## 25. Practice session contract

Weak Keys runs through one canonical Practice session engine instance.

```text
correctionBehavior = allow
completion         = content-complete
resumable          = false
evidenceRole       = training
contentPurpose     = training
abilityChannel     = null
performance        = null
retention          = null
evaluation         = null
assessmentBinding  = null
```

Refreshing/abandoning ends the v1 intervention. There is no Weak Keys checkpoint restore.

## 26. PL11 evidence integration

PL11 remains the only owner of persistent skill evidence. The selected key is the sole direct target and receives direct first-pass target evidence through normal session processing. Its `lastPractisedAt` therefore updates normally.

All other keys, bigrams, trigrams, and words encountered in the content may receive ordinary incidental PL11 evidence. PL21 does not suppress those observations and does not write skill statistics itself.

## 27. PL12 hierarchy follow-up

PL21 does not mutate limiter or hierarchy state. After new key evidence accumulates, PL12 may independently recompute whether a higher-level limiter remains explained by the key, becomes independent, weakens, strengthens, or becomes insufficient. That follow-up belongs entirely to the canonical PL12 model.

## 28. PL15 mastery

Weak Keys does not assign mastery. PL15 can consume later accumulated evidence through its existing model. A strong final Check does not set Acquired/Robust/Retained and is never serialized as a mastery label.

## 29. PL16 learning dose

A successfully completed standard session provides exactly 80 direct key opportunities and therefore 1.0 direct PL16 acquisition dose unit for the selected key.

Other entities receive zero direct acquisition dose from the intervention, even though their incidental PL11 evidence may change. The generic PL16 acquisition observation remains the canonical durable learning-state update. The same-session explicit Baseline/Check result is an additional experiment result, not a replacement learning model.

## 30. Explicit probe metrics

The experiment analyzer computes Baseline and Check only from their immutable phase-bound target positions.

For each probe it reports:

```js
{
  opportunityCount,
  quality,
  qualityCoverage,
  firstPassAccuracy,
  normalizedResidualMedianMs,
  normalizedResidualMeanMs,
  disfluencyRate,
  positionCoverage,
  incomingGeometryCoverage
}
```

Accuracy uses first attempts. Speed uses PL10 normalized residual timing for first-attempt correct target insertions. Hesitation uses PL8 fluent/disfluent classification. Quality uses the shared execution-quality helper:

```text
Accuracy   45%
Speed      40%
Disfluency 15%
```

At least `0.60` of the original quality weight must remain available for a responsible quality value.

## 31. Immediate probe delta

The same-session result is:

```text
ImmediateProbeDelta = CheckQuality - BaselineQuality
```

It may be described as "the Check probe was N quality points higher/lower than Baseline." It is not called learning gain and does not prove durable improvement.

## 32. Results

The result screen can show:

- selected key;
- Baseline → Check quality;
- first-pass accuracy;
- context-adjusted timing;
- hesitation rate;
- compact context variety (`Low`, `Moderate`, `Broad`);
- completed dose (`1.0 · 80 direct key opportunities`).

It also displays:

> This compares the beginning and end of this practice session. Long-term improvement requires later sessions and transfer evidence.

No `Mastered`, `Transferred`, `Retained`, or causal-treatment label is produced.

## 33. Physical technique and finger policy

PL21 v1 adds no finger assignment, home-row enforcement, touch-typing purity check, hand requirement, or physical finger telemetry.

The UI never instructs a user to press `r` with a particular finger. A future optional keyboard visual may show the target's known layout position, but that visual is not required for PL21 and cannot prescribe a finger.

PL36 may later add optional physical keyboard dynamics under a separate model/version.

## 34. Software keyboards and input context

Weak Keys accepts standard browser/software input through the shared input engine and the existing PL5 input-method context. Software-keyboard observations are not discarded merely because physical geometry may be unavailable.

## 35. Privacy

PL21 introduces:

- no custom text;
- no remote analytics;
- no Supabase write/read path;
- no third-party API;
- no runtime LLM;
- no physical finger telemetry;
- no new persistent raw trace or mistyped-string store.

Plan persistence is compact and references source IDs/hashes / approved word IDs instead of persisting a second history of containing passages.

New PL21 modules have no storage open, fetch, timer, listener, or localStorage side effect merely from module import. Runtime resources are created only when the relevant developer-preview route/target/session is invoked.

## 36. Feature gate

Weak Keys remains behind the existing Practice feature gate returned by `createPracticeFeatureGate()`. PL21 does not introduce a second public-release switch.

The catalog status is developer `preview`; public Practice remains gated.

## 37. Current corpus limitation

At the time PL21 was implemented, the shipped English training corpus contains too little family diversity to satisfy Weak Keys' strict entry/exit family-disjoint matched-probe contract for normal live use. The runtime therefore reports `limited-content` for keys that cannot satisfy the complete standard protocol.

This is intentional fail-closed behavior, not an implementation excuse. PL21 does not borrow diagnostic/transfer/benchmark/research-holdout text, lower the probe standard, or substitute repetitive letter tapping merely to make the Start button work.

Synthetic/indexed certification fixtures exercise the full protocol until the approved training corpus is expanded.

## 38. Non-goals

PL21 does not implement:

- physical finger telemetry;
- finger-specific drills;
- punctuation keys;
- digit/symbol keys;
- Problem Words;
- Accuracy/Recovery mode;
- Real Text training;
- Pace Ladder;
- Burst Sprints;
- Common Words;
- Endurance;
- automatic intervention selection;
- Daily Coach;
- treatment-effect causality;
- treatment personalization;
- public Practice release.

## 39. PL22 contract

PL22 Problem Words may reuse the five-phase intervention shape and exact-dose ideas, but it must operate at the word entity level and separately model word launch, internal execution, and whole-word first-pass quality. It must not be implemented as "Weak Keys with longer targets."

## 40. PL23 contract

PL23 Accuracy/Recovery may specialize treatment for error/correction-control phenotypes. PL21 intentionally does not change its treatment when a key's PL12 phenotype is inaccurate or recovery-heavy; stable treatment identity is more important at this phase.

## 41. PL25 contract

A future Daily Coach may supply `targetSource = "external-plan"`. It must still invoke the same versioned Weak Keys intervention and its same 80-opportunity protocol rather than silently personalizing dose/phase structure.

## 42. PL32 contract

Treatment-effect tracking must be able to identify the stable intervention family:

```text
experimentId      weak-keys
experimentVersion 1
policyVersion     1
```

Any material change to the 80-opportunity dose, phase quotas, cue fading, diversity requirements, probe matching, or content-selection contract requires the appropriate version increment.

## 43. Architectural ownership summary

PL21 consumes existing models but does not duplicate them:

| Concern | Canonical owner | PL21 behavior |
|---|---|---|
| Context identity | PL5 | consumes active context |
| Target/content reverse indexes | PL7 | training-only lazy consumer |
| Fluent/disfluent timing | PL8 | consumes for probe hesitation |
| Error/recovery | PL9 | normal shared engine behavior |
| Normalized timing/geometry | PL10 | consumes residuals/positions/layout geometry |
| Persistent skill evidence | PL11 | direct selected-key + incidental other evidence |
| Limiter/hierarchy interpretation | PL12 | recommendation input only |
| Ability | PL13 | no measurement |
| Readiness/frontier | PL14 | no measurement |
| Mastery | PL15 | recommendation filter only; no writes |
| Learning curves/dose/saturation | PL16 | 80 direct key opportunities = 1.0 dose; saturation input |
| Retention review | PL17 | not a review |
| Protected partitions | PL18 | enforced; no protected content |
| Assessment | PL19 | not assessment |
| Combination Repair | PL20 | unchanged independent intervention |

Weak Keys therefore remains a narrow experiment-specific intervention over the shared Practice architecture rather than another permanent skill model.

## PL30 boundary

Weak Keys v1 remains alphabetic-only. PL30 uppercase scoring is textual output and does not introduce Shift-side or finger-technique targets.
