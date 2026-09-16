# Flow Phase 5 — Run Structure and Chapters

## Goal

Turn Flow from a single-passage developer prototype into a complete multi-chapter session while preserving the Phase 1–4 typing, content, gameplay, scoring, and cadence contracts.

## Session profiles

### Quick
- target: ~3 minutes
- 3 chapters
- 2 passages per chapter
- chapter sequence: Settle In → Precision → Final Flow

### Standard
- target: ~6 minutes
- 6 chapters
- 2 passages per chapter
- chapter sequence: Settle In → Momentum → Precision → Complexity → Pressure → Final Flow

### Long
- target: ~10 minutes
- 6 chapters
- 4 passages per chapter
- same six-chapter escalation with longer sustained sections

## Chapter escalation

The selected Flow difficulty is treated as the run ceiling.

- Smooth runs remain Smooth.
- Natural runs open Smooth and then move to Natural.
- Advanced runs progress Smooth → Natural → Advanced.
- Expert runs progress Natural → Advanced → Expert.

A chapter never selects a passage above that chapter's assigned difficulty.

## Passage selection

The Phase 2 catalog remains the source of content.

- selection is deterministic by seed
- selected category is a preference/focus, not an absolute lock
- chapter-specific tags are preferred where available
- unused eligible passages outrank repeated passages
- immediate passage repeats are strongly suppressed
- repetition is allowed only when the current catalog/difficulty pool is genuinely too small
- the later content-expansion phase is responsible for eliminating those fallback repeats

## Continuous run state

A complete chapter run uses one Flow typing run.

The following do **not** reset between passages or chapters:

- Flow Meter
- Momentum
- score
- raw accuracy
- corrected/unresolved error history
- cadence baseline and analysis

This prevents chapters from becoming disconnected mini-tests.

## Chapter transitions

Between chapters Flow shows a lightweight transition with:

- chapter number
- chapter title
- chapter description
- chapter difficulty
- passage/word count
- current score
- current cadence

The user explicitly continues into the next chapter.

Transition time:

- is recorded as a deliberate chapter pause
- is excluded from Cadence interval analysis
- is excluded from WPM typing duration
- does not damage Flow or Momentum in Phase 5

## Developer route

Example:

`?dev=1&mode=flow&flowRun=1&flowLength=quick&flowCategory=mixed&flowDifficulty=advanced&flowSeed=phase5-demo`

Supported run lengths:

- `quick`
- `standard`
- `long`

Phase 1–4 single-passage developer routes remain valid when `flowRun=1` is absent.

## Deliberate non-goals

Phase 5 does not implement:

- public Flow launch
- final visual redesign
- public pre-run configuration UI
- modifiers
- adaptive training
- history/persistence
- leaderboards
- cadence as a score multiplier
- pause-driven Flow decay
- large content expansion

## Exit condition

Flow can execute deterministic Quick, Standard, and Long multi-chapter runs, carry one continuous gameplay/analysis state across passages, show chapter transitions without corrupting Cadence/WPM, complete with one final result, and preserve all earlier public and regression contracts.
