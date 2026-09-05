# Practice Lab Limiter Attribution & Real-World Impact Model

Status: PL12 diagnostic interpretation foundation  
Practice database structural version: 2 (unchanged)  
Skill-stat record version: 3 (unchanged)  
Session-summary record version: 6 (unchanged)  
Checkpoint record version: 3 (unchanged)  
Foundation-analysis version: 4 (unchanged)  
Limiter snapshot version: 1  
Limiter model version: 1  
Limiter policy version: 1  
Impact model version: 1  
Hierarchy model version: 1  
Prevalence model version: 1

## 1. Purpose

PL11 established the persistent observational truth for Practice skill entities. PL12 is the first layer that interprets that evidence diagnostically.

The distinction is permanent:

```text
PL11
WHAT HAS BEEN OBSERVED?
        ↓
PL12
WHAT DOES THAT EVIDENCE SUGGEST?
```

PL12 may identify a likely mechanism, evidence strength, practical burden, prevalence coverage, and hierarchical redundancy. It does not select a treatment or decide what the learner should practice next.

The canonical PL12 flow is:

```text
PL11 SKILL EVIDENCE
        ↓
DIMENSION-SPECIFIC CONFIDENCE
        ↓
EFFECT ESTIMATION
        ↓
LIMITER PHENOTYPE
        ↓
REFERENCE PREVALENCE
        ↓
REAL-WORLD BURDEN
        ↓
HIERARCHICAL REDUNDANCY ANALYSIS
        ↓
CONTEXT LIMITER RANKING
```

## 2. Persistence boundary

PL12 limiter results are derived views, not primary persistent truth.

PL12 does **not**:

- add an IndexedDB store;
- bump `PRACTICE_DATABASE_VERSION`;
- bump `skillStat.recordVersion`;
- bump `sessionSummary.recordVersion`;
- bump `foundationAnalysis.version`;
- write `weaknessScore` or `priorityScore` back to `skillStats`;
- write a limiter snapshot into profile dashboard state;
- write a persistent limiter cache.

Canonical PL11 evidence remains the source of truth. A PL12 snapshot can be rebuilt whenever peer evidence, prevalence references, hierarchy policy, or model versions change.

Existing top-level skill-stat fields named `weaknessScore` and `priority` are legacy/non-authoritative placeholders. PL12 defines authoritative **derived** `weaknessScore` and `priorityScore` only inside limiter candidate results.

## 3. Model versions

PL12 v1 exports:

```text
PRACTICE_LIMITER_SNAPSHOT_VERSION = 1
PRACTICE_LIMITER_MODEL_VERSION = 1
PRACTICE_LIMITER_POLICY_VERSION = 1
PRACTICE_IMPACT_MODEL_VERSION = 1
PRACTICE_HIERARCHY_MODEL_VERSION = 1
PRACTICE_PREVALENCE_MODEL_VERSION = 1
```

Every context snapshot reports these versions explicitly.

## 4. Canonical limiter dimensions

PL12 evaluates six dimensions independently:

```text
slow
hesitant
inaccurate
recovery-heavy
launch-limited
unstable
```

The dimensions remain separate until phenotype selection. A candidate is not reduced to a single score before each mechanism has been estimated.

## 5. Dimension result contract

Each dimension returns a bounded, structured result containing:

```text
type
status
severityScore
evidenceConfidenceScore
evidenceConfidenceLevel
weightedSeverity
effect
baseline
evidence
reasons
```

`reasons` are bounded reason codes rather than generated prose. Current codes include:

```text
positive-residual
elevated-disfluency
elevated-error-rate
slow-recovery
word-launch
high-variability
low-evidence
prevalence-unavailable
hierarchy-explained
```

## 6. Dimension status policy

Dimension status values are:

```text
insufficient-evidence
not-elevated
possible
likely
confirmed
```

These are engineering evidence states, not medical or scientific certainty claims.

