# Flow Phase 1 — Natural Typing Engine

## Goal

Implement the minimum viable natural-typing engine for Flow before adding scoring, cadence analysis, progression, or content systems.

## Required behavior

- Type complete passages at character level.
- Support letters, spaces, capitalization, punctuation, apostrophes, quotation marks, numbers, and backspace.
- Render current, correct, incorrect, and pending character states.
- Preserve unresolved mistakes when the passage completes.
- Record corrected mistakes when an incorrect character is removed with backspace.
- Record raw keystroke, error, correction, word-completion, and sentence-completion timestamps.
- Work with a 200+ character passage that wraps naturally on desktop and mobile.
- Keep Flow architecture separate from Campaign, Typing Test, Endless, and retired Arcade Rush gameplay rules.

## Deliberate non-goals

Phase 1 does not implement:

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

A user can launch Flow from Mode Select, type the full validation passage with corrections, reach a clean terminal state, and inspect deterministic typing telemetry without borrowing another mode's gameplay engine.
