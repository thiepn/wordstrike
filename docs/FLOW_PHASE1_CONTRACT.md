# Flow Phase 1 — Natural Typing Engine

## Goal

Implement the minimum viable natural-typing engine for Flow before adding scoring, cadence analysis, progression, content systems, or public launch.

## Required behavior

- Type complete passages at character level.
- Support letters, spaces, capitalization, punctuation, apostrophes, quotation marks, numbers, and backspace.
- Render current, correct, incorrect, and pending character states.
- Preserve unresolved mistakes when the passage completes.
- Record corrected mistakes when an incorrect character is removed with backspace.
- Record raw keystroke, error, correction, word-completion, and sentence-completion timestamps.
- Work with a 200+ character passage that wraps naturally on desktop and mobile.
- Keep Flow architecture separate from Campaign, Typing Test, Endless, and retired Arcade Rush gameplay rules.
- Expose the Phase 1 engine only through the explicit developer route `?dev=1&mode=flow`.
- Preserve the Phase 0 public Mode Select contract: Flow remains visible but coming soon.

## Deliberate non-goals

Phase 1 does not implement:

- public Flow launch
- Flow meter
- momentum
- Flow scoring
- cadence/rhythm analysis
- passage library expansion
- chapters
- modifiers
- adaptive training
- progression
- leaderboards

## Exit condition

The developer Flow route can type the full validation passage with corrections, reach a clean terminal state, and expose deterministic typing telemetry without borrowing another mode's gameplay engine. Normal public Mode Select still treats Flow as coming soon.