PL12 v1 engineering-policy thresholds are:

```text
insufficient-evidence:
  confidence < 25
  OR required effect evidence unavailable

not-elevated:
  sufficient evidence
  AND severity < 20

possible:
  severity >= 20
  but stronger status criteria not met

likely:
  severity >= 35
  AND confidence >= 50

confirmed:
  severity >= 50
  AND confidence >= 80
```

## 7. PL11 confidence reuse

PL12 deliberately does not invent an unrelated confidence scale. It reuses `computePracticeEvidenceConfidence(stat, dimension)` from PL11.

Mapping:

```text
slow            → normalized-residual
hesitant        → disfluency
inaccurate      → accuracy
recovery-heavy  → errors
launch-limited  → word-launch
unstable        → normalized-residual
```

Dimension ranking uses:

```text
WeightedSeverity = SeverityScore × ConfidenceScore / 100
```

The derived candidate weakness score is:

```text
WeaknessScore = max(WeightedSeverity across all six dimensions)
```

`weaknessScore` is clamped to `0..100` and contains no prevalence term.

## 8. Peer-reference population

Rate baselines use PL11 stats from the same:

```text
profile
context
entityType
```

Keys are compared with keys, bigrams with bigrams, trigrams with trigrams, and words with words.

The target entity is excluded exactly from pooled rate/recovery totals. V1 eligibility requires:

```text
minimum peer entities:       8
minimum peer opportunities:  200
minimum peer general confidence: 25
minimum peer recovery episodes: 12
minimum peer variability entities: 8
```

Pooled accuracy/hesitation/recovery references use precomputed totals so leave-one-out calculation is O(1) per target.

For robust median/MAD fallback distributions, v1 computes one sorted distribution per entity type for bounded performance. The target is excluded from the reported peer count, while the robust center/scale use the full eligible distribution. This is a deliberate low-leverage approximation in the rare fallback path; exact per-target MAD recomputation would create an entity-by-peers pass. The primary slow path does not depend on this fallback when compatible PL10 residual/raw aggregates exist.

## 9. Slow dimension

Meaning:

> Fluent, correct, first-pass execution is slower than the PL10 expected context baseline.

Primary PL11 evidence:

```text
evidence.timing.fluentResidual
evidence.timing.fluentLatency
```

### 9.1 Residual shrinkage

For residual count `n` and mean residual `r`:

```text
K_s = 12
w = n / (n + K_s)
ShrunkResidualMs = w × r
```

The prior is `0 ms`, because PL10 residual zero means performance consistent with context expectation.

### 9.2 Relative effect

When fluent raw latency and fluent residual aggregates cover the same count:

```text
ObservedMean = fluentLatency.meanMs
ResidualMean = fluentResidual.meanMs
ExpectedApprox = ObservedMean - ResidualMean
```

Require `ExpectedApprox > 0`.

Then:

```text
RelativeSlowdown = ShrunkResidualMs / ExpectedApprox
```

Only positive slowdown contributes to limiter severity:

```text
max(0, RelativeSlowdown)
```

### 9.3 Severity scaling

PL12 v1 engineering-policy values:

```text
<= 3% slower   → severity 0
>= 30% slower  → severity 100
between        → linear interpolation
```

Raw latency alone never determines slow severity.

### 9.4 Robust fallback

If compatible raw/residual overlap is unavailable but a peer residual reference exists:

```text
peerCenter = median(shrunk peer residual means)
peerMAD    = MAD(...)
peerScale  = max(10 ms, 1.4826 × peerMAD)
Z_r        = (entity residual - peerCenter) / peerScale
```

Engineering scaling:

```text
Z <= 0.5  → 0
Z >= 3.0  → 100
```

The result reports:

```text
effectMode = peer-robust-fallback
```

## 10. Hesitant dimension

Meaning:

> The entity enters PL8's disfluent state more often than comparable entities.

Primary evidence:

