# Practice Lab Context & Typability Normalization Model

Status: PL10 generic normalization foundation  
Practice database structural version: 2 (unchanged)  
Session-summary record version: 5  
Checkpoint record version: 2 (unchanged)  
Foundation-analysis version: 3  
Normalization-analysis version: 1  
Context-model version: 1  
Context-policy version: 1  
Text-feature version: 1  
Typability-model version: 1  
Typability-reference version: 1  
Keyboard-geometry version: 1

## 1. Purpose

PL10 adds two neutral normalization layers underneath future Practice interpretation:

1. **transition context normalization** — estimates how long a transition would ordinarily be expected to take under the current session/context, then reports residual latency;
2. **text typability normalization** — describes whole-text typing difficulty relative to an explicitly governed reference model.

PL10 does not decide whether a user is weak, strong, improving, ready for review, or in need of a drill. It does not adjust WPM/accuracy, estimate ability, prioritize targets, or implement UI.

The canonical analysis flow is:

```text
PL5 context identity
      ↓
PL7 structural text analysis
      ↓
PL8 fluent/disfluent transition analysis
      ↓
PL9 error/recovery analysis
      ↓
PL10 context + typability normalization
```

## 2. Foundation-analysis contract

`foundationAnalysis` advances to version 3:

```js
{
  version: 3,
  latency,        // PL8
  errors,         // PL9
  normalization  // PL10
}
```

The three layers remain separate. PL10 consumes PL8 output but does not mutate or redefine it. PL9 output remains unchanged.

## 3. Session-context binding

At `prepare()`, the session engine resolves the exact persisted PL5 context record identified by the immutable `profileId + contextId` session identity and freezes a normalization snapshot containing:

- `contextId`;
- context fingerprint;
- `dataLocale`;
- `keyboardLayout`;
- `inputMethod`;
- nullable `hardwareProfileId` in transient memory only.

Changing the profile's active context later does not relabel the running session. PL10 never derives historical context from current settings.

The durable `normalizationSummary.context` stores only:

- context fingerprint;
- locale;
- layout;
- input method.

It does not persist hardware nicknames, browser fingerprints, device fingerprints, or inferred device identity.

## 4. Transition-normalization eligibility

PL8 remains authoritative for transition comparability.

Expected-latency fitting uses **only** transitions that PL8 classified as:

```text
fluent
+
correct
+
finite latency
```

PL8 `disfluent` transitions are allowed to receive an expected latency and residual after the baseline has been fit, but they are never allowed to fit that baseline.

PL8 `interruption` and `excluded` transitions receive:

```text
expectedLatencyMs = null
residualLatencyMs = null
residualRatio = null
contextLevelUsed = null
```

This preserves PL8 pause/restore/segment-start/post-correction rules.

## 5. Anti-leakage rule

Expected latency must never be predicted from the exact target identity later phases are meant to measure.

The predictor does **not** use:

- `entityType`;
- `entityKey`;
- exact key/bigram/trigram/word identity;
- weakness/mastery state;
- priority;
- previous personal target score.

The transient normalized record may retain an `expectedEntity` for observed attribution, but that field is never passed into a bucket key or expected-latency feature vector.

This prevents a historically slow target from teaching the model that the target itself is “supposed” to be slow.

## 6. Context-feature vocabulary

PL10 v1 uses coarse, interpretable classes only.

### Structural class

```text
within-word
word-boundary
punctuation
numeric
mixed
unknown
```

PL7 remains the source of structural occurrence truth. PL7's pure `whitespace` occurrence class maps to PL10's `word-boundary` normalization class; PL10 does not create a second competing tokenizer.

### Word position

```text
word-start
word-middle
word-end
single-character-word
non-word
unknown
```

### Word-length band

```text
1-3
4-6
7-9
10+
unknown
```

Word length is measured in Practice graphemes, not UTF-16 code units.

### Input class

```text
letter-lower
letter-upper
digit
whitespace
punctuation
symbol
other
```

Unicode properties are used rather than ASCII-only checks.

### Geometry class

```text
same-key
same-side-near
same-side-far
cross-side
unknown
```

### Frequency bands

```text
high
medium
low
rare
unknown
```

`unknown` is evidence absence and is never converted to `rare`.

## 7. Keyboard geometry

PL10 keyboard geometry is physical-position metadata, not biomechanics.

Version 1 recognizes:

- QWERTY;
- QWERTZ;
- AZERTY;
- Colemak;
- Dvorak.

Each explicitly represented key may have row, column, staggered x-position and coarse side. Uppercase letters resolve to their base physical letter key.

