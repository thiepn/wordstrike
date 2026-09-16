# Practice Lab PL32 — Treatment Response

## Status

PL32 adds local longitudinal **Treatment Response** tracking to Practice Lab. It links a prospectively recorded Practice treatment to later compatible measurements and summarizes the observed within-user response pattern.

This system is **observational**, not causal. It does not establish that a Practice treatment caused a later change, does not classify users as responders/non-responders, and does not claim treatment effectiveness. Practice outside WordStrike is not observed.

## Core doctrine

Treatment Response follows these rules:

1. Treatment intent and protocol identity are recorded prospectively, before treatment exposure.
2. Same-session Baseline/Check changes are never used as delayed treatment-response evidence.
3. Outcomes must occur later, on a different local day, after the configured minimum delay.
4. Only canonical measurements produced by the existing Practice measurement systems are eligible.
5. The first compatible delayed outcome fills an outcome slot; it is not replaced by a later, more favorable value.
6. When one outcome could belong to multiple prior treatments, it belongs to the most recent eligible treatment. Older competing episodes are marked confounded/superseded.
7. Intervening recorded Practice is audited for contamination. Relevant later treatment can downgrade or invalidate attribution.
8. Repeated targeted probe material is recorded but excluded from primary aggregation.
9. Custom Text overlap is treated as uncertain because PL31 deliberately does not expose standardized target/effect evidence.
10. UI wording remains descriptive: observed response, evidence depth, delay, contamination, and uncertainty.

PL32 adds no randomization, control group, null-hypothesis test, p-value, causal model, or effectiveness ranking.

## Eligible treatment registry

Treatment identity is owned by `practiceTreatmentRegistry.js`. A treatment family contains the experiment ID/version, material protocol versions, flow, and protocol variant.

### Targeted treatments

- Weak Keys
- Combination Repair
- Problem Words
- Accuracy & Recovery

These freeze the direct target, target stat identity, protocol fingerprint, prospective Baseline identity, and related explanatory targets.

### Broad treatments

- Real Text Practice
- Common Words Practice
- Endurance Practice
- Punctuation & Capitals Practice
- Numbers & Symbols Practice

Broad treatment response uses the compatible standardized ability channel rather than same-session training output.

### Hybrid treatment/measurement protocols

- Consistency Trainer
- Pace Ladder
- Burst Sprints

A later same-family hybrid session may act as both new treatment exposure and the measurement for a prior treatment. That measurement is permanently graded as `hybrid-measurement`; hybrid-only evidence cannot reach High evidence depth.

### Excluded modes

Measurement-only or private/custom modes do not create treatment episodes, including Full Assessment, standardized Checks, benchmark/cold-transfer measurement flows, retention review, Daily Coach review, and Custom Text.

Daily Coach can assign an otherwise eligible treatment. Assignment kind (`manual` or `coach`) is stored and summarized separately; it does not change the treatment protocol identity.

## Prospective Treatment Episode

`practiceTreatmentEpisode.js` creates a versioned derived record before exposure. Important fields include:

- profile/context identity
- treatment session ID
- treatment family key
- protocol fingerprint and variant
- targeted entity/stat identity when applicable
- assignment kind
- planned time
- exposure start time
- completion time and local day
- prospective Baseline snapshot
- bounded related-target identities
- immutable delayed outcome contracts
- contamination/audit state

Raw event traces, passage text, typed buffers, Custom Text source, auth tokens, and submission payloads are forbidden from PL32 records by `practiceTreatmentValidation.js`.

Prepared episodes expire if treatment never starts. Incomplete episodes become `invalid`; an invalid episode with recorded exposure can still contaminate attribution for an earlier treatment.

## Baselines

### Targeted Baseline

The Baseline is the target-specific pre-treatment phase of the current targeted protocol. PL32 freezes:

- quality
- quality coverage
- opportunity count
- first-pass accuracy when available
- normalized residual latency when available
- disfluency when available
- launch/internal residual and disfluency components when available
- protocol/probe identity and probe-family/hash information

The Baseline must be measured before Focus/Control treatment exposure starts.

A later targeted session can provide a retest for an earlier episode using its new Baseline, because that Baseline occurs before the later session's new treatment exposure. After the new exposure starts, remaining earlier target outcomes can be marked contaminated.

### Ability Baseline