```text
timing.disfluentCount
timing.eligibleCount
timing.disfluentResidual
```

Peer baseline:

```text
p0 = peerDisfluent / peerEligibleTiming
```

Entity values:

```text
d = disfluentCount
n = eligibleTimingCount
K_h = 20
```

Smoothed rate:

```text
pHat = (d + K_h × p0) / (n + K_h)
ExcessDisfluency = max(0, pHat - p0)
```

Engineering severity scaling:

```text
<= 0.02 excess  → 0
>= 0.15 excess  → 100
```

A shrunk positive `disfluentResidual.meanMs` is also exposed for impact calculation, but the base hesitant severity is rate-relative. A context where every peer is near 20% disfluent does not make a 21% entity a severe entity-specific hesitation limiter.

## 11. Inaccurate dimension

Meaning:

> First-pass error rate is elevated relative to the user's comparable context/entity-type baseline.

Only PL11 first-pass opportunity evidence is used:

```text
opportunities.errorCount
opportunities.count
```

Peer baseline:

```text
p_error0 = peerErrors / peerOpportunities
```

Entity values:

```text
e = errorCount
n = opportunityCount
K_a = 30
```

Smoothed rate:

```text
pErrorHat = (e + K_a × p_error0) / (n + K_a)
ExcessErrorRate = max(0, pErrorHat - p_error0)
```

Engineering severity scaling:

```text
<= 0.01 excess  → 0
>= 0.08 excess  → 100
```

Final corrected-text accuracy is not used. Global poor accuracy is intentionally not mislabeled as an entity-specific inaccurate phenotype when the target is only marginally worse than its peers.

## 12. Recovery-heavy dimension

Meaning:

> When errors occur at the entity, observed correction/recovery behavior is unusually expensive relative to peer errors.

Primary evidence:

```text
errors.primaryEpisodeCount
errors.correctionInitiation
errors.errorToRepair
errors.correctCharactersRemovedCount
```

The peer recovery baseline pools PL11 `errorToRepair` aggregates and requires at least 12 peer recovery episodes.

```text
RecoveryRatio = EntityRecoveryMean / PeerRecoveryMean - 1
```

Engineering severity scaling:

```text
<= 25% slower recovery  → 0
>= 150% slower recovery → 100
```

Over-deletion:

```text
OverDeletionPerEpisode = correctCharactersRemovedCount / primaryErrorEpisodeCount
```

When this is at least `1`, v1 may add a bounded boost of at most `+15` severity points. Over-deletion alone cannot create a recovery-heavy diagnosis.

`errorToRepairMs` is an **observed recovery window**. PL12 does not claim it is causal time lost relative to an error-free counterfactual.

## 13. Launch-limited dimension

This dimension applies to word entities only.

Meaning:

> Starting the word is impaired while internal execution is materially less impaired.

Primary evidence:

```text
launchTiming.fluentResidual
launchTiming.disfluentResidual
```

Launch residual uses the same K=12 zero-prior shrinkage and relative slowdown engineering scale as `slow`.

V1 launch candidate rule:

```text
launch severity >= 35
AND
(
  internal slow severity < 20
  OR
  launch severity >= internal slow severity + 20
)
```

Launch disfluency may add a bounded modifier. The current v1 modifier saturates at a 20% launch-disfluency rate and contributes at most `+15` severity points.

If launch and internal execution are similarly impaired, PL12 does not label the word exclusively `launch-limited`.

## 14. Unstable dimension

Meaning:

> Recent context-normalized fluent performance varies much more than comparable entities.

Primary evidence:

```text
timing.fluentResidual.recentSamples
```

Minimum evidence:

```text
recent residual samples >= 8
observation sessions >= 2
peer variability entities >= 8
```

Entity variability:

```text
EntityMAD = MAD(recent residual samples)
```

Peer reference:

```text
peerMADCenter = median(peer entity MAD values)
InstabilityRatio = EntityMAD / max(peerMADCenter, 5 ms)
```

