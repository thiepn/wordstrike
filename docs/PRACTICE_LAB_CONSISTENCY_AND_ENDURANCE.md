# Practice Lab PL29 — Consistency + Endurance

## Status

PL29 implements two separate sustained-performance constructs already reserved by the Practice catalog:

- `consistency-trainer` — visible training experiment.
- `endurance` — visible surface containing Endurance Practice and Endurance Check.
- `endurance-check` — hidden trusted diagnostic descriptor used only inside the Endurance surface.

PL29 deliberately does **not** create `stamina`, `consistency-endurance`, a 0–100 Consistency score, or a 0–100 Endurance score.

## Construct boundary

**Consistency** asks how variable execution is while typing continuously. **Endurance** asks how well execution is maintained as continuous typing duration increases. Speed, short-timescale variation, directional drift, burst capacity, PL14 control frontier, and standardized Endurance ability therefore remain separate quantities.

A smooth gradual slowdown can have low Consistency variation and material negative drift. A highly variable session can show no clear early-to-late Endurance decline. Neither result identifies physiological fatigue or its cause.

## Architecture and version report

PL29 preserves the existing generic data architecture:

| Contract | Version |
| --- | ---: |
| Practice database | 8 |
| `sessionSummary` record | 13 |
| foundation analysis | 10 |
| Consistency | 1 |
| Consistency policy | 1 |
| Consistency form schema | 1 |
| Consistency guide | 1 |
| Consistency analysis | 1 |
| Consistency result | 1 |
| Endurance | 1 |
| Endurance policy | 1 |
| Endurance form schema | 1 |
| Endurance analysis | 1 |
| Endurance estimator | 1 |
| Endurance result | 1 |
| Sustained-window primitive | 1 |
| PL13 ability model/policy | 1 |

No new IndexedDB store, database-version bump, generic record-version bump, or `foundationAnalysis.consistency/endurance` branch is introduced. PL29 persists experiment-specific bounded aggregates through existing session-summary surfaces, while PL13 continues to own Endurance ability state and PL16 continues to own its trajectory.

## Shared sustained-window primitive

`practiceSustainedWindowAccumulator.js` is the shared streaming primitive for Consistency Trainer, Endurance Practice, and Endurance Check. It owns time-window facts only; product classification remains in the experiment-specific analyzers.

The primitive uses 30-second windows and is bounded to at most 40 windows. Per window it tracks compact aggregates only:

- accepted forward insertions;
- first-pass opportunities and correct first-pass opportunities;
- timing-eligible and disfluent transitions;
- closed correction interval count and correction-cost duration;
- PL9 error episode count;
- first-pass expected-text start/end indices.

It stores no raw passage substring, wrong string, custom text, or raw event history. A transition crossing a window boundary is excluded from both windows' stage-specific timing. A correction episode crossing a boundary contributes its first-pass error to the original window but is excluded from window-specific correction cost. Whole-session PL9 evidence is unaffected.

Per-key work is O(1) / amortized O(1); the live Consistency guide retains only a 15-second timestamp deque.

## Typability adjustment

For a structurally valid window, PL29 scores the static form span traversed on the first pass and reuses the canonical PL10/PL13 adjustment:

```text
A_d = clamp(0.03 × D × C, -0.12, +0.12)
```

If local model coverage is insufficient, the window remains in the analysis with `A_d = 0` and an unadjusted marker rather than being selectively discarded.

## Consistency Trainer

### Protocol

- durations: **3 / 6 / 10 minutes**;
- default: **6 minutes**;
- correction: allowed;
- resumable: false;
- completion: time-complete;
- partition / evidence role: training;
- target entities: none;
- PL13 ability channel: none;
- direct PL16 acquisition dose: zero;
- no user pause control in v1.

The first **30 seconds** are self-selected calibration. The instruction is: “Type naturally at a comfortable pace.”

Calibration anchor:

```text
AnchorGrossWpm = (AcceptedForwardInsertions / 5) / CalibrationMinutes
```

The live guide becomes available only with at least **50 accepted forward insertions** and **70% first-pass accuracy**. Calibration failure does not invalidate or stop the session; only the guide becomes unavailable.

### Live steadiness guide

After calibration, the reference remains fixed for the session. The guide uses the most recent **15 seconds** of accepted forward insertions, requiring at least **20** insertions:

- `< 0.90 × anchor` → `slower`;
- `0.90–1.10 × anchor` → `steady`;
- `> 1.10 × anchor` → `faster`;
- insufficient rolling coverage → `collecting`;
- failed calibration → `unavailable`.

The active UI uses text, not color alone. It does not expose current numeric WPM, target WPM, aggregate live accuracy, a rhythm score, PB, leaderboard, or metronome. Screen-reader pace-state announcements are rate-limited to avoid announcing every small flip.

### Analysis windows

The first 30-second calibration period is excluded from Consistency estimation. The exact post-calibration 30-second window counts are:

- 3 min → **5** windows;
- 6 min → **11** windows;
- 10 min → **19** windows.

A window is structurally valid at approximately 25 seconds or more and at least 25 first-pass opportunities. Low accuracy does not itself remove a window.

### Pace coordinate, trend, variation, and drift

Consistency uses gross forward pace:

```text
GrossForwardWpm_i = (AcceptedForwardInsertions_i / 5) / WindowMinutes_i
Y_i = ln(GrossForwardWpm_i) + A_d,i
```

PL29 estimates a robust directional trend using Theil–Sen regression on elapsed-minute midpoint versus `Y_i`. It then removes that trend before measuring short-timescale variation:

```text
Intercept = median(Y_i - slope × X_i)
R_i = Y_i - (Intercept + slope × X_i)
MAD_R = median(|R_i - median(R)|)
S_R = 1.4826 × MAD_R
PaceVariation = exp(S_R) - 1
PaceVariationPercent = 100 × PaceVariation
```

Directional drift over the span between the first and last valid measurement-window midpoints is:

```text
PaceDrift = exp(slope × T) - 1
```

This separation is essential: variation measures movement around the trend; drift measures the trend itself.

### Pace pattern

- `steady`: variation ≤5% and |drift| ≤5%.
- `variable`: variation ≥8% and |drift| <7.5%.
- `drifting-faster`: drift ≥+7.5% and variation <8%.
- `drifting-slower`: drift ≤−7.5% and variation <8%.
- `mixed`: variation ≥8% and |drift| ≥7.5%.
- `borderline`: sufficient cases between the bands.
- `insufficient`: fewer than five structurally valid post-calibration windows.

### Control stability

Pace consistency remains separate from control consistency. Across structurally valid windows PL29 reports robust MAD-based variation for:

- first-pass accuracy (`AccuracyMADpp`);
- disfluency rate (`DisfluencyMADpp`);
- correction-cost rate (`CorrectionCostMADpp`).

`stable` requires, where fully available, accuracy MAD ≤2 pp, disfluency MAD ≤5 pp, and correction-cost MAD ≤5 pp. A reliable dimension at ≥3 / ≥7 / ≥7 pp respectively yields `variable`; intermediate or incomplete evidence is `partial`, and no usable dimensions yields `insufficient`.

**Consistency Trainer does not create a 0–100 consistency score.**

## Consistency forms

Form set: `WS-CONSISTENCY-EN-1`.

- partition: training only;
- generated forms: 6;
- runtime minimum ready: 4;
- ready forms in v1 artifact: 6;
- minimum form capacity: 22,000 graphemes;
- build-time local window: 600 graphemes / 300 stride;
- hard model coverage: ≥0.90;
- hard local difficulty spread: ≤0.50;
- source provenance must be `practice-display-approved`.

Selection is deterministic and target-blind. Inputs are the session ID, language, form-set identity/version, selection version, and candidate form IDs. No limiter, mastery, saturation, review queue, Coach target, or `skillStats` input participates.

## Endurance Practice

Endurance Practice is repeatable long-form training:

- durations: **5 / 10 / 20 minutes**;
- default: **10 minutes**;
- correction: allowed;
- partition / evidence role: training;
- target entities: none;
- resumable: false;
- direct PL16 acquisition dose: zero;
- **0 PL13 Endurance observations**.

For 10/20-minute Practice, the first 60 seconds is a non-comparison settling period; 5-minute Practice uses 30 seconds. Subsequent 30-second windows provide descriptive sustained-performance results. Five-minute Practice compares its first two valid post-settling windows with its last two; 10/20-minute Practice uses the first four versus the last four.

Practice results are descriptive only and are not treated as standardized Endurance ability measurements.

Training form set: `WS-ENDURANCE-PRACTICE-EN-1`.

