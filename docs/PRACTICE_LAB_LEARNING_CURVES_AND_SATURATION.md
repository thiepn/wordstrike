# Practice Lab Learning Curves + Saturation Detection (PL16)

PL16 adds a bounded temporal learning model to Practice Lab. Earlier phases can describe durable entity evidence, limiter phenotype, ability, temporary performance state, and mastery; PL16 answers a different question:

> **How is this entity changing as targeted practice accumulates, and is additional practice still producing useful gain?**

The model is deliberately conservative. It does not infer durable learning from one good session, does not call every flat curve a plateau, does not treat same-session warm-up as long-term acquisition, does not manufacture retention evidence, and does not turn global ability stability into a plateau unless substantial recent targeted practice actually occurred.

PL16 is built on the certified PL13–PL15 architecture and preserves their semantic boundaries.

---

## 1. Scope

PL16 provides:

- per-entity acquisition observations;
- explicit targeted-practice dose accounting;
- entry/exit phase quality for same-session gain;
- protected transfer observations;
- bounded robust learning curves;
- recent marginal-gain estimates;
- saturation status and mechanism classification;
- a cold-natural-text ability trajectory derived from PL13 measurements;
- a context-level global plateau diagnostic;
- atomic persistence of temporal entity state;
- deterministic migration, retention, reset, privacy, and size limits;
- a derived context snapshot for later coaching/planning phases.

PL16 does **not** provide:

- a practice scheduler;
- review-value optimization;
- a Coach recommendation policy;
- delayed retention/forgetting claims;
- a public “plateau score” or gamification metric;
- causal claims about why a learner is plateauing;
- cross-context pooling;
- unbounded session history;
- raw keystroke/event persistence in learning state.

PL17 and later phases may consume PL16 outputs, but must not reinterpret them as stronger evidence than PL16 exposes.

---

## 2. Architectural boundary

PL16 uses existing phases according to their original responsibilities:

| Source | PL16 use |
| --- | --- |
| PL10 normalized transitions | finalization-only reconstruction of ordered entity opportunities and phase position |
| PL11 `skillStat` | canonical durable all-session entity evidence and canonical entity identity |
| PL12 limiter model | mechanism/phenotype corroboration; not a learning curve |
| PL13 `abilityState` | cold-natural-text global ability trajectory |
| PL14 performance state | **not** used as durable learning evidence |
| PL15 mastery/automaticity | maturity/resolution guard and transfer interpretation |

PL16 does not overwrite PL11 evidence, PL12 phenotype logic, PL13 ability estimation, PL14 temporary state, or PL15 mastery.

### Persistent truth vs derived interpretation

PL16 introduces one new persistent record: `learningState`.

The record stores only the bounded observations and cumulative quantities required to reconstruct the temporal model. Saturation, entity ranking, global plateau, and context snapshots remain derived.

---

## 3. Version envelope

PL16 advances the Practice storage/session envelope as follows:

```text
Practice DB version:           5
skillStat record version:      3   (unchanged)
abilityState record version:   1   (unchanged)
performanceState version:      1   (unchanged)
learningState record version:  1   (new)
sessionSummary record version: 9
checkpoint record version:     3   (unchanged)
foundationAnalysis version:    7
```

Model versions are separately explicit:

```text
learning model version:          1
learning policy version:         1
learning observation version:    1
learning curve version:          1
saturation model version:        1
global plateau model version:    1
```

A model/policy version change is not silently treated as equivalent evidence semantics.

---

## 4. IndexedDB v5: `learningStates`

DB v5 adds exactly one structural store:

```text
learningStates
```

Key path:

```text
learningStateId
```

Indexes:

- `profileId`
- `contextId`
- `entityType`
- `updatedAt`
- unique `statId`
- unique `[profileId, contextId, entityType, entityKey]`

Identity is deterministic and context-scoped:

```text
profile + context + entity type + entity key
```

A learning state must correspond to its canonical PL11 `skillStat`. Acquisition may create a temporal state only when that canonical stat exists. A transfer observation cannot create a transfer-only learning state.

### Size bound

Each learning-state record is limited to **32 KiB**. Observation rings are bounded before persistence, and validation rejects oversized state.

---

## 5. Learning-state shape

Conceptually:

```text
learningState
  identity
  versions
  acquisition
    all-time counts
    cumulative target opportunities
    cumulative dose units
    bounded recent observations
    bounded robust curve summary
  transfer
    all-time counts
    bounded recent observations
    bounded robust curve summary
```