Engineering severity scaling:

```text
ratio <= 1.5 → 0
ratio >= 3.0 → 100
```

Instability is not synonymous with disfluency. V1 also avoids aggressive hierarchy suppression of instability.

## 15. Primary phenotype

Canonical phenotypes:

```text
none
slow
hesitant
inaccurate
recovery-heavy
launch-limited
unstable
mixed
insufficient-data
```

If no dimension has sufficient evidence, phenotype is `insufficient-data`.

If sufficient dimensions exist but none has severity at least 20, phenotype is `none`.

Otherwise the highest weighted severity is primary unless the mixed rule applies.

### 15.1 Mixed rule

The top two dimensions must both satisfy:

```text
WeightedSeverity >= 35
```

and:

```text
Second / First >= 0.80
```

Then:

```text
primaryPhenotype = mixed
mixedTypes = [top, second]
```

V1 returns at most two mixed types.

## 16. Weakness is not impact

This distinction is central to PL12.

`weaknessScore` answers:

> How abnormal/problematic does this entity appear, considering evidence confidence?

`impactScore` answers:

> How much practical typing burden does this candidate have relative to other currently evidenced candidates in this context?

A rare severe weakness may have high weakness and low impact. A common moderate weakness may have lower weakness but greater practical impact.

Prevalence never modifies `weaknessScore`.

## 17. Prevalence provider

PL12 defines a user-independent prevalence-provider contract:

```text
getEntityPrevalence({ language, entityType, entityKey })
```

Result:

```text
status
language
entityType
entityKey
opportunitiesPer1000Graphemes
quality
sourceId
sourceApproval
sourceChecksum
referenceVersion
segmentationVersion
tokenizationVersion
```

Canonical statuses:

```text
reference
practice-proxy
unavailable
```

### 17.1 Reference eligibility

A production `reference` result is accepted only when the supplied source metadata says:

```text
sourceType = statistical-reference
```

and usage approval is explicitly either:

```text
statistical-only
practice-display-approved
```

No source type, license string, or source name implicitly grants reference status.

### 17.2 Current repository reference state

The current PL6 provenance registry contains only:

```text
ws-original-en-foundation-v1
sourceType: wordstrike-original
usageApproval: practice-display-approved
sourceChecksum:
sha256-d7da8abebbefc2558b55b84d22d2c6e4756c3749c8b1a13d6d04c968ee4e03e0
```

This is approved Practice display material, not an approved natural-language statistical frequency reference. Therefore PL12 v1 does **not** claim population-level English prevalence from it.

No arbitrary external frequency list is downloaded or added by PL12.

## 18. Training-corpus practice proxy

When a statistical reference is unavailable, PL12 may use PL7 training-partition occurrence counts as a low-authority proxy.

The proxy provider queries only:

```text
partition = training
purpose = training
```

It never queries transfer, benchmark, diagnostic, or research-holdout partitions for prevalence fitting.

Rate:

```text
opportunitiesPer1000Graphemes
= 1000 × training corpus occurrence count / training grapheme count
```

The current English foundation PL7 manifest is bound to:

```text
corpusId: practice-en-v1
corpusVersion: 1
corpusChecksum:
sha256-28beccf65eed71519da306c129da5040a20f364aed320dc21eea2d16c2a1c404
segmentationVersion: 1
tokenizationVersion: 1
training graphemes: 145
training content records: 2
```

The runtime proxy constructor also accepts an injected index checksum/fingerprint. That identity participates in the prevalence-provider fingerprint and therefore invalidates the in-memory limiter cache when the bound index reference changes.

The proxy status is always:

```text
practice-proxy
```

It is not described as real-world population frequency.

## 19. Prevalence quality weights

Engineering-policy weights:

```text
reference       1.00
practice-proxy  0.60
unavailable     0
```

`unavailable` never means zero prevalence. It means no responsible estimate is available.

