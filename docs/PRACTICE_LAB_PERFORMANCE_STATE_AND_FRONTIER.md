# Practice Lab Performance State and Control Frontier — PL14

PL14 adds a temporary performance-state model and a controlled speed–control frontier without changing the meaning of PL13 latent ability.

## Permanent separation

- **Ability** answers “what can this user generally do?” and changes over days to months.
- **State** answers “how is the user performing right now relative to that ability?” and expires on an hours-scale.
- **Control frontier** estimates the highest adjusted pace at which control remains comparable to the user’s own lower-speed baseline before sustained deterioration.
- **Burst capacity** remains a separate short-duration upper reserve.

A poor state probe never writes a lower ability merely because today was poor. A strong warmed-up probe never writes a higher ability unless it independently satisfies PL13. A frontier is not the fastest observed stage.

## Storage and identity

Practice IndexedDB v4 adds `performanceStates`. There is exactly one record per `(profileId, contextId)`, enforced by the unique `profileContext` index. The record contains channel-specific current state, bounded warm-up evidence/models, one controlled-speed frontier model, and a bounded frontier evidence ring. It contains no passage/custom text, raw event trace, or entity lists.

`abilityStates` and `performanceStates` are intentionally separate stores.

## Trusted measurement descriptor

Runtime experiment descriptors may declare:

- `performanceMeasurementKind: null | "state-probe" | "control-frontier"`
- `performanceReferenceChannel`
- `buildPerformanceMeasurement` only for trusted `control-frontier` experiments.

Session configuration cannot set these fields. PL14 v1 also rejects a descriptor that declares both an `abilityChannel` and a performance measurement kind.

## State probe policy v1

A state probe requires completed, untargeted, correction-allowed content, 20–120 seconds active duration, at least 50 typed characters, at least 70% accuracy, and a `time-complete` or `content-complete` completion. Allowed evidence roles are training, diagnostic, transfer, and benchmark. Protected PL6/PL7 content permissions remain unchanged.

State expires after four hours. No timer is installed; current-state queries compare query time with `validUntil`.

### Ability reference and innovation

The probe reuses the exact PL13 adjusted-performance and uncertainty core. For adjusted log performance `Y`, reference ability mean `μ`, reference variance `P`, and probe measurement variance `R`:

- `innovation = Y - μ`
- `combinedVariance = P + R`
- `combinedSigma = sqrt(P + R)`
- `stateZ = innovation / combinedSigma`
- `relativeStateDelta = exp(innovation) - 1`

A missing/unmeasured reference yields no current-state write. Low-confidence ability may produce bounded runtime diagnostics, but the persisted measurement is not eligible for categorical readiness. Normal categorical state requires medium/high ability confidence.

### Pace state v1

Classification requires combined sigma at most `0.20` log units.

- `above-typical`: relative delta at least +3% **and** z at least +0.75.
- `below-typical`: relative delta at most -3% **and** z at most -0.75.
- `typical`: sufficient measurement quality and neither directional condition.
- `uncertain`: insufficient reference/uncertainty or other required evidence.

### Personal control quality

The personal accuracy baseline is the robust median accuracy of up to the 16 most recent PL13 observations for the same channel, requiring at least three observations.

- `preserved`: current accuracy is at least baseline minus 2 percentage points and at least 85%.
- `degraded`: accuracy is more than 2 pp below baseline or below 85%.
- `unknown`: no personal baseline, unless the 85% low-quality guard is breached.

The 85% guard is not the frontier threshold.

### Readiness mapping

`readinessBand` describes relative **typing-performance** readiness only.

- `above-typical + preserved -> elevated`
- `typical + not degraded -> normal`
- `below-typical OR degraded -> reduced`
- uncertain without a degraded-control signal -> `unknown`

It is not a medical, sleep, stress, injury, fatigue, ergonomic, or exercise-safety assessment.

## Warm-up model v1

Warm-up means within-probe typing change, not physiological warming. It is supplementary to the complete-probe state.

Warm-up requires an untruncated trace and at least 45 seconds active duration. PL14 analyzes full 15-second active-time windows, only through the first 90 active seconds. It uses first-attempt events so retries cannot inflate pace. A window requires at least ten first-pass attempts.

For each window:

- `firstPassWpm = (correct first-pass insertions / 5) / window minutes`
- `firstPassAccuracy = correct first-pass / all first-pass attempts`
- PL8 fluent median latency is retained as optional supporting evidence.

The earliest valid full window is the early reference. The late reference is the robust median of the final two valid windows. Warm-up gain is `ln(lateWpm / earlyWpm)` and its relative form is `exp(gain)-1`.

A late accuracy drop greater than 2 pp marks the observation `controlDegraded`; speed gain is not treated as clean evidence. A window is stable when pace is within 3% of the late reference and accuracy is no more than 1 pp below late accuracy. `warmupDurationMs` is the start of the earliest valid window for which it and the next valid window are stable. If no such region is observed, duration remains null.

The evidence ring holds at most 24 observations per channel. A cross-session model needs at least four observations across three days. Median relative gain below 2% becomes `none-observed`; at or above 2%, with sufficient non-degraded evidence, becomes `observed`. The model exposes robust median gain, MAD, typical non-null plateau duration, and bounded confidence. PL14 does not prescribe a warm-up duration.