PL10 does **not** assign fingers or claim which finger/hand the user actually used. Unsupported layouts or unrepresented punctuation/numeric keys degrade to `unknown` geometry.

`same-side-near` vs `same-side-far` uses a versioned Euclidean row/x engineering threshold of 1.75. That threshold is not a motor-science constant.

## 8. Context hierarchy

The expected-latency hierarchy is fixed for v1.

```text
Level 3
structuralClass
+ wordPositionClass
+ geometryClass
+ wordFrequencyBand
+ bigramFrequencyBand

Level 2
structuralClass
+ wordPositionClass
+ geometryClass

Level 1
structuralClass
+ wordPositionClass

Level 0
global current-session PL8 fluent median
```

Unknown/unavailable features cause fallback to the first available coarser level.

## 9. Minimum evidence and shrinkage

A context bucket is eligible only at:

```text
n >= 4 fluent transitions
```

Eligible medians are shrunk recursively toward their parent estimate:

```text
K = 12
w = n / (n + K)
Estimate_L = w * Median_L + (1 - w) * Estimate_parent
```

Sparse buckets therefore cannot dominate a session baseline.

The global parent is **exactly the PL8 session fluent median**. PL10 does not create a second independent global timing baseline.

## 10. Expected latency and residuals

For each classifiable transition:

```text
ExpectedLatencyMs = best available shrunk context estimate

ResidualLatencyMs = ObservedLatencyMs - ExpectedLatencyMs
```

Interpretation is strictly relative:

- positive: slower than current-session context expectation;
- near zero: close to expectation;
- negative: faster than expectation.

A bounded ratio is also produced transiently:

```text
ResidualRatio = ObservedLatencyMs / ExpectedLatencyMs - 1
```

with v1 clamp:

```text
[-0.95, 10]
```

No residual is used to redefine WPM or accuracy.

## 11. Context-model coverage

The compact session summary reports:

- trace scope (`complete-session` or `retained-window`);
- normalizable transition count;
- total classifiable transition count;
- normalization coverage rate;
- geometry known/unknown counts and rate;
- frequency known/unknown counts and rate;
- specific/coarse eligible bucket counts;
- counts of transitions normalized at global/Level 1/Level 2/Level 3.

Full per-transition residual records remain transient and are not persisted into `sessionSummary`.

## 12. Text-difficulty features

`practiceTextDifficultyFeatures.js` derives whole-text features using PL7/Practice grapheme and word semantics:

- `graphemeCount`;
- `wordCount`;
- `meanWordLength`;
- `p90WordLength`;
- `uppercaseRatio`;
- `punctuationRatio`;
- `digitRatio`;
- `symbolRatio`;
- `lexicalRarityScore`;
- `bigramRarityScore`;
- frequency-feature coverage plus explicit known/eligible counts.

P90 uses the existing PL8 R-7 quantile convention.

Uppercase/punctuation/digit/symbol ratios use **non-whitespace graphemes** as the denominator. A zero denominator yields `null` rather than zero.

## 13. Frequency-reference policy

Frequency is optional and separately governed.

A runtime/build frequency provider must supply:

- version;
- reference ID;
- language;
- SHA-256 checksum;
- source IDs;
- explicit statistical-reference approval;
- word and/or bigram frequency entries.

Source IDs are also checked through the PL6 provenance registry for statistical-reference eligibility.

The current PL6 source `ws-original-en-foundation-v1` is eligible for statistical-reference use under the existing provenance rules, so the **training items** may fit the non-frequency typability reference. It is not itself a general-language word/bigram frequency table.

There is currently **no separate approved frequency artifact**. PL10 therefore does not import Google/common gameplay lists or derive fake general frequency from the tiny two-sentence training corpus.

Production v1 consequently has:

```text
lexicalRarityScore = null
bigramRarityScore = null
frequency coverage = 0
```

## 14. Typability model kind

The canonical label is:

```text
heuristic-relative-v1
```

This is an engineering heuristic for **relative text difficulty**, not an empirically validated ability correction, causal model, or psychometric scale.

## 15. Typability v1 weights

```text
meanWordLength        0.16
p90WordLength         0.08
uppercaseRatio        0.10
punctuationRatio      0.12
digitRatio            0.08
symbolRatio           0.08
lexicalRarityScore    0.19
bigramRarityScore     0.19
                      ----
                      1.00
```

Positive standardized direction always means “harder under this heuristic.”

## 16. Reference standardization

Only the **training** partition fits the reference.

