# Flow Phase 10 — Adaptive Weakness Training

## Goal

Use a completed Flow run to identify repeatable typing weaknesses and bias the next run toward them without replacing natural-language Flow with drill text.

## Evidence model

Adaptive weaknesses may come from:

- capital-letter hesitation
- apostrophe hesitation
- quotation-mark hesitation
- comma-transition hesitation
- sentence-transition hesitation
- semicolon/colon hesitation
- number hesitation
- repeated errors inside words of 8+ letters
- recurring expected-character → typed-character error pairs

A single isolated timing sample or typo does not create a weakness. Timing features require multiple samples and a meaningful delay relative to the player's own cadence baseline; error features require repetition.

## Profile lifecycle

Phase 10 deliberately does not persist cross-session history.

1. A Flow run completes.
2. The current run snapshot is analyzed into a confidence-gated weakness profile.
3. `TRAIN THESE NEXT` serializes that profile into the next Flow route.
4. The next deterministic run reserves roughly 20% of its passages as weakness-focus slots.
5. The remaining roughly 80% use the normal Flow planner.
6. At the end of the adaptive run, the new run is analyzed again.

Persistent multi-run learning belongs to Phase 11.

## Focus ratio

- Quick base run: 1 / 6 focus passages (~16.7%)
- Standard base run: 2 / 12 (~16.7%)
- Long base run: 5 / 24 (~20.8%)
- Sprint Quick: 1 / 3 (coarser because only three passages exist)

Focus slots are distributed through the run rather than placed first.

## Selection rules

Adaptive selection:

- uses only the validated Flow passage catalog
- keeps the normal difficulty ceiling
- preserves chapter structure
- preserves modifier behavior
- never rewrites passage text
- adds a strong content-fit preference only on designated focus slots
- keeps normal category/chapter/content weighting on all other slots

## Scoring

Adaptive training has no score multiplier, bonus, or penalty.

## UI

The explicit Phase 10 route uses `flowAdaptive=1`.

Without a serialized weakness profile, the setup shows a calibration state. After a qualifying run, results show measured weaknesses and `TRAIN THESE NEXT`. Adaptive runs show their focus ratio on setup and a small `Focus passage` strip only during targeted passages.

## Non-goals

Phase 10 does not add:

- persistent weakness history
- automatic cross-session learning
- cloud sync
- progression/unlocks
- AI-generated text
- score changes
- leaderboard categories
- public Flow launch
- content-library expansion