The observation rings are:

```text
acquisition: 24 observations
transfer:    16 observations
```

All-time acquisition dose/count totals continue increasing after old observations roll out. The retained ring is a recent source-of-truth window for temporal fitting/audit, not the lifetime exposure total.

No raw content text, event trace, target positions, containing words, or raw keystroke history is stored in `learningState`.

---

## 6. Evidence roles

PL16 maintains strict evidence-role separation.

### Acquisition

Only canonical **training** evidence that is directly targeted can add acquisition dose and an acquisition observation.

The following cannot add acquisition dose:

- incidental appearances;
- diagnostic evidence;
- benchmark evidence;
- protected transfer evidence;
- custom/unclassified evidence that is not canonical direct training evidence.

### Transfer

Only canonical protected `transfer` evidence can add a transfer observation. Transfer adds **zero acquisition dose**.

This prevents a transfer probe from becoming self-fulfilling practice in the acquisition curve.

---

## 7. Targeted-practice dose

PL16 uses opportunity-normalized dose rather than elapsed minutes or session count.

V1 scales:

| Entity | Opportunities per 1 dose unit |
| --- | ---: |
| key | 80 |
| bigram | 50 |
| trigram | 35 |
| word | 15 |

For a direct training target:

```text
DoseUnits = DirectTargetOpportunities / EntityDoseScale
```

Examples:

```text
80 direct key opportunities    = 1.0 dose
25 direct bigram opportunities = 0.5 dose
70 direct trigram opportunities = 2.0 dose
30 direct word opportunities   = 2.0 dose
```

Dose is continuous; it is not rounded to integer sessions.

### Why opportunity dose

Session count is a poor learning denominator because sessions can be radically different in length and target density. Opportunity dose makes learning slopes interpretable as change per comparable amount of entity-specific practice.

Dose is still an engineering normalization, not a claim that one key opportunity has a scientifically exact equivalence to another entity type.

---

## 8. Entity quality

PL16 reuses PL15’s role-quality semantics rather than inventing a second quality system.

Weights:

```text
45% Accuracy
40% Speed
15% Disfluency
```

Available components are renormalized only when the original available weight is at least:

```text
0.60
```

Otherwise quality is `null`.

### Accuracy

Accuracy uses PL15’s entity-type first-pass quality mapping.

### Speed

Where observed fluent latency and residual are available:

```text
ExpectedApproxMs = FluentLatencyMeanMs - FluentResidualMeanMs
RelativeResidual = FluentResidualMeanMs / ExpectedApproxMs
```

`ExpectedApproxMs` must be positive.

Speed quality reuses PL15’s relative-residual mapping.

### Disfluency

```text
DisfluencyRate = DisfluentCount / TimingEligibleCount
```

Disfluency quality reuses PL15’s mapping.

### Zero is valid evidence

A quality of `0` is a real observation, not “missing”. PL16 uses nullish/missing-value checks rather than truthiness so severe transfer or acquisition evidence cannot be accidentally converted to a benign fallback.

---

## 9. Session phase reconstruction

Learning is not inferred only from whole-session quality. For direct training PL16 reconstructs ordered target opportunities from the finalization trace and attempts to form non-overlapping entry and exit phases.

V1 minimum full-session target opportunities:

| Entity | Session minimum | Entry phase | Exit phase |
| --- | ---: | ---: | ---: |
| key | 12 | 4 | 4 |
| bigram | 9 | 3 | 3 |
| trigram | 6 | 2 | 2 |
| word | 6 | 2 | 2 |

The earliest qualifying opportunities form entry. The latest qualifying opportunities form exit. Middle opportunities do not contaminate either phase.

Entry and exit phases must not overlap.

Direct targets processed per session are bounded at **32**.

---

## 10. Entry quality, exit quality, and practice gain

For a complete phase observation:

```text
EntryQuality = quality(first target phase)
ExitQuality  = quality(last target phase)
PracticeGain = ExitQuality - EntryQuality
```

These quantities answer different questions:

- **Entry quality**: how well did the entity arrive at the beginning of this training exposure?
- **Exit quality**: how well was it being executed by the end of the exposure?
- **Practice gain**: how much same-session adaptation occurred?

PL16 never substitutes exit quality for the next session’s entry quality.

### Restored/truncated chronology