For each feature, PL10 stores robust training statistics:

- sample count;
- median;
- MAD;
- robust scale;
- versioned epsilon floor.

A target feature becomes a bounded standardized value:

```text
z = clamp((x - trainingMedian) / max(robustScale, epsilon), -4, 4)
```

The difficulty index is the weighted sum of available standardized features, bounded to `[-4, 4]`.

## 17. Missing-feature renormalization

Missing features are not treated as zero evidence.

If a feature is unavailable, its original weight is removed and the remaining weights are renormalized to sum to one.

The original available model weight determines status:

```text
full         >= 0.90
partial      >= 0.50 and < 0.90
insufficient < 0.50
```

Because the current governed runtime has no frequency artifact, the two 0.19 rarity weights are unavailable:

```text
available weight = 1 - 0.19 - 0.19 = 0.62
status = partial
```

The remaining six features are renormalized rather than being diluted by fabricated zeros.

## 18. Relative difficulty percentile

The reference stores the difficulty-index distribution of the **training** items only.

The percentile method is versioned as:

```text
empirical-midrank-v1
```

For score `s`:

```text
percentile = 100 * (count(score < s) + 0.5 * count(score == s)) / N
```

This is a training-reference percentile, not a population percentile and not an ability percentile.

## 19. Protected-partition contamination rule

The normal PL10 build pipeline uses:

```text
FIT:
  training

SCORE WITH FROZEN REFERENCE:
  training
  transfer
  benchmark
  diagnostic

NOT FIT:
  transfer
  benchmark
  diagnostic
  research-holdout

NOT NORMALLY SCORED:
  research-holdout
```

Transfer/benchmark/diagnostic content may receive a frozen post-fit typability score for descriptive analysis but never influences medians, scales, weights or percentile reference distribution.

Research holdout is excluded from both fitting and ordinary PL10 score generation.

## 20. Static model artifacts

`scripts/buildPracticeTypability.mjs` is deterministic and validates PL6/PL7 before deriving anything.

For English v1 it emits:

```text
data/practice/models/en-v1/manifest.json
data/practice/models/en-v1/typability-v1.reference.json
data/practice/models/en-v1/training.json
data/practice/models/en-v1/transfer.json
data/practice/models/en-v1/benchmark.json
data/practice/models/en-v1/diagnostic.json
js/practiceLab/generated/practiceTypabilityRuntimeData.js
```

The manifest binds to:

- corpus ID/version;
- PL6 corpus build checksum;
- PL7 index schema/checksum;
- segmentation/tokenization versions;
- model/feature/reference versions;
- weights/coverage thresholds;
- fit and excluded partitions;
- artifact checksums;
- optional frequency-reference metadata.

No research-holdout score artifact is generated.

## 21. Static vs dynamic scoring

A static precomputed score may be used only when session metadata explicitly and exactly binds:

- `corpusId`;
- `corpusVersion`;
- source `contentId`;
- source `contentHash`;
- current session content hash.

Any mismatch falls back to dynamic current-text analysis. There is no nearest-version or same-title fallback.

Custom/generated text is analyzed dynamically and does not claim a PL6 corpus identity in durable normalization metadata.

## 22. Current English v1 reference limitation

The PL6 training partition currently contains only two approved English items. PL10 therefore treats the model as a thin versioned engineering reference, not a statistically rich typability corpus.

That small reference is acceptable as a foundation contract because:

- semantics are explicit;
- outputs are coverage-labelled;
- frequency absence degrades to partial;
- protected partitions cannot leak into fitting;
- later governed reference releases can change reference version without rewriting historical session results.

It is **not** evidence that the current percentile distribution generalizes to real-world English typing difficulty.

## 23. Durable session summary

`sessionSummary` advances from v4 to v5 with nullable:

```text
normalizationSummary
```

New PL10 sessions may persist a compact summary containing:

- normalization/model/reference version identifiers;
- frozen context fingerprint + locale/layout/input method;
- transition-normalization coverage and residual aggregates;
- text-difficulty index/status/relative percentile;
- frequency coverage;
- static corpus/content binding only when exact precomputed metadata was used.

It does not persist:

- raw text;
- full text feature vector;
- raw/classified event trace;
- per-transition residual trace;
- entity residual maps;
- word/bigram frequency tables;
- hardware nickname/device fingerprint.

## 24. Migration

Historical v4 summaries migrate deterministically:

```text
v4
 ↓
v5
normalizationSummary: null
```

PL10 never reconstructs context-normalized residuals or typability scores from historical WPM/latency/error aggregates because the required per-transition/context/text evidence was not persisted.

