# PL29 — Consistency + Endurance closure

PL29 implements two intentionally distinct sustained-performance constructs:

- **Consistency Trainer** measures short-timescale execution variability around a robust within-session pace trend.
- **Endurance** separates repeatable 5/10/20-minute training from a standardized 10-minute diagnostic Check.

## Consistency protocol

- Durations: 3 / 6 / 10 minutes; default 6 minutes.
- Calibration: first 30 seconds.
- Live guide: 15-second accepted-forward rolling sample, minimum 20 insertions, ±10% around the fixed calibration gross pace.
- Analysis: consecutive 30-second post-calibration windows (5 / 11 / 19 windows).
- Pace variation: detrended robust MAD on typability-adjusted log gross-forward pace.
- Pace drift: Theil–Sen trend converted over the measured span.
- Control variation remains separate: first-pass accuracy, disfluency, and correction-cost MADs.
- No 0–100 consistency score, PB, leaderboard, target WPM, or generic consistency ability channel.

## Endurance Practice

- Durations: 5 / 10 / 20 minutes; default 10 minutes.
- Training role only; zero PL13 endurance observations.
- 30-second sustained windows after a 30-second settling period for 5-minute practice and a 60-second settling period for 10/20-minute practice.
- Results are descriptive and are not treated as standardized Endurance ability.

## Endurance Check

- Fixed total duration: 10 minutes.
- Settling: first 60 seconds.
- Measured period: 18 × 30-second windows.
- Early comparison: windows 1–4.
- Late comparison: windows 15–18.
- Pace retention: `100 × exp(L - B)` using medians of typability-adjusted log first-pass effective pace.
- Control changes pool first-pass accuracy, timing/disfluency, and closed correction-cost counts over the early and late windows.
- Patterns: stable / pace-decline / control-decline / mixed-decline / rising / uncertain / insufficient.
- No fatigue, exhaustion, concentration, health, or causal inference.

## PL13 endurance ability

Only the trusted hidden `endurance-check` descriptor owns `abilityChannel = "endurance"`.

A valid Check uses measured windows 13–18 (the final three minutes), requires at least 5 of 6 structurally valid windows and pooled first-pass accuracy of at least 70%, and estimates session performance from the median adjusted log first-pass effective pace.

Uncertainty is versioned as:

`clamp(sqrt(sigma_individual^2 / 4 + sigma_spread^2 + 0.03^2), 0.05, 0.20)`

where `sigma_individual` is the median compatible per-window sigma and `sigma_spread = max(1.4826 × MAD(Y_i), 0.02)`.

One completed valid Check creates exactly one PL13 endurance observation. The existing PL16 generic ability-trajectory machinery can then track the endurance channel. No new endurance history store exists.

## Architecture and persistence

PL29 reuses PL8 timing classification, PL9 correction/recovery episodes, PL10 typability adjustment, PL11 incidental evidence, PL13 ability state, and PL16 trajectories. The shared sustained-window accumulator stores bounded aggregate window facts only and retains at most 40 windows. It does not persist raw text, raw event traces, or wrong strings.

Generic persistence remains unchanged:

- Practice DB: v8
- sessionSummary: v13
- foundationAnalysis: v10
- no new IndexedDB store

PL29 protocol/version constants are all v1, including the sustained-window contract.

## Content integrity

Static generated Consistency, Endurance Practice, and Endurance Check form families are target-blind, partition-specific, locally typability-uniform, and bound to the current corpus, PL7 index, PL10 reference/frequency source, form schema, generator version, and checksums. Stale or mismatched artifacts fail closed instead of falling back to generic Real Text.

## Verification

Before merge:

- all 323 canonical WordStrike test files passed locally in the repository's sorted suite;
- PL29 certification passed 28/28;
- PL13/import-side-effect focused regression passed 39/39;
- the GitHub bootstrap independently rebuilt all three form families and passed PL29 certification;
- GitHub pull-request CI is the final unchunked suite/browser/artifact gate.

## Non-goals

PL29 does not implement physiological fatigue measurement, concentration measurement, injury/ergonomic inference, adaptive endurance duration, endurance pace targets, a consistency metronome, auditory cadence, automatic Daily Coach scheduling, treatment-effect causality, individualized treatment personalization, or public Practice release.