When a session was restored from a checkpoint or the retained chronology is truncated such that entry/exit reconstruction is not trustworthy:

- valid direct-target dose may still be recorded;
- valid whole-session quality may still be recorded;
- `entryQuality = null`;
- `exitQuality = null`;
- `practiceGain = null`.

PL16 prefers missing phase evidence to fabricated chronology.

---

## 11. Acquisition observation

A compact acquisition observation includes, conceptually:

```text
session identity
completion time / local day
opportunity count
dose units
cumulative dose before
cumulative dose after
whole quality
entry quality
exit quality
practice gain
quality coverage
phase coverage status
compact quality metrics
```

During state merge:

```text
CumulativeDoseBefore = prior acquisition cumulative dose
CumulativeDoseAfter  = prior dose + current dose
```

This stamping happens inside the canonical state merge so callers do not invent their own dose history.

---

## 12. Acquisition curve: prior dose -> next entry quality

The core acquisition curve fits:

```text
x = cumulative target dose before a training observation
y = entry quality for that observation
```

This is the central PL16 protection against conflating practice performance with learning.

If a session begins at quality 60 and ends at 80, that +20 belongs to `practiceGain`. The acquisition curve does not pretend the learner permanently acquired +20 until a later session actually begins at a stronger entry level.

---

## 13. Robust curve estimator

PL16 uses a bounded Theil–Sen-style median pairwise slope.

For valid points `(xi, yi)`, all non-zero-denominator pair slopes in the bounded window are:

```text
slope(i,j) = (yj - yi) / (xj - xi)
```

The curve slope is the median valid pair slope.

Same-dose pairs are ignored.

This is deterministic and resistant to an isolated extreme observation without requiring unbounded history or a heavy statistical dependency.

### Bounds

Acquisition:

```text
historical fit window: 12 points
recent fit window:      5 points
recent minimum:         4 points
```

Transfer:

```text
historical fit window: 12 points
recent fit window:      5 points
recent minimum:         3 points
```

Even though acquisition state retains up to 24 observations, fitting remains bounded by the smaller curve window.

---

## 14. Acquisition curve status and confidence

Minimum acquisition curve support:

```text
points >= 4
days   >= 2
dose span >= 1.0
valid pair fraction >= 0.65
```

Primary status:

```text
meaningful improvement: slope >= +2 points/dose
flat band:              |slope| <= 1 point/dose
meaningful worsening:   negative evidence outside flat band
otherwise:              uncertain/provisional
```

Confidence also considers point count, independent days, dose span, valid pair coverage, and robust residual dispersion.

V1 medium target:

```text
>= 6 points
>= 2 days
>= 1.5 dose span
MAD <= 15 quality points
```

V1 high target:

```text
>= 8 points
>= 3 days
>= 2.5 dose span
MAD <= 10 quality points
```

Curve labels are evidence summaries, not causal claims.

---

## 15. Recent marginal gain

Historical learning and current learning rate are separate.

PL16 reports both:

```text
OverallGainPerDose
RecentGainPerDose
```

Marginal-gain labels:

```text
high:     >= 4 points/dose
moderate: >= 2 points/dose
low:      between negative threshold and 2
negative: <= -1 point/dose
```

A learner may have a strongly positive historical curve but low recent marginal gain. That is the expected precursor to “approaching saturation”; it is not automatically a plateau.

---

## 16. Practice-gain interpretation

The recent median same-session practice gain is evaluated separately.

V1:

```text
practice-gain window: 5
minimum valid values: 3
reacquisition signal: median practice gain >= 5
low practice gain:    median practice gain <= 3
```

Interpretation:

- flat next-session entry + **large** same-session gain can indicate a **reacquisition loop**;
- flat next-session entry + **small** same-session gain can support an **acquisition plateau**;
- this is not a forgetting/retention claim.

PL16 deliberately avoids language such as “forgotten” because PL17 owns delay-aware retention evidence.

---

## 17. Protected transfer curve

Transfer observations are compact, protected, and dose-neutral.

Minimum transfer opportunity counts per observation:

| Entity | Minimum |
| --- | ---: |
| key | 15 |
| bigram | 10 |
| trigram | 6 |
| word | 3 |

A session may emit at most **256** transfer observations.

A transfer observation is stamped at the current acquisition dose:

```text
x = cumulative acquisition dose at transfer observation
y = protected transfer quality
```

