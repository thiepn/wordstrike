# WORDSTRIKE Mode and Session Architecture

## Mode registry

`js/modes.js` is the source of truth for mode IDs, availability, routes, and capabilities. Campaign, Typing Test, Endless, and Arcade Rush are enabled. Practice Lab remains disabled.

## Shared session lifecycle

`js/sessionManager.js` owns one metadata session at a time. Controllers own gameplay. Valid transitions, monotonic active timing, idempotent completion, abort behavior, and unique retry identities remain centralized.

## Results and records

`js/sessionResult.js` creates immutable JSON-safe results. `js/modeStorage.js` keeps bounded aggregates and at most 30 compact recent summaries under the versioned mode-data store. The same root contains the lazily created local player profile and versioned lifetime statistics. Campaign save data remains independent.

`recordCompletedSession()` is the sole authoritative path for mode records, lifetime aggregation, recent summaries, and duplicate protection.

Typing Test records are additionally namespaced by word set and configuration. Current `english-200` records remain separate from preserved records without a word-set ID, which are interpreted as `legacy-common-740`.

## Controllers

- Campaign adapts existing normal and boss loops through `campaignSession.js`.
- Typing Test owns its ready/active buffer and deadline loop in `speedTest.js`.
- Endless owns its standardized survival runtime in `endlessMode.js`, reusing Campaign word rendering, prefix targeting, movement geometry, and separation.
- Arcade Rush owns an isolated finite score-attack subsystem under `js/arcadeRush/`, bridged into the app by `arcadeRushAppController.js`.
- Profile & Statistics is a non-session screen. Pure selectors read Campaign saves and mode data; profile edits affect identity only.

Exactly one gameplay controller is active. Shared cleanup stops all loops before clearing mode runtime and session state.

## Navigation

- Campaign: Title → Mode Select → Level Select → Run → Results.
- Typing Test: Title → Mode Select → Ready Test → Results.
- Endless: Title → Mode Select → Endless Ready → Run → Results.
- Arcade Rush: Title → Mode Select → Arcade Rush Ready → six waves → Core Breaker → Results.

Mode Select and mode ready screens create no session. Controllers begin sessions only when play starts. Transition banners remain active gameplay time.

Profile & Statistics opens directly from the title screen, defaults to Overview, and returns to Title without creating or persisting a session.

## Adding a future mode

1. Register the mode.
2. Add one focused controller.
3. Begin one shared session.
4. Publish normalized results.
5. Use shared cleanup and bounded storage.
6. Add navigation and regression tests.