## Control frontier v1

Only trusted `control-frontier` protocols update the frontier. PL14 provides the contract/model/persistence; Pace Ladder arrives later.

A callback supplies session-local stage candidates. Generic PL14 validates them, applies the same PL13 text-difficulty correction, and creates aggregate points. A valid point needs at least 10 seconds, 25 characters, 70% accuracy, positive WPM, and no declared interruption/major pause. Correction cost is normalized by active duration where supplied. Persisted points contain no stage text.

The ring holds at most 64 valid points, deduplicated by `(sessionId, stageId)` and trimmed chronologically rather than by outcome. The model is rebuilt deterministically from the ring.

### Range and bins

A useful model needs at least five valid points and either at least 15 WPM absolute range or 15% relative range. Speeds are grouped into 5-WPM bins. Bin medians summarize adjusted WPM, accuracy, disfluency rate, correction-cost rate, point count, and session count.

The lower-speed control baseline uses approximately the lowest 40% of non-empty bins, with at least two bins where available. Baseline accuracy below 85% yields `insufficient-control` because there is no responsible stable comparison baseline.

### Relative control loss

For a speed bin:

- `AccuracyDrop = baselineAccuracy - binAccuracy`
- `DisfluencyIncrease = binDisfluency - baselineDisfluency`
- `CorrectionIncrease = binCorrectionRate - baselineCorrectionRate`
- `La = max(0, AccuracyDrop / 2pp)`
- `Ld = max(0, DisfluencyIncrease / 0.05)` where available
- `Lc = max(0, CorrectionIncrease / 0.05)` where available
- `ControlLoss = max(La, Ld, Lc)` over available metrics.

A bin is controlled only when `ControlLoss <= 1` and absolute accuracy is at least 90%. The 90% floor prevents severely inaccurate typing from being labelled controlled; the main thresholds are personal-relative, not a universal 98% rule.

### Sustained failure and interpolation

A frontier requires two consecutive higher-speed uncontrolled bins. The last controlled bin before that run is the lower bracket; the first bin in the failure run is the upper bracket. When losses straddle 1:

`r = (1 - lossLower) / (lossUpper - lossLower)`

`frontierWpm = speedLower + r * (speedUpper - speedLower)`

The result is clamped to the bracket. Degenerate crossings use the bracket midpoint.

If every sufficiently ranged bin remains controlled, status is `lower-bound`: the highest controlled WPM is retained as an explicit lower bound, upper bound is null, and the true frontier may be higher. Mixed non-monotonic evidence without sustained failure remains `provisional`. All-uncontrolled/poor-baseline evidence is `insufficient-control`.

High confidence requires a bracketed frontier, at least eight valid points, at least two sessions, at least 25 WPM range, and full disfluency/correction metric coverage. Medium requires a bracketed frontier, at least five points and 15 WPM range. Useful weaker provisional/lower-bound results are low confidence.

## Burst reserve

When a PL13 burst ability and usable frontier both exist, PL14 can derive (without separately persisting):

- `reserveWpm = burstAbilityWpm - frontierWpm`
- `reserveRatio = burstAbilityWpm / frontierWpm - 1`

Negative reserve is preserved and marked `inconsistent`; it is never clamped and is not interpreted as a limiter diagnosis.

## Atomic session commit

A completed session may supply `performanceStateDelta` alongside PL11 skill evidence and PL13 ability observation. The repository validates and merges it inside the same completed-session transaction. The session-summary duplicate check occurs before any performance merge, so an identical retry applies state/warm-up/frontier evidence once and a conflicting reused session ID mutates nothing.

State-probe merge replaces only a newer current observation. Warm-up evidence is bounded/rebuilt. Frontier evidence is deduplicated/bounded/rebuilt. Ordinary quota retention does not prune performance states; full Practice reset clears the store.

## Foundation/session contracts

PL14 foundation analysis v6 contains `latency`, `errors`, `normalization`, `skills`, `ability`, and `performance`. Ordinary sessions carry a `not-requested` performance analysis and no performance-state delta.

Session summary v8 adds compact `performanceMeasurementSummary`. Historical v7 records migrate with this field set to null; no fake historical readiness, warm-up, or frontier is backfilled.

## Privacy and runtime behavior

PL14 modules are local-only and import-side-effect free. No IndexedDB open, localStorage write, fetch, timer, listener, background monitoring, sensor access, auth/ranked/Supabase path, or public UI is introduced. State/warm-up/frontier analysis runs at finalization/commit, never per keypress. No full session-history or skill-stat scan is required.

## Non-goals and downstream phases

PL14 does not implement Full Assessment, Pace Ladder, Burst Sprints, endurance decay, fatigue/health diagnosis, mastery/automaticity, learning curves, long-term plateau detection, review scheduling, treatment selection, Learning Value, Daily Coach, or public readiness/frontier surfaces.

PL15 mastery remains independent of temporary state. PL16 longer-term learning analysis must not mistake state fluctuations for learning. PL25 may consume readiness/warm-up/frontier/reserve as modifiers. PL26 Pace Ladder must emit PL14 frontier stages rather than invent another frontier. PL27 Burst Sprints updates PL13 burst ability; PL14 only derives reserve.