If a prior acquisition observation exists, PL16 also records a compact delay from that acquisition and whether the transfer occurred on a different local day. These are diagnostics; PL16 does not convert them into retention proof.

Same-dose transfer pairs are excluded from slope fitting.

---

## 18. Saturation is a staged claim

Canonical saturation statuses:

```text
insufficient-data
not-detected
approaching
possible
likely
supported
resolved
```

Canonical mechanism types:

```text
unknown
acquisition-plateau
reacquisition-loop
transfer-limited
mixed
```

A status is not a permanent state. It is re-derived from the current bounded learning state plus mastery and limiter evidence.

---

## 19. Insufficient data

Saturation remains `insufficient-data` when the acquisition curve lacks required temporal/dose support.

PL16 exposes reasons such as:

- insufficient entry points;
- insufficient independent days;
- insufficient dose span.

A small number of repeated drills cannot establish a plateau simply because the line looks flat.

---

## 20. Active-learning guard

When recent acquisition slope is meaningfully positive with at least medium curve confidence:

```text
recent gain >= 2 points/dose
```

saturation is `not-detected` even if absolute current quality is still low.

The learner is still learning; low quality alone is not saturation.

---

## 21. Resolved high-quality skill

A flat curve at strong quality is not a problem to fix.

PL16 can return `resolved` when PL15 mastery is at least Acquired and either:

- current entry quality meets the v1 resolved threshold of **80** without a critical limiter; or
- the explicit high-quality ceiling guard fires.

High-quality ceiling v1:

```text
entry and exit quality >= 90
for the most recent 3 complete phase observations
```

The threshold is read from the versioned policy, not hard-coded in the evaluator.

This prevents mature skills from being mislabeled as “stuck” merely because additional practice yields little measurable gain.

---

## 22. Possible saturation

V1 possible acquisition saturation requires approximately:

```text
>= 5 valid acquisition points
>= 2 independent days
>= 1.5 dose span
recent gain <= 1 point/dose
current quality < 80
plus a material limiter or Learning-stage maturity
```

Confidence remains low at this stage.

---

## 23. Likely saturation

V1 likely saturation strengthens the evidence requirement:

```text
>= 6 valid acquisition points
>= 3 independent days
>= 2.5 dose span
curve confidence >= medium
recent gain in the flat/worsening region
```

Without protected transfer evidence, acquisition saturation is capped at `likely`.

---

## 24. Supported saturation

`Supported` requires the likely acquisition case **plus** corroborating protected transfer evidence.

V1 transfer corroboration:

```text
>= 3 valid transfer points
>= 2 independent transfer days
transfer curve confidence >= medium
recent transfer quality < 80
transfer marginal gain <= 1 point/dose
```

Protected transfer is therefore a stronger confirmation layer, not a prerequisite for every lower saturation status.

---

## 25. Transfer-limited learning

PL16 distinguishes acquisition success from generalization failure.

A transfer-limited pattern requires strong/improving acquisition together with poor flat/worsening protected transfer evidence.

V1 transfer-limited quality threshold:

```text
transfer quality < 70
```

A true transfer quality of `0` is treated as severe valid evidence and must never be replaced by a missing-value fallback.

Transfer-limited status can become `likely` or `supported` depending transfer support.

---

## 26. Reacquisition loop

A likely reacquisition loop has the qualitative pattern:

```text
next-session entry quality: flat
same-session practice gain: high
```

V1 high practice-gain threshold:

```text
median recent practice gain >= 5
```

The interpretation is deliberately narrow: the entity repeatedly improves during practice but the next-session entry curve is not moving comparably.

PL16 does **not** label this “retention failure” or “forgetting”.

---

## 27. Acquisition plateau

A likely acquisition plateau instead has:

```text
entry curve: flat or worsening
same-session practice gain: low
current quality: below resolved threshold
```

V1 low practice-gain threshold:

```text
median recent practice gain <= 3
```

This differentiates “practice itself is no longer producing much gain” from a reacquisition loop.

---

## 28. Overload guard

Repeated very poor performance may reflect practice that is too difficult rather than a true saturation boundary.

V1 recent overload guard examines the latest three complete phase observations:

```text
median entry quality < 40
median exit quality  < 50
```

When this pattern exists, a would-be `likely` or `supported` acquisition plateau is capped at `possible`.

PL16 does not reward repeated failure with stronger plateau certainty.

---