Broad/Burst response uses the pre-treatment PL13 ability state:

- log-speed mean `mu0`
- log-speed variance `P0`
- confidence/evidence count
- estimator/policy versions
- channel

Low-confidence ability baselines can be displayed descriptively but do not enter primary clean aggregation.

### Consistency Baseline

Consistency uses a prior compatible complete PL29 consistency result with the same duration and analysis contract, within the bounded baseline age.

### Control-frontier Baseline

Pace Ladder uses the pre-treatment PL14 frontier state. Scalar response is allowed only when the relevant states are bracketed and version-compatible. Lower-bound states remain interval-only.

## Delayed outcome contracts

Each treatment episode freezes its outcome slots at creation.

### Targeted

1. same-protocol later Baseline retest
2. mature fresh PL17 retention review
3. fresh valid PL18/PL16 cold-transfer evidence

### Broad

A later compatible PL13 ability observation in the matching channel.

### Hybrid

- Consistency Trainer → later compatible PL29 consistency result
- Pace Ladder → later compatible PL14 control frontier
- Burst Sprints → later compatible PL13 burst ability observation

Hybrid contracts require a longer minimum delay and are never treated as independent clean measurements.

## Delay policy

Outcome eligibility requires:

- a different session
- a strictly later timestamp
- a different local day
- the contract minimum delay
- a bounded maximum tracking window
- matching profile/context
- matching target/domain/protocol/model constraints

Response states separate observations into:

- `next-day`: up to 3 days
- `short`: 4–14 days
- `long`: over 14 days

Expired unfilled outcome slots become `expired` rather than being backfilled retroactively.

## Exact response calculations

### Targeted quality

For comparable target measurements:

`qualityDelta = outcomeQuality - baselineQuality`

Additional descriptive deltas are retained where available:

- first-pass accuracy percentage-point change
- residual latency change in milliseconds
- disfluency percentage-point change
- launch/internal residual changes

Positive quality change is better; lower residual/disfluency values are represented by negative raw deltas and interpreted through the target response model.

### Ability

Using the frozen pre-treatment ability state and later PL13 observation:

`d = y - mu0`

`observedResponsePercent = 100 * (exp(d) - 1)`

`sigmaD = sqrt(P0 + measurementVariance)`

`z = d / sigmaD`

The z value is a descriptive uncertainty normalization, not a hypothesis test and not a p-value.

### Consistency

Primary response is improvement in pace variation:

`variationResponsePp = baselineVariation - outcomeVariation`

Drift improvement and pace/control tradeoffs are also recorded. A lower-variation result is not treated as positive if it is achieved with a material speed or control deterioration.

### Control frontier

For compatible bracketed scalar frontiers:

`frontierResponsePercent = 100 * (outcomeFrontier / baselineFrontier - 1)`

Lower-bound/provisional cases remain interval-only and do not enter scalar aggregation.

## Attribution and contamination

`practiceTreatmentLinker.js` assigns each candidate once.

### Most-recent eligible attribution

If one outcome matches multiple open episodes, the newest eligible treatment receives it. Older competing episode slots are marked `superseded-by-later-treatment` rather than sharing the same outcome.

### Recorded contamination levels

- `none`: no relevant recorded WordStrike exposure found
- `background`: other recorded Practice occurred but is not directly explanatory
- `uncertain`: attribution cannot be resolved responsibly, including Custom Text overlap
- `material`: later same-target, related-target, or same-domain treatment can explain the outcome

An `invalid` later treatment is not ignored if it had real exposure. Partial/incomplete treatment can still be material contamination.

### Hybrid exception

A later same-family hybrid protocol temporarily preserves the prior hybrid outcome slot so its own canonical end-of-session measurement can serve as the prior outcome. If a usable measurement is produced, it is stored as hybrid evidence. If not, later attribution audits still see that exposure as contamination.

### Repeated targeted material

Later target Baselines carry frozen probe family IDs and a probe hash. Repeated material is allowed as descriptive evidence but is excluded from primary clean aggregation.

## Response aggregation

`practiceTreatmentResponseState.js` stores a bounded ring of up to 64 derived samples per response state. A state is partitioned by:

- profile/context
- treatment family
- target entity type when relevant
- outcome kind
- delay bucket
- response unit/model version

Aggregation uses robust summaries:

