# Flow Phase 7 — Dedicated UI

## Goal

Turn the Phase 6 Quiet Signal visual language into a coherent Flow-specific interface system without changing Flow mechanics, balance, cadence, content, or public availability.

## Developer gate

Phase 7 is enabled only when the developer Flow run route includes:

```text
flowUi=1
```

Example:

```text
?dev=1&mode=flow&flowRun=1&flowUi=1&flowLength=standard&flowCategory=mixed&flowDifficulty=natural
```

The Phase 1–6 developer routes remain unchanged when `flowUi=1` is absent.

## Setup interface

The ready screen exposes three dedicated controls:

- Duration: Quick / Standard / Long
- Text focus: Mixed / Everyday / Stories / Dialogue / Professional / Academic / Quotes / Numbers & Symbols
- Complexity: Smooth / Natural / Advanced / Expert

The setup surface also previews the chapter arc for the selected run length.

Choices use `aria-pressed`, visible focus states, and arrow-key movement inside each choice group.

Because the existing Phase 5 run controller resolves a plan once during module initialization, Phase 7 stages choices locally and performs one canonical URL handoff only when the player starts a changed configuration. The new configuration auto-starts after that handoff. Phase 8 may refine this interaction further; Phase 7 does not duplicate or replace the run controller.

## In-run interface

Multi-chapter runs receive a dedicated session rail showing:

- current chapter number and title
- current passage position within the chapter
- all chapters in the run arc
- complete / current / upcoming chapter states

The rail is informational only. It does not allow skipping chapters or passages.

The older Phase 5 chapter strip is hidden when the Phase 7 rail is present to avoid duplicate hierarchy.

## Chapter transitions

Chapter transition screens retain the Phase 6 typographic composition and add the same session rail so the player keeps orientation between sections.

No transition timing, cadence exclusion, or scoring behavior changes.

## Results interface

Results add:

- a completed chapter rail
- `RUN AGAIN` for the existing same-plan restart action
- `CHANGE SETUP` to return to the dedicated setup surface
- the existing Back action

No result formulas or persistence behavior changes.

## Keyboard ownership

The legacy developer Flow controller treats Enter on READY and COMPLETE as global start/restart shortcuts. Phase 7 adds a narrow keyboard guard so focused setup choices and the `CHANGE SETUP` result action own Enter/Space and cannot accidentally launch or restart a run.

## Responsive contract

At 390 px:

- no horizontal overflow
- duration remains a compact three-option row
- category choices become a two-column grid
- complexity becomes a single-column list
- chapter names collapse from the session rail while numbered progress remains visible
- the reading lane retains the Phase 6 mobile contract

## Explicit non-goals

Phase 7 does not change:

- typing engine
- passage catalog
- run planning rules
- Flow Meter or Momentum math
- score formula
- cadence analysis
- chapter timing
- adaptive training
- modifiers
- persistence/history
- leaderboards
- public Flow availability

Flow remains Coming Soon in normal Mode Select.

## Exit condition

The `flowUi=1` developer route provides a complete, keyboard-accessible setup → run → chapter transition → results → setup interface across desktop and mobile, while all earlier Flow routes and all non-Flow WordStrike surfaces remain unchanged.