## 29. Limiter mechanism family

PL16 may attach a coarse mechanism family using the existing PL12 primary limiter phenotype:

```text
slow / launch-limited -> motor-speed
inaccurate / hesitant / recovery-heavy / unstable -> control
mixed -> mixed
otherwise -> unknown
```

This is corroborating interpretation only. PL16 does not copy or redefine PL12 limiter formulas.

---

## 30. Global ability trajectory

Entity learning curves and global typing ability are separate.

PL16 derives a temporal ability trajectory only from PL13’s canonical:

```text
channel = cold-natural-text
```

Each point uses PL13’s adjusted WPM and measurement uncertainty.

The ability curve is fitted in log-WPM over elapsed days, using only bounded recent PL13 observations.

Minimum support:

```text
>= 6 observations
>= 3 independent days
>= 7-day span
```

Same-time pairs are ignored rather than dividing by zero.

Status thresholds use weekly relative gain:

```text
improving: >= +1% / week
declining: <= -1% / week
stable:    |gain| <= 0.5% / week
```

Measurement sigma constrains confidence:

```text
medium sigma ceiling: 0.15 log units
high sigma ceiling:   0.12 log units
```

PL16 does not modify the PL13 ability estimator itself.

---

## 31. Recent context dose

Global plateau interpretation requires evidence that the learner has actually been practicing targeted entities recently.

PL16 uses a rolling **14-day** context-dose diagnostic derived from retained acquisition observations.

It reports:

- recent dose units;
- unique targeted sessions;
- independent training days.

A repeated entity session contributes once by its stored acquisition observation identity.

Because entity observation rings are intentionally bounded, extremely dense practice that exceeds the retained per-entity acquisition ring inside the 14-day window may conservatively undercount this diagnostic. This can suppress a global plateau claim; it cannot inflate one or corrupt the entity’s all-time cumulative dose. PL16 deliberately prefers conservative false negatives to unbounded temporal storage.

---

## 32. Global plateau

A global plateau is never inferred from flat ability alone.

Inputs:

```text
PL13 cold-natural ability trajectory
+ recent targeted context dose
+ unresolved entity saturation/limiter signals
```

V1 possible global plateau requires approximately:

```text
stable supported ability trajectory
recent dose >= 5
training days >= 3
```

V1 supported global plateau strengthens this to:

```text
strong stable ability trajectory
recent dose >= 8
training days >= 4
>= 2 corroborating entity signals
```

Global types are coarse:

```text
motor
control
transfer
mixed/unknown where evidence does not support one family
```

No recent practice => `not-detected`, even when ability is flat.

---

## 33. Temporal caching

Static entity evaluation may be cached in memory using versioned fingerprints of:

- profile/context;
- learning model and policy versions;
- curve/observation/saturation/global-plateau versions;
- PL12 limiter model/policy versions;
- PL15 mastery model/policy versions;
- learning-state fingerprint;
- skill-stat fingerprint;
- PL13 ability-state fingerprint.

Time-dependent values are **not** frozen in that static cache.

On every context evaluation PL16 recomputes, using injected `now()`:

```text
recent 14-day dose
global plateau status
```

Therefore a Sep 1 practice dose can naturally age out by Sep 20 even if no data record changed and the static entity cache remains valid.

---

## 34. Atomic session finalization

PL16 learning deltas are committed through the existing completed-session repository transaction alongside the canonical session summary and earlier-phase durable evidence.

Commit ordering protects exactly-once semantics:

1. validate session summary and all evidence batches;
2. validate profile/context ownership;
3. detect an already-completed session before temporal mutation;
4. merge canonical PL11 evidence;
5. merge PL13/PL14 state where requested;
6. merge PL16 learning observations;
7. write all resulting state atomically;
8. clear checkpoint where appropriate.

Replaying the identical completed session is idempotent and cannot double acquisition dose.

A conflicting duplicate cannot mutate PL16 state.

An invalid learning observation batch prevents the entire completed-session write.

---

## 35. Session summary v9

PL16 adds compact `learningEvidenceSummary` to the persisted session summary.

It reports counts such as:

- acquisition observations;
- transfer observations;
- complete vs partial phase observations;
- skipped observations;
- learning-state update count.

It does not contain raw entity event traces or an unbounded list of observations.

The summary count must agree with the committed learning-observation delta batch.

---

## 36. Foundation analysis v7