Prevalence is language-specific. The service normalizes locale to base language. An English provider does not answer German requests.

## 20. Performance burden model

PL12 calculates separate burden components before aggregation.

Let:

```text
O = opportunities.count
P = opportunitiesPer1000Graphemes
```

If `O == 0`, performance burden is unavailable.

### 20.1 Fluent-speed burden

```text
B_slow/opportunity
= fluentCount / O
× max(0, ShrunkFluentResidualMs)
```

This naturally allows word internal transition count per word opportunity to exceed one.

### 20.2 Hesitation burden

```text
B_hesitation/opportunity
= disfluentCount / O
× max(0, ShrunkDisfluentResidualMs)
```

### 20.3 Word-launch burden

For word entities:

```text
B_launch/opportunity
= launchFluentCount / O × max(0, ShrunkLaunchFluentResidualMs)
+ launchDisfluentCount / O × max(0, ShrunkLaunchDisfluentResidualMs)
```

### 20.4 Recovery burden

When error episodes and recovery timing exist:

```text
B_recovery/opportunity
= primaryErrorEpisodeCount / O
× errorToRepairMeanMs
```

The component reports:

```text
kind = observed-recovery-window
```

It is not an exact causal time-loss estimate.

### 20.5 Missing components

Missing evidence is never silently converted to zero.

If error episodes exist but `errorToRepair` timing is absent, recovery component status is `partial` and impact coverage is reduced.

Negative residuals produce zero limiter burden; PL12 does not award negative benefit credit that cancels another weakness.

## 21. Burden per 1000 reference graphemes

Available component burden per opportunity is multiplied by prevalence:

```text
ComponentBurdenMsPer1000
= ComponentBurdenMsPerOpportunity × P
```

PL12 exposes:

```text
fluentSpeedBurdenMsPer1000
hesitationBurdenMsPer1000
launchBurdenMsPer1000
recoveryBurdenMsPer1000
estimatedPerformanceBurdenMsPer1000
```

The canonical total is named `estimatedPerformanceBurdenMsPer1000`, never `exactTimeLostMs`.

Reasons:

- prevalence is reference/proxy-based;
- recovery is an observed-window proxy;
- hierarchical entities overlap;
- model uncertainty remains.

## 22. Impact coverage and status

Coverage weights are coverage accounting, not severity weights.

Word intended coverage weights:

```text
fluent speed  0.35
hesitation    0.25
recovery      0.25
launch        0.15
```

For non-word entities, the intended non-launch components are renormalized by their total intended weight.

Impact statuses:

```text
full
partial
prevalence-proxy
unavailable
```

`prevalence-proxy` takes precedence whenever the PL7 training proxy supplies prevalence.

## 23. Context-relative impact score

Raw milliseconds are heavy-tailed and are not mapped directly to a universal score.

For candidates in one context whose impact is available:

```text
x = log1p(estimatedPerformanceBurdenMsPer1000)
```

PL12 computes an empirical midrank percentile:

```text
percentile
= 100 × (count(x_i < x) + 0.5 × count(x_i == x)) / N
```

Ties therefore receive the same stable midrank.

Quality-adjusted impact:

```text
ImpactScore = ImpactPercentile × PrevalenceQualityWeight
```

Clamped to `0..100`.

This is a **context-relative** percentile, not a population percentile.

## 24. Priority score

PL12 priority means diagnostic importance, not treatment selection.

```text
PriorityScore
= ImpactScore
× PrimaryDimensionConfidence / 100
× HierarchyPenalty
```

If impact is unavailable:

```text
priorityScore = null
```

`null` means cannot responsibly estimate. It is not converted to zero.

PL12 priority contains no:

- treatment-effect history;
- review due state;
- user exercise preference;
- learning saturation;
- practice-duration recommendation;
- trainability estimate.

## 25. Canonical hierarchy

V1 hierarchy:

```text
key
  ↑
bigram
  ↑
trigram
  ↑
word
```