- partition: training only;
- generated / ready forms: 4 / 4;
- runtime minimum ready: 2;
- minimum capacity: 44,000 graphemes;
- v1 target capacity: approximately 52,000 graphemes;
- local build window: 800 graphemes / 400 stride;
- model coverage ≥0.90;
- local difficulty spread ≤0.55.

## Endurance Check

### Protocol

The visible Endurance surface launches a hidden trusted descriptor, `endurance-check`:

- fixed total duration: **10 minutes / 600 seconds**;
- evidence role: diagnostic;
- ability channel: `endurance`;
- correction: allowed;
- target entities: none;
- resumable: false;
- user pause: disabled;
- evaluation/retention/assessment bindings: none.

A page-visibility interruption invalidates the canonical Endurance ability measurement because continuous duration is no longer trustworthy. Manual stop also creates no Endurance ability update.

The Check UI shows only the mode and remaining time while typing. No live WPM, accuracy, consistency graph, early/late graph, or “your pace is dropping” warning is displayed.

### Settling and measured period

The first **60 seconds** is a settling period. It can still contribute ordinary diagnostic PL11 evidence but is excluded from canonical Endurance trend and ability estimation.

The remaining **540 seconds** are exactly **18 × 30-second** measured windows, `window-01` through `window-18`.

### Endurance pace coordinate

Endurance uses first-pass effective pace rather than gross pace:

```text
EffectiveWpm_i = (CorrectFirstPass_i / 5) / WindowMinutes_i
Y_i = ln(EffectiveWpm_i) + A_d,i
```

This prevents uncontrolled error volume from being rewarded as sustained useful pace.

### Early versus late

Early baseline: measured windows **1–4**, requiring at least 3 structurally valid windows.

```text
B = median(Y_1..4,valid)
```

Late comparison: measured windows **15–18**, also requiring at least 3.

```text
L = median(Y_15..18,valid)
PaceRetentionRatio = exp(L - B)
PaceRetentionPercent = 100 × exp(L - B)
```

`100%` means equal adjusted first-pass effective pace in the early and late comparison periods; it is not “energy retained.”

### Control change

Counts are pooled, not percentages averaged:

```text
A_early = ΣCorrectFirstPass / ΣFirstPassOpportunities
A_late  = ΣCorrectFirstPass / ΣFirstPassOpportunities
AccuracyDeltaPp = 100 × (A_late - A_early)
```

Disfluency is pooled from timing-eligible/disfluent counts. Correction cost is pooled from closed correction-interval union duration divided by summed active window time. Their late-minus-early changes are `DisfluencyDeltaPp` and `CorrectionCostDeltaPp`.

Material control degradation is present when any reliable condition holds: accuracy ≤−3 pp, disfluency ≥+7 pp, or correction cost ≥+7 pp. Preserved control requires available dimensions to remain within −2 / +5 / +5 pp respectively.

### Endurance pattern

- `stable`: pace retention ≥95% and control preserved.
- `pace-decline`: pace retention ≤92% and no material control degradation.
- `control-decline`: pace retention >92% and material control degradation.
- `mixed-decline`: pace retention ≤92% and material control degradation.
- `rising`: pace retention ≥105% and control preserved.
- `uncertain`: sufficient measurement between decision bands.
- `insufficient`: insufficient early/late structural coverage.

`rising` is not automatically celebrated; continued settling can produce it. A lower late-session result is described as observed decline, **not fatigue**.

### Final-three-minute Endurance ability

The first real PL13 `endurance` provider is owned by the hidden standardized Check. It uses measured windows **13–18**, the final three minutes after substantial prior continuous typing.

Admission requires:

- at least **5 of 6** structurally valid final windows;
- pooled first-pass accuracy across those retained windows ≥**70%**;
- no cherry-picking of a structurally valid low-accuracy window.

The protocol estimate is:

```text
Y_endurance = median(Y_i) over structurally valid final-six windows
SessionEnduranceWpm = exp(Y_endurance)
```

It means robust typability-adjusted first-pass effective typing pace during the final three minutes of the standardized 10-minute protocol. It is not a 10-minute average, maximum sustainable speed, burst capacity, or control frontier.

Exactly **one** valid completed Endurance Check supplies **one** PL13 `endurance` observation. The 18 windows are repeated measurements inside one protocol, not 18 independent ability observations.

### Uncertainty

Each valid final-six window obtains a PL13-compatible 30-second measurement sigma. Let:

```text
sigma_individual = median(sigma_i)
sigma_spread = max(1.4826 × MAD(Y_i), 0.02)
effective n = 4
protocol penalty = 0.03 log units
```

Then:

```text
sigma_endurance = clamp(
  sqrt(sigma_individual^2 / 4 + sigma_spread^2 + 0.03^2),
  0.05,
  0.20
)
```

The equation is versioned by the PL29 Endurance estimator policy. PL13’s recursive latent-state/Kalman update remains unchanged.

The PL13 Endurance channel is now defined precisely as: **robust typability-adjusted first-pass effective typing pace during the final three minutes of the standardized 10-minute Endurance Check, after seven prior minutes of continuous session activity including the one-minute settling period.**

## Endurance Check forms

Form set: `WS-ENDURANCE-CHECK-EN-1`.

- partition: diagnostic only;
- generated / ready forms: 6 / 6;
- runtime minimum ready: 4;
- 22,000–30,000 grapheme capacity;
- local build window: 800 graphemes / 400 stride;
- model coverage ≥0.90;
- stricter local difficulty spread ≤0.40.

The strict local uniformity prevents a difficult late passage from masquerading as time-on-task decline. Selection remains deterministic and target-blind and requires no skill-stat or exposure store.

## Integrity and privacy

All PL29 form manifests bind:

- corpus ID, version, checksum;
- PL7 index schema/checksum;
- PL10 model/reference/checksum;
- frequency reference/version/checksum;
- form schema and generator versions;
- display-approved source provenance and source checksum.

Runtime SHA-256 verification fails closed on stale bindings, altered source material, form text/hash mismatch, insufficient ready forms, wrong partition, or missing cryptographic support. PL29 does not fall back to arbitrary Real Text content.

PL29 persists no passage text, raw typing traces, wrong strings, custom text, or biometric/health inference. Compact form ID/hash and bounded aggregate result fields are sufficient.

## Accessibility and mobile

Duration selectors are native keyboard-accessible controls. Result tables/definitions use semantic labels. The Consistency guide includes text rather than relying on color and has no flashing feedback. Reduced-motion users do not require animated guide movement. Software-keyboard contexts use the existing Practice input engine and remain context-specific; physical-keyboard and mobile Endurance ability states are not pooled across contexts.

## Cross-phase ownership

- PL8 owns robust timing classification.
- PL9 owns correction/recovery episodes.
- PL10 owns typability adjustment.
- PL11 owns persistent incidental skill evidence.
- PL13 owns Endurance latent ability.
- PL14 owns current performance state/control frontier and is not mutated by PL29.
- PL16 owns ability trajectory and continues to derive Endurance trajectory generically from PL13 observations.
- PL24 owns broad Real Text architecture; a 10-minute Real Text session is not an Endurance Check.
- PL26 control frontier remains distinct from Endurance ability.
- PL27 Burst remains distinct from Endurance.
- PL28 Common Words remains distinct from Endurance.
- PL29 owns only the Consistency and Endurance protocols/analyzers.

Daily Coach v1 is intentionally unchanged: the new modes exist but are not automatically scheduled by PL25 policy.

## Tests and certification

PL29 certification covers prerequisites, catalog IDs, descriptors, form generation/integrity, checksums, deterministic target-blind selection, no skill-state selection inputs, Consistency calibration and guide bands, exact analysis-window counts, Theil–Sen trend, detrended MAD variation, drift, control stability, Endurance durations, settling and 18 measured windows, early/late pooling, pace retention, control deltas, Endurance patterns, final-six estimator, pooled accuracy floor, custom uncertainty, one-observation semantics, manual-stop isolation, PL13 policy integration, no generic-score semantics, no unsupported health labels, import/dependency direction, and the complete WordStrike regression suite.

## Non-goals / remaining limitations

PL29 does not implement physiological fatigue measurement, concentration measurement, injury/ergonomic inference, adaptive Endurance duration, Endurance pace targets, Consistency metronome or auditory cadence, automatic Daily Coach scheduling, causal treatment-effect attribution, individualized treatment personalization, or a public Practice release.

PL30 may introduce punctuation/capital/numbers/symbol domains; PL29 prose must not be treated as canonical measurement for those channels. PL32 may later treat `consistency-trainer` and `endurance` Practice as intervention families while keeping `endurance-check` as standardized measurement. PL33 may later learn when either training intervention helps a specific user; PL29 itself makes no causal claim.
