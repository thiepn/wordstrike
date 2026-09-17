# Flow Phase 3 — Flow Meter, Momentum, and Scoring

## Goal

Add the first game layer to the validated natural-typing engine without introducing cadence analysis, chapters, adaptive training, or public launch.

## Flow Meter

- Range: 0–100.
- Starts at 60.
- Correct forward progress raises Flow.
- Clean words and clean sentences add small bonuses.
- Incorrect characters cause a meaningful loss.
- Correcting an incorrect character restores only part of the lost Flow.
- Backspacing a correct character has a small cost.
- Flow reaching 0 does not fail the run; the player can recover.
- Positive gains apply only to new forward progress. Retyping previously reached text cannot farm Flow.

## Momentum

Momentum uses a recoverable charge rather than an all-or-nothing streak.

| Charge | Multiplier |
| ---: | ---: |
| 0–19.99 | ×1.0 |
| 20–39.99 | ×1.2 |
| 40–69.99 | ×1.5 |
| 70–99.99 | ×2.0 |
| 100+ | ×2.5 |

- Correct forward progress builds charge.
- Clean word/sentence completion adds small bonuses.
- Mistakes reduce charge instead of resetting it.
- Correcting an error restores only part of the lost charge.
- Backspacing correct text has a small cost.
- Retyping already reached text cannot farm charge.

## Score

The live and final Flow score is calculated from five visible factors:

1. correct characters × 10 base points
2. passage difficulty multiplier
3. raw keystroke accuracy multiplier
4. average Flow quality multiplier
5. average Momentum multiplier

Difficulty multipliers:

- Smooth: ×1.00
- Natural: ×1.10
- Advanced: ×1.25
- Expert: ×1.45

Raw accuracy uses all inserted keystrokes, so a wrong character still affects accuracy after it is corrected. The accuracy multiplier is `accuracy^1.5`. The Flow multiplier ranges from ×0.75 at average Flow 0 to ×1.25 at average Flow 100.

The score uses the exact rounded factors shown in the result breakdown so the displayed calculation reproduces the final score exactly.

## Speed rule

Phase 3 intentionally does **not** reward faster timestamps. Two runs with identical character/error behavior but different typing speeds must receive the same score. Cadence/rhythm enters in Phase 4.

## Anti-farming rule

Positive Flow/Momentum samples occur only when the current character moves beyond the furthest index previously reached. Backspacing and retyping cannot inflate Flow, Momentum, or score.

## UI requirements

During a run show:

- live score
- 0–100 Flow Meter
- Momentum multiplier
- raw accuracy
- corrected errors
- unresolved errors

At completion show:

- final Flow score
- raw accuracy
- average/peak Flow
- average/peak Momentum
- corrected/unresolved errors
- exact score-factor breakdown

## Deliberate non-goals

Phase 3 does not add:

- public Flow launch
- cadence/rhythm analysis
- pause-based Flow decay
- chapter/run progression
- modifiers
- adaptive training
- persistence/history
- leaderboards
- large content-library expansion

## Exit condition

The developer Flow route exposes a fair, recoverable Flow Meter and Momentum system, produces an auditable score that does not directly reward typing speed, prevents backspace/retype farming, and passes desktop/mobile browser certification while all Phase 0–2 public behavior remains unchanged.
