# Flow Phase 9 — Modifiers

## Goal

Add explicit opt-in run modifiers that change narrow Flow rules or content selection without replacing the typing engine, cadence model, chapter controller, or public gating.

## Modifier set

### Calm
Training modifier. Mistake and correct-backspace Flow/Momentum losses are reduced to 60%; correction recovery is increased to 120%. Score multiplier: ×0.90.

### Precision
Challenge modifier. Mistake losses are ×1.35, correct-backspace losses ×1.25, and correction recovery ×0.50. Score multiplier: ×1.12.

### No Backspace
Challenge modifier. Backspace never changes typed state. Blocked attempts are recorded separately. Score multiplier: ×1.15.

### Dialogue
Content modifier. Strongly biases passage selection toward dialogue, quotes, apostrophes, and conversational text. Score multiplier: ×1.03.

### Longform
Content modifier. Biases selection toward longer passages and long-sentence punctuation patterns. Score multiplier: ×1.05.

### Symbols
Content modifier. Strongly biases passage selection toward numbers, symbols, and mixed punctuation. Score multiplier: ×1.08.

### Sprint
Run-shape modifier. Uses one passage per chapter while preserving the selected chapter arc. Score multiplier: ×1.10.

### Clean Run
Challenge modifier. The ×1.20 bonus is applied only while the run has zero raw incorrect keystrokes. A raw mistake permanently forfeits the Clean Run bonus for that run.

## Conflict groups

The last selected modifier replaces another modifier in the same group:

- Calm ↔ Precision
- Dialogue ↔ Symbols
- Longform ↔ Sprint

No Backspace and Clean Run can stack with any non-conflicting selection.

## Scoring

Modifier scoring is transparent and applied after the existing character × difficulty × accuracy × Flow × Momentum formula.

Base runs with no modifiers retain a modifier multiplier of ×1.000, preserving Phase 3 scoring exactly.

## Phase gate

Phase 9 is available only with:

`?dev=1&mode=flow&flowRun=1&flowUi=1&flowUx=1&flowModifiers=1`

Selected modifiers are serialized in `flowModifierIds` as a comma-separated normalized list.

## Deliberate non-goals

Phase 9 does not add:

- adaptive weakness targeting
- automatic modifier recommendations
- persistence/history
- modifier unlock progression
- modifier leaderboards
- public Flow launch
- new passage-library expansion

## Exit condition

A developer-gated Flow run can select compatible modifiers, preserve them through the canonical setup handoff, enforce their engine/planner/scoring effects, display active modifiers during the run, and report transparent modifier results without changing Phase 8 or public Flow behavior.