PL16 advances the immutable foundation-analysis wrapper to version 7 so finalization can expose learning analysis alongside the established latency/error/normalization/skill/ability/performance outputs.

Existing PL8–PL14 evidence semantics remain intact. Earlier tests are intentionally updated only to the new wrapper version, not weakened.

Experiment analyzers receive frozen canonical foundation analysis and cannot overwrite canonical error/learning outputs.

---

## 37. Migration

Historical session summaries are migrated conservatively.

PL16 migration:

```text
sessionSummary 8 -> 9
```

adds:

```text
learningEvidenceSummary: null
```

Historical PL8 sessions are **not** replayed into learning curves.

This is intentional. Old session summaries do not contain the phase-aware direct-target chronology required to reconstruct trustworthy entry/exit acquisition observations. PL16 starts temporal curves prospectively rather than manufacturing retrospective learning evidence.

The full historical session migration chain remains deterministic through v9.

DB v4 -> v5 adds only the `learningStates` store.

---

## 38. Retention and quota recovery

PL16 does not independently age out healthy learning states just because they are old.

When quota retention prunes a canonical PL11 skill stat, the matching learning state is pruned in the same retention plan.

This preserves referential coherence:

```text
no canonical skill stat -> no temporal learning state
```

Learning-state pruning is a cascade of canonical skill-stat pruning, not a competing relevance policy.

---

## 39. Practice reset

Practice reset clears `learningStates` together with the other Practice stores.

Reset does not retain a hidden learning curve or plateau label in local storage.

---

## 40. Context isolation

Learning state is never pooled across contexts.

The same entity can have different:

- cumulative dose;
- entry curve;
- transfer curve;
- practice gain;
- saturation status;

under different keyboard layouts, input methods, language contexts, or other canonical Practice contexts.

No cross-context prior is copied into a new learning state.

---

## 41. Privacy and persistence minimization

Persistent PL16 state is compact numeric/identity evidence only.

Forbidden persisted learning-state material includes:

- raw content text;
- custom text bodies;
- full typed strings;
- raw events;
- event traces;
- target-position arrays;
- containing-word snapshots;
- unbounded diagnostic payloads.

The session engine may inspect transient normalized transitions at finalization because phase chronology cannot be reconstructed from PL11 aggregate counters alone. That transient analysis does not convert the event trace into persistent temporal history.

---

## 42. Performance bounds

PL16 is explicitly bounded.

Key bounds:

```text
acquisition observation ring:     24/entity
transfer observation ring:        16/entity
historical curve fit:              12 points
recent curve fit:                   5 points
session direct targets:            32
transfer observations/session:    256
learning-state persisted size:  32 KiB
snapshot saturation candidates:    16 default
```

Theil–Sen pair construction is therefore bounded by the curve window rather than lifetime history.

No input event performs an unbounded historical scan. Temporal model construction occurs at finalization or snapshot evaluation.

---

## 43. Degradation rules

PL16 fails conservatively when evidence is incomplete.

Examples:

- missing quality coverage -> quality `null`;
- insufficient phase opportunities -> no entry/exit quality;
- restored/truncated chronology -> no fabricated phase quality;
- too few curve points/days/dose -> `insufficient-data`;
- no protected transfer -> acquisition saturation capped below `supported`;
- improving transfer -> blocks a supported transfer-failure claim;
- overload pattern -> caps plateau certainty;
- no recent practice -> blocks global plateau;
- missing PL13 cold-natural evidence -> no global ability trajectory;
- transfer-only entity with no acquisition state -> no new learning state.

Absence of evidence is never silently mapped to perfect quality, zero difficulty, or successful transfer.

---

## 44. Determinism

Given the same:

- canonical PL11 evidence;
- PL16 learning-state observations;
- PL12 limiter evaluation;
- PL15 mastery evaluation;
- PL13 cold-natural ability observations;
- versioned PL16 policy;
- injected evaluation time for rolling context dose;

PL16 returns the same entity curves and saturation interpretation.

There is no random fitting, hidden network dependency, or implicit wall-clock read inside pure model modules.

Time-sensitive context dose is explicit through injected `now()`.

---

## 45. Acceptance coverage

PL16 regression coverage includes:

### Dose and role isolation

- exact 80/50/35/15 dose scales;
- incidental evidence excluded;
- diagnostic and transfer roles excluded from acquisition dose;
- protected transfer adds no acquisition dose.

### Quality

