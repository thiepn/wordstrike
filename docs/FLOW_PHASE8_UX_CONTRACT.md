# Flow Phase 8 — UX Testing and Refinement

## Goal

Refine the complete Phase 7 Flow journey after observing the real rendered interface. Phase 8 is a usability pass, not a feature or balance phase.

## Problems addressed

1. The setup screen requires substantial scrolling before its primary action is reachable.
2. Keyboard choice groups expose every option in the tab order even though arrow-key navigation already exists.
3. Upcoming passage text is visually too faint for comfortable scanning.
4. Typing can lose input focus without a visible recovery affordance, especially on touch devices.
5. A long wrapped passage has no guarantee that the active caret remains in the useful viewport region.
6. Chapter transition actions require unnecessary eye travel.
7. Results expose the complete diagnostic report before the player sees the few metrics most useful for an immediate decision.

## Refinements

### Setup

- Add an always-reachable bottom action dock containing the existing Start action.
- Keep the selected configuration visible beside that action.
- Convert setup choice groups to roving-tabindex behavior: one tab stop per semantic group, arrow keys inside the group.
- Announce the selected setup summary through a polite status region.
- Shorten setup copy and remove phase/developer language from the UX surface itself.

### Active typing

- Increase pending-text readability while preserving completed/current/error hierarchy.
- Show a visible `Click the passage to resume typing` affordance if the hidden text input loses focus.
- Allow clicking the reading surface to recover typing focus.
- Keep the active caret inside a central viewport band as wrapped passages progress.
- Respect `prefers-reduced-motion` when caret visibility requires scrolling.

### Chapter transitions

- Group Continue, its keyboard hint, and timing note together near the chapter content.
- Preserve existing chapter timing exclusion and Enter behavior.

### Results

Show four immediate primary outcomes first:

- final WPM
- accuracy
- cadence
- average Flow

Keep the existing full metrics, natural-typing analysis, and score breakdown unchanged but place them in a collapsed `Detailed analysis` disclosure.

Primary next actions remain above detailed analysis.

## Scope guardrails

Phase 8 does **not** change:

- passage content or selection
- typing correctness rules
- Flow Meter math
- Momentum math
- Flow Score math
- cadence calculations
- WPM calculations
- chapter plans or timing
- persistence/history
- modifiers
- adaptive training
- leaderboards
- public Flow availability

## Gate

Phase 8 is exposed only on the explicit developer route containing:

`flowUi=1&flowUx=1`

Phase 7 routes without `flowUx=1` remain unchanged. Public Flow remains Coming Soon.

## Exit criteria

- Primary Start action is visible without scrolling on desktop and 390 px mobile.
- Each setup group has exactly one tab stop and one pressed choice.
- Setup changes remain keyboard-accessible.
- Upcoming text remains readable on desktop and mobile.
- Typing focus loss has a clear recovery path.
- Active caret remains visible during wrapped typing.
- Chapter Continue is grouped with its contextual hint.
- Results prioritize four key metrics and keep detailed analysis collapsed by default.
- Chromium and Firefox pass the complete refined journey.
- 390 px mobile has no horizontal overflow.
- Phase 7 routes and public Mode Select remain unchanged.
- Full repository regression suite stays green.