The arrows are explanatory relationships, not persistence ownership.

PL11 timing semantics are respected: bigram/trigram timing represents the transition ending at the final grapheme.

### 25.1 Bigram

```text
bigram "br"
→ terminal key "r"
```

The prefix key may be retained for explanation metadata but is not summed into the timing explanation ratio.

### 25.2 Trigram

```text
trigram "str"
→ terminal bigram "tr"
```

### 25.3 Word internal execution

Words are decomposed into constituent overlapping bigrams using canonical Practice grapheme segmentation.

Example:

```text
problem
→ pr ro ob bl le em
```

Repeated bigrams retain multiplicity by word position.

### 25.4 Word launch

V1 can use the first key as a directly comparable lower-level launch explainer. More sophisticated boundary bigram/trigram modeling remains available for later extension.

## 26. Hierarchy eligibility

A lower-level entity may explain a higher-level candidate only when:

1. the relevant mechanism is comparable;
2. the child dimension is `likely` or `confirmed`;
3. child confidence is at least `parent confidence - 10`;
4. effect direction is positive/comparable;
5. the explanation ratio meets a versioned threshold.

## 27. Explanation ratios and status

For terminal relationships:

```text
ExplanationRatio = positive child effect / positive parent effect
```

clamped to `0..1`.

Word internal timing uses the mean available constituent-bigram effect divided by the word internal effect, with missing constituents implicitly providing no explanatory coverage rather than being imputed.

Statuses:

```text
independent
partially-explained
explained
```

Engineering thresholds:

```text
partial   >= 0.35
explained >= 0.65
```

`explainedBy` is bounded to three child stat IDs.

Recovery explanation is capped at partial in v1 because higher-level correction behavior may reflect strategy rather than just the local lower-level fault.

Instability is not hierarchy-suppressed in v1.

## 28. Hierarchy penalty

Engineering-policy penalties:

```text
independent           1.00
partially-explained   0.75
explained             0.40
```

Hierarchy penalty modifies only `priorityScore`.

It does **not** modify `weaknessScore` or PL11 evidence.

## 29. Primary limiter list

`primaryLimiterIds` is bounded by `PRACTICE_LIMITS.primaryLimiterIds` (currently 8).

Normal eligibility requires:

```text
candidate status = likely or confirmed
priorityScore != null
```

Possible candidates remain inspectable but are not promoted by default.

An `explained` higher-level candidate is suppressed from the primary list only when an explainer is itself likely/confirmed, has known impact, and has comparable or higher priority.

If the explainer has unknown impact, the parent is not blindly hidden.

## 30. Candidate output bounds

The model may evaluate all context stats internally for peer references, but ordinary returned candidate output is bounded.

Default:

```text
maxCandidates = 256
```

Per-type output caps:

```text
key      64
bigram   96
trigram  64
word     64
```

Only entities with nonzero weakness or possible/likely/confirmed status normally enter returned candidate output.

Raw PL11 recent sample arrays are never copied into candidate objects.

## 31. Context limiter snapshot

The immutable snapshot contains:

```text
snapshotVersion
modelVersion
policyVersion
impactModelVersion
hierarchyModelVersion
prevalenceModelVersion
profileId
contextId
generatedAt
status
evidenceSummary
referenceSummary
primaryLimiterIds
candidates
diagnostics
```

Snapshot statuses:

```text
ready
partial
insufficient-data
unsupported-context
```

Current v1 semantics:

- `insufficient-data`: no useful diagnostic evidence;
- `unsupported-context`: phenotype evidence exists but no prevalence estimate is available;
- `partial`: useful impact exists but reference coverage is incomplete or proxy-based;
- `ready`: useful impact exists with full reference prevalence coverage.

Because the current repository has no approved population prevalence source, normal English foundation use through the PL7 proxy is expected to be `partial`, not `ready`.

## 32. Pure core and service boundary