- shared PL15 45/40/15 semantics;
- minimum 60% original weight coverage;
- valid zero quality preserved as evidence.

### Phase chronology

- entry and exit are disjoint;
- middle opportunities cannot contaminate phases;
- short sessions do not fabricate phases;
- restored/truncated sessions keep valid dose/whole quality but null entry/exit/practice gain.

### Curves

- clear improvement;
- flat curve;
- worsening curve;
- outlier resistance;
- same-dose pair exclusion;
- recent vs historical gain;
- entry-quality fitting rather than exit-quality fitting;
- bounded rings with all-time cumulative dose preserved.

### Saturation

- high-quality flat skill resolves;
- active learning blocks plateau;
- approaching saturation;
- acquisition plateau;
- reacquisition loop;
- transfer-limited learning;
- overload certainty cap;
- no-transfer cap at likely;
- supported protected-transfer corroboration;
- policy-driven high-quality ceiling;
- correct reasoning labels.

### Global ability/plateau

- improving/stable/noise-limited PL13 trajectory;
- same-time pair safety;
- 14-day recent-dose window;
- no-practice plateau rejection;
- supported plateau corroboration;
- time advance ages recent dose out even with a valid static cache.

### Persistence

- DB v5 adds only `learningStates`;
- deterministic identity and unique canonical stat link;
- atomic exactly-once merge;
- conflicting duplicate isolation;
- invalid-batch rollback;
- transfer cannot create transfer-only state;
- v8 -> v9 migration adds null learning summary only;
- reset clears temporal state;
- skill-stat retention cascades matching learning state;
- import side-effect isolation;
- 32 KiB state bound;
- no raw-content persistence.

### Cross-phase invariance

Earlier PL5/PL6/PL9/PL13 contracts are re-certified inside the new DB v5/session v9/foundation v7 envelope. Version assertions are advanced, but behavioral expectations are not weakened.

---

## 46. Downstream contract

Later phases may consume PL16 through the learning service rather than reaching into raw storage.

Entity-level output provides, conceptually:

```text
acquisition summary
transfer summary
saturation
marginal gain
PL15 mastery
PL12 limiter interpretation
version diagnostics
```

Context snapshot provides:

```text
status
saturation status counts
bounded saturation candidates
global ability trajectory
global plateau
diagnostics including recent targeted dose
```

Default saturation candidate output is bounded at 16. Callers may request another validated bound up to the service maximum; they may not demand unbounded output.

PL16 describes learning state. It does not decide the next drill.

---

## 47. Interpretation examples

### A. Still learning

```text
Entry quality:       45 -> 50 -> 55 -> 60 -> 65 -> 70
Recent slope:        clearly positive
Current quality:     below mastery ceiling
```

Result: `not-detected` saturation. The skill is improving.

### B. Approaching saturation

```text
Historical curve:    strong improvement
Recent entry quality: 77 -> 77.5 -> 77.6
Recent slope:        low
Quality:             below resolved threshold
```

Result: `approaching`.

### C. Acquisition plateau

```text
Entry quality:       ~60 across several days/doses
Exit quality:        ~62
Practice gain:       small
Transfer:            absent or poor
```

Result: likely acquisition plateau; supported only with sufficient poor/flat protected transfer.

### D. Reacquisition loop

```text
Entry quality:       ~60 each session
Exit quality:        ~70 each session
Practice gain:       large
```

Result: reacquisition-loop evidence. PL16 does not call this forgetting.

### E. Transfer limited

```text
Acquisition entry:   strong/improving, ~85+
Protected transfer:  ~60 and flat
```

Result: transfer-limited.

### F. Mature and flat

```text
PL15 stage:          Acquired+
Entry/exit quality:  consistently >=90
Curve:               flat
Limiter:             not critical
```

Result: `resolved`, not plateau.

### G. Flat ability without practice

```text
PL13 cold-natural ability: stable
recent targeted dose:      0
```

Result: no global plateau claim.

---

## 48. Design principle

PL16 treats “plateau” as a claim requiring temporal evidence, not a label for disappointing performance.

The hierarchy of evidence is intentional:

```text
one session performance
    < same-session entry/exit change
    < repeated entry quality over cumulative dose
    < protected transfer over cumulative dose
    < stable global ability despite substantial recent targeted practice
```

Each stronger interpretation requires stronger, differently structured evidence. That separation is the core PL16 contract.
