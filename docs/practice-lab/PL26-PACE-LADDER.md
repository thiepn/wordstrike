# PL26 — Pace Ladder

## Status

Canonical protocol version: **2**  
Experiment version: **2**  
Policy version: **2**

Pace Ladder remains a developer-gated Practice Lab preview. GC1 replaces the superseded v1 calibration/five-stage/validation protocol without changing the public Practice gate.

## Canonical protocol

Pace Ladder contains exactly one 30-second Reference followed by eight 20-second controlled pace rungs:

| Segment | Ratio | Duration |
| --- | ---: | ---: |
| Reference | — | 30 s |
| Rung 1 | 0.75 | 20 s |
| Rung 2 | 0.85 | 20 s |
| Rung 3 | 0.95 | 20 s |
| Rung 4 | 1.05 | 20 s |
| Rung 5 | 1.15 | 20 s |
| Rung 6 | 1.25 | 20 s |
| Rung 7 | 1.10 | 20 s |
| Rung 8 | 0.90 | 20 s |

Total active typing is **190,000 ms**. There is **no validation phase**. The descending final rungs, `1.25 → 1.10 → 0.90`, are intentional and must not be reordered.

## Anchor selection

Canonical priority is:

1. a fresh reliable PL14 control frontier;
2. otherwise the in-session 30-second Reference.

A PL14 frontier anchor is eligible only when the existing frontier representation supports:

- status `bracketed` or `lower-bound`;
- confidence `medium` or `high`;
- age <= 45 days.

When the Reference must supply the raw anchor, it is measurement-valid only with:

- accepted forward insertions >= 50;
- first-pass accuracy >= 70%.

The 70% floor is a measurement-validity floor, not a recommended accuracy target.

Where PL10 text-difficulty adjustment is valid, Pace Ladder reuses that model to reconstruct/adjust the raw anchor. It does not introduce another difficulty model.

## Rung targets

For rung `i`:

`TargetWpm_i = clamp(RawAnchorWpm × Ratio_i, 5, 400)`

The implementation retains 0.1 WPM internal target precision. The 400 WPM cap is an engineering bound, not a statement about human maximum speed.

## Pace guide

The guide is a pace-position guide, not a live actual-WPM display.

`TargetCharsPerSecond = TargetWpm × 5 / 60`

`PaceOffsetSeconds = (ActualForwardProgress - ExpectedProgress) / TargetCharsPerSecond`

Guide band: **±0.75 seconds**.

States:

- `behind`
- `on-pace`
- `ahead`

Pace Ladder shows no live actual WPM and does not use a metronome.

## Rung measurement

PL14 stage speed uses actual gross accepted-forward pace:

`ObservedGrossWpm = (AcceptedForwardInsertions / 5) / StageMinutes`

The ordinary Practice session `wpm` formula is unchanged; this is protocol-specific PL26 stage measurement.

Control metrics per rung are:

- first-pass accuracy;
- PL8 disfluency;
- PL9 correction-cost rate.

Timing transitions crossing rung boundaries are excluded from rung-specific PL8 latency. Correction-cost windows crossing rung boundaries are likewise excluded from rung-specific correction-cost metrics. A first-pass error remains attributed to the rung where it occurred.

The streaming accumulator is bounded to **9 stage summaries**: one Reference plus eight rungs. No full raw trace is required.

## PL14 frontier ownership

At least **5 valid rung points** are required before Pace Ladder can supply a frontier measurement batch. PL14 continues to own frontier calculation, bracket/lower-bound status, and confidence. Pace Ladder does not create a replacement frontier model.

Pace Ladder creates **zero PL13 ability observations** and **zero PL16 direct acquisition dose**.

Lower-bound results must retain lower-bound wording such as `at least X WPM`; they must not be displayed as an exact frontier.

## Result semantics

The canonical result table contains eight rung rows in this order:

75%, 85%, 95%, 105%, 115%, 125%, 110%, 90%.

Rows may expose target pace, observed gross pace, first-pass accuracy, correction/disfluency diagnostics, and pace-guide adherence where supported. The obsolete validation row is not part of v2 results.

## Treatment identity and history

Canonical PL26 uses experiment/protocol/policy version 2 and PL32 treatment-family variant `ladder-canonical-v2`. Historical v1 sessions remain under their old protocol identity. They are not migrated, reinterpreted, pooled with v2 response history, or launchable as new sessions.

## Content

The existing `WS-PACE-EN-1` form set remains the canonical content identity. The content audit established eight ready forms. GC1 reuses those healthy forms because their text is sufficiently long and not structurally bound to the obsolete five-stage schedule; only material protocol/session identity changes.