`buildPracticeLimiterSnapshot(...)` is the pure model core. It accepts canonical PL11 stats, one context, resolved prevalence values, an injected generated time, and policy.

`createPracticeLimiterModel(...)` is a thin repository service. It reads only:

```text
context
skillStats for profile + context
```

plus the injected static prevalence provider.

It does not read raw event traces, Custom Text records, session-engine state, leaderboards, ranked state, Supabase, or auth.

Construction is side-effect free.

## 33. In-memory cache

PL12 permits only an in-memory context snapshot cache.

The current service cache key binds:

```text
contextId
limiter model version
limiter policy version
impact model version
hierarchy model version
prevalence model version
bounded skill-evidence fingerprint
prevalence-provider fingerprint
maxCandidates
```

The evidence fingerprint includes stat identity/update time and canonical PL11 opportunity/timing/error counters.

A changed stat or prevalence-provider fingerprint therefore misses the cache. Explicit context invalidation is also available.

No cache record is written to IndexedDB or localStorage.

## 34. Performance architecture

The intended complexity is approximately:

```text
O(number of context skill stats)
```

plus sorting required for robust distributions and candidate ranking.

Key safeguards:

- pooled peer totals are precomputed per entity type;
- leave-one-out pooled rates subtract the current entity in O(1);
- robust reference arrays are sorted once per entity type;
- impact burden percentiles sort once and use binary-search midranks;
- hierarchy candidates are held in entity-key maps for constant-time child lookup;
- word decomposition is bounded by word length;
- returned candidates remain capped.

The PL12 acceptance stress test builds a 2,500-stat snapshot well below the multi-second guard and verifies output remains bounded.

## 35. Retention audit

PL12 does not persist priority, so retention must not depend on a derived PL12 cache.

`practiceRetention.js` now prunes skill stats using canonical persistent evidence:

1. PL11 `confidenceScore`;
2. canonical evidence amount from opportunities/timing/launch/error episodes;
3. targeted session count;
4. last observed/update recency;
5. deterministic stat ID tie-break.

Legacy top-level skill `priority` is not used for skill-stat retention.

Removed v2 `sampleCount` is not required for v3 pruning.

Review-item priority remains separate review-domain data and is not changed by PL12.

## 36. Role handling

PL12 phenotype calculations consume the canonical overall PL11 evidence aggregate. Training, transfer, benchmark, diagnostic, and custom observations therefore contribute only through the evidence PL11 already accepted.

PL12 v1 does not give benchmark samples special weight.

Training oversampling cannot raise prevalence, because prevalence comes from an independent statistical reference or the static PL7 training corpus proxy rather than how often WordStrike showed the target to the current user.

Custom key/bigram/trigram evidence may influence phenotype evidence; custom content exposure does not modify prevalence.

Formal transfer-gap mastery and role-disagreement inference are intentionally deferred.

## 37. Privacy

PL12 candidate results may contain canonical safe entity keys already present in persistent PL11 skill stats.

They do not contain:

- containing sentences;
- Custom Text content;
- raw event traces;
- user-entered wrong strings;
- content-family history;
- reconstructed private custom word entities.

PL11's default `allowCustomWordEvidence = false` remains unchanged and is regression-tested in PL12.

## 38. Import/runtime side effects

Importing PL12 modules performs:

```text
0 IndexedDB opens
0 localStorage writes
0 fetches
0 listeners
0 timers
```

Static prevalence/index loaders remain lazy and are invoked only by the injected provider/service when a snapshot is requested.

## 39. No session-engine integration

PL12 does not change the Practice Session Engine.

It does not alter:

- input handling;
- checkpoint lifecycle;
- session finalization;
- `foundationAnalysis`;
- PL11 evidence collection;
- atomic session commits.

A later Home/Coach/UI layer may request a snapshot after evidence has been committed. Full limiter recomputation is never part of a keystroke or atomic commit path.

## 40. Public UI

