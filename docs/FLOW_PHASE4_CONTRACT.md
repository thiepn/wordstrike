# Flow Phase 4 — Cadence and Natural-Typing Analysis

## Goal

Measure how smoothly a player types continuous natural text without confusing absolute speed with rhythm quality.

## Core analysis

- Build inter-key intervals only across uninterrupted insert sequences.
- Exclude gaps containing backspace from cadence timing; correction time is measured separately.
- Derive each player's baseline from their own observed inter-key timing.
- Detect pauses using `max(500 ms, 3 × baseline)` rather than one fixed global threshold.
- Detect burst intervals relative to the player's own baseline.
- Compute a 0–100 cadence score from robust timing variability, relative pauses, and burst rate.
- Report cadence labels: Warming up, Locked in, Steady, Variable, Uneven.
- Report raw WPM and final WPM independently from cadence.
- Report correction count, total/median/average correction cost.
- Measure word-transition latency and feature-specific hesitation around commas, sentence endings, semicolons/colons, capitals, apostrophes, quotation marks, and numbers.
- Surface the three largest positive hesitation deltas relative to the player's baseline.

## Fairness rules

- Slow but consistent typing can earn the same cadence score as fast but consistent typing.
- Cadence does not use absolute WPM as an input.
- Backspace repair gaps do not count as cadence pauses.
- The Phase 3 Flow Score remains timestamp-independent in Phase 4. Cadence is descriptive only until its measurement model has been validated.
- Fewer than five usable inter-key intervals reports `Warming up` instead of manufacturing a cadence score.

## Developer UI

The gated Flow route displays live Cadence, WPM, and relative pause count alongside Score, Flow, and Momentum. Results add cadence, raw/final WPM, pause/burst counts, correction cost, baseline timing, relative pause threshold, and the largest hesitation hotspots.

## Deliberate non-goals

Phase 4 does not implement:

- cadence as a score multiplier
- pause-driven Flow Meter decay
- chapter/run structure
- modifiers
- adaptive training
- persistence/history
- leaderboards
- public Flow launch

## Exit condition

Flow can distinguish smooth from erratic typing at comparable speed, treat slow-consistent and fast-consistent typing fairly, isolate correction time from rhythm analysis, identify meaningful natural-language hesitation patterns, and expose stable analysis in both live and result surfaces without changing the Phase 3 scoring contract.