The complete chain remains sequential:

```text
v1 -> v2 -> v3 -> v4 -> v5
```

Practice IndexedDB structural version remains 2 and checkpoint record version remains 2.

## 25. Existing metrics remain authoritative

PL10 does not alter formulas or persistence meaning for:

- WPM;
- raw WPM;
- accuracy;
- corrected/uncorrected errors;
- correction cost;
- PL8 fluent/disfluent/interruption counts;
- PL9 episode/recovery metrics.

There is no `typabilityAdjustedWpm` field in PL10.

## 26. Explicit non-goals

PL10 does not implement:

- weakness or limiter labels;
- persistent per-entity residual aggregation;
- mastery/review scheduling;
- target priority;
- ability estimation;
- Recovery Debt;
- Clean WPM;
- correction-efficiency composites;
- real-world impact scoring;
- Accuracy Control;
- adaptive drills;
- Daily Coach;
- recommendations;
- public Practice UI;
- leaderboard/ranked-mode integration.

## 27. Downstream contract

Later phases may consume:

- transient per-transition expected/residual latency plus observed exact identity;
- compact session normalization coverage;
- text difficulty/status/reference metadata;
- PL8 latency classes;
- PL9 error/recovery evidence.

They must not reinterpret PL10's heuristic text difficulty as user ability or use PL10 context predictors to absorb exact-target weakness.

## 28. PL12 downstream diagnostic use

PL12 consumes PL10 normalization without changing PL10 semantics or versions. In particular, PL10 remains authoritative for:

- context-bound expected latency;
- fluent/disfluent transition eligibility;
- positive/negative normalized residual meaning;
- anti-leakage from exact target identity;
- typability-reference fitting and protected-partition contamination rules.

PL12's slow, hesitant, launch-limited, and unstable diagnostics use PL11-persisted evidence that originated from PL10 expected-vs-observed residuals. PL12 never treats raw latency alone as authoritative slow evidence and never changes PL10 residual zero from its meaning: performance consistent with the current context expectation.

PL12 prevalence is a **separate** statistical contract from PL10 typability/frequency features. No approved population-frequency artifact currently exists in the repository. Therefore PL12 may use PL7 **training-partition occurrence rates** only as an explicitly labelled practice-proxy; transfer, benchmark, diagnostic, and research-holdout partitions never fit that proxy. The proxy does not retroactively become a PL10 frequency reference and does not change PL10's current null rarity features.

PL12 does not bump the PL10 normalization-analysis, context-model, context-policy, text-feature, typability-model, typability-reference, keyboard-geometry, or static-artifact versions. Historical PL10 documentation above remains the definition of the PL10 phase itself; current wrapper record versions are documented in PRACTICE_LAB_DATA_ARCHITECTURE.md.

See PRACTICE_LAB_LIMITER_IMPACT_MODEL.md for the downstream diagnostic formulas and impact/hierarchy semantics.

## 29. PL13 observation-level ability adjustment

PL13 is the first downstream phase that converts PL10 `difficultyIndex` into a conservative **observation-level** adjustment before latent ability estimation. This does not change PL10 itself: PL10 remains the source of the heuristic text-difficulty index, status, and `availableModelWeight`, and all PL10 model/reference/feature versions remain unchanged.

The versioned PL13 v1 observation policy is:

```text
D = PL10 difficultyIndex
C = availableModelWeight in [0,1]

A_d = clamp(0.03 × D × C, -0.12, +0.12)
AdjustedLogPerformance = ln(canonical WPM) + A_d
```

Higher PL10 difficulty therefore raises the adjusted ability observation; easier text lowers it. Partial models receive only coverage-proportional adjustment. For PL10 status `insufficient` or `unsupported-language`, PL13 uses zero difficulty adjustment and increases observation uncertainty instead of guessing.

PL13 does **not** use PL10 `relativeDifficultyPercentile` as a WPM correction. It also does not reinterpret PL10's heuristic difficulty index as user ability. The `0.03` coefficient and `±0.12` cap are PL13 engineering policy, isolated in the PL13 observation builder so PL18 can later replace/augment them with empirical passage calibration without redesigning PL10 or `abilityStates`.

Historical PL10 wrapper-version statements above remain documentation of the PL10 phase at its introduction. Current database/session/foundation wrapper versions are documented in `PRACTICE_LAB_DATA_ARCHITECTURE.md`; the full downstream estimator contract is in `PRACTICE_LAB_ABILITY_ESTIMATION.md`.