PL12 does not expose Limiter Model, Weakness Score, Impact Score, or Priority Score in public Practice UI.

The result is an internal derived diagnostic contract for later phases.

## 41. Explainability

Each candidate preserves separate fields for:

- dimension severities;
- dimension-specific confidence;
- effect estimates;
- peer baseline status;
- weakness score;
- prevalence status/quality;
- burden components;
- impact percentile/score;
- hierarchy explanation;
- priority score;
- bounded reason codes.

No single opaque score replaces those components.

## 42. Acceptance coverage

PL12 focused tests cover:

- slow residual shrinkage and relative severity;
- negative residual behavior;
- robust slow fallback;
- hesitation shrinkage and global-high baseline behavior;
- first-pass inaccuracy shrinkage and global-poor baseline behavior;
- recovery ratio and over-deletion modifier;
- launch-limited separation;
- robust instability;
- confidence gating;
- mixed phenotype;
- weakness score definition;
- statistical-reference eligibility;
- training-only prevalence proxy and language isolation;
- component burden and missing recovery coverage;
- common-moderate versus rare-severe impact;
- empirical percentile tie handling;
- prevalence quality weighting;
- bigram/trigram/word hierarchy;
- hierarchy confidence guards;
- conservative recovery/instability hierarchy policy;
- context isolation;
- in-memory cache reuse and invalidation;
- retention independence from legacy priority/sampleCount;
- no persistent snapshot writes;
- import side effects;
- forbidden dependency isolation;
- bounded 2,500-stat performance.

The normal repository test workflow remains the final full WordStrike regression gate.

## 43. Current limitations

PL12 still does **not** implement:

- stable general typing ability;
- sustainable WPM;
- burst reserve;
- control frontier;
- current readiness;
- mastery;
- automaticity;
- learning curves;
- acquisition saturation;
- review/retention scheduling;
- user-goal/domain weighting;
- treatment selection;
- Learning Value;
- Daily Coach;
- formal transfer verification policy;
- treatment-effect personalization;
- public Skill Map UI.

The current English prevalence fallback is a tiny Practice training-corpus proxy, not a population language-frequency reference. Its quality weight and snapshot status intentionally reflect that limitation.

## 44. PL13 contract

PL13 Ability Estimator + Measurement Uncertainty operates at a higher level using session performance, text difficulty, context, and measurement noise to estimate stable typing ability.

PL12 must not infer stable ability from entity limiter evidence.

## 45. PL15 contract

PL15 may combine PL12 limiter evidence with PL11 role evidence to distinguish acquired, transferred, robust, and retained skill states.

PL12 does not set mastery or automaticity.

## 46. PL17 contract

Later review-value scheduling may consume impact, limiter status, confidence, mastery, and decay.

PL12 supplies only the limiter/impact inputs and does not modify `reviewItem.priority`.

## 47. PL25 contract

Daily Coach may later combine:

```text
PL12 impact + limiter type
PL13 ability/state
PL15 mastery
PL16 learning curve
PL17 review state
treatment history
user goal
```

into Learning Value.

Therefore PL12 `priorityScore` must remain narrower than Coach priority.

## 48. Final architectural rule

After PL12, Practice Lab must never equate:

```text
weakest
```

with:

```text
most important
```

The reasoning chain is:

```text
PL11
WHAT DO WE KNOW?
        ↓
PL12 DIMENSIONS
WHAT KIND OF PROBLEM IS IT?
        ↓
CONFIDENCE
HOW SURE ARE WE?
        ↓
PREVALENCE
HOW OFTEN DOES THIS MATTER?
        ↓
BURDEN
HOW MUCH PERFORMANCE BURDEN IS ASSOCIATED WITH IT?
        ↓
HIERARCHY
IS THIS A ROOT PROBLEM OR A MANIFESTATION?
        ↓
LIMITER SNAPSHOT
```

Treatment selection begins only after those questions have been answered by later phases.