- median observed response
- median absolute deviation (MAD)
- practical deadband threshold
- positive/negative/deadband counts
- distinct local days
- distinct targets for targeted families
- manual vs Coach assignment counts
- contaminated sample count

Patterns are descriptive:

- Not enough evidence
- Positive observed signal
- Little observed signal
- Negative observed signal
- Mixed observed signal

Evidence depth is Insufficient / Low / Medium / High. Targeted Medium/High depth requires multiple distinct targets; High requires broader repeated evidence. Hybrid-only states are capped at Medium.

## Persistence and DB10

PL31 is preserved as a DB9 snapshot in `practiceConstantsV31.js`. PL32 upgrades the active Practice database to **DB10** without changing `sessionSummary` record version 13.

New stores:

- `treatmentEpisodes`
- `treatmentResponseStates`

DB10 also adds the compound session index:

`[profileId, contextId, completedAtUtc]`

This supports bounded contamination interval reads without scanning the full session history in IndexedDB. Memory/test stores use a filtered fallback.

PL32 storage is bounded:

- maximum open episodes per context
- maximum episodes per profile
- maximum response states per profile
- maximum 64 samples per state
- episode byte limit
- prepared/invalid/closed retention horizons

Malformed derived records fail closed, are rejected on writes, omitted from reads, and are eligible for derived-data cleanup. Canonical Practice records are not modified by PL32 validation failure.

## Commit safety

PL32 is a post-commit sidecar.

`practiceSessionEngine.js` passes a repository wrapper into the certified PL31 engine. The canonical Practice repository commit completes first. Only after that commit succeeds does PL32:

1. flush pending exposure chronology writes
2. build canonical outcome candidates from upstream analyses
3. link outcomes to prior episodes
4. finalize the current treatment episode
5. reconcile expiry
6. prune bounded derived tracking state

PL32 errors are caught and logged after the canonical commit. They cannot roll back or invalidate canonical skill, ability, performance, learning, retention, assessment, or Daily Coach evidence.

Because the hook is attached at `commitCompletedPracticeSession`, it covers both explicit completion and legacy engine auto-completion.

## Upstream measurement ownership

PL32 does not re-estimate upstream measurements. It consumes canonical outputs from:

- PL13 ability observations/states
- PL14 performance/control frontier
- PL16 learning transfer observations
- PL17 retention review
- PL18 protected evaluation integrity
- PL25 Daily Coach assignment binding
- PL28 Common Words
- PL29 Consistency/Endurance
- PL30 punctuation/numbers domains
- PL31 Custom Text only as an uncertainty boundary, never standardized outcome evidence

This keeps measurement ownership in the phase that originally defined and certified it.

## Progress UI

Practice Lab's existing Progress route now exposes a developer-preview Treatment Response view. It is read-only and route-lazy-loads the PL32 storage runtime only when Progress is opened.

The view shows:

- treatment/protocol
- target or general domain
- outcome type
- delay bucket
- median observed response
- observed pattern
- evidence depth
- eligible sample count
- distinct days/targets
- manual vs Coach counts
- contaminated exclusions
- hybrid-only caveat
- recent prospective episode status

The non-causal doctrine remains visible on the page. The UI does not display p-values, effectiveness ranks, responder labels, or causal language.

## Versioning and compatibility

Treatment episode, registry, baseline, outcome policy, contamination policy, response model, and response state each carry explicit PL32 version constants. Incompatible response model/protocol versions are not silently pooled.

Historical PL28–PL31 certification continues inside the DB10 envelope. PL31's DB9 storage snapshot remains explicit and independently testable.

## Certification

PL32 has dedicated Node certification for:

- DB10/storage envelope
- registry inclusion/exclusion and protocol variants
- prospective Baseline/exposure chronology
- exact response formulas
- delay and same-day guards
- first-compatible and most-recent outcome attribution
- contamination and Custom Text uncertainty
- targeted Baseline-before-exposure exception
- repeated probe protection
- robust bounded response aggregation
- hybrid evidence-depth cap
- hybrid treatment/measurement preservation
- incomplete-exposure contamination
- derived record privacy/validation
- compound interval query path
- post-canonical sidecar ordering and auto-completion coverage
- Progress UI observational wording and route-level lazy loading

Release requires the existing generic Practice tests, PL28–PL31 certification, and non-Practice/typing/customization browser regressions to remain green as well.
