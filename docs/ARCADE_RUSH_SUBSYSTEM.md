# Arcade Rush subsystem boundary (AR1)

AR1 establishes the module boundary for Arcade Rush without making the mode reachable in production. Daily Strike remains the active fourth mode until the later cutover phase.

## Goals

- Keep Arcade Rush implementation isolated from `main.js`, global app state, Daily Strike, storage, leaderboard and Supabase internals.
- Make pure logic import-safe and independently testable.
- Require runtime integration to arrive through explicit dependency ports instead of hidden singleton imports.
- Preserve the AR0 contract while leaving numerical gameplay tuning unfrozen until AR10.

## Module layout

- `arcadeRushContract.js` — frozen AR0 product/data contract.
- `arcadeRushConfig.js` — contract-derived foundation configuration only. It contains no balance table.
- `arcadeRushGenerator.js` — deterministic-plan envelope and seed boundary. AR2 will implement actual six-wave generation.
- `arcadeRushScoring.js` — canonical score-component container/arithmetic foundation. AR3 will implement scoring rules.
- `arcadeRushResult.js` — result-contract shape validation. AR3 will build the canonical result mapper.
- `arcadeRushBoss.js` — boss-engine port boundary. AR5 will implement the finale.
- `arcadeRushRuntime.js` — explicit runtime dependency ports. AR4 will implement the six-wave state machine against these ports.
- `arcadeRushUi.js` — UI adapter port boundary. AR6 will provide the browser renderer.
- `index.js` — isolated public module surface for Arcade Rush code and tests.

## Dependency rule

Arcade Rush modules must not directly import:

- `main.js`
- `state.js` / `appState`
- Daily Strike modules
- mode storage
- leaderboard services
- Supabase clients or functions

Shared gameplay services are connected later by adapters that satisfy the runtime/UI ports. The runtime therefore receives scheduling, rendering, input, world and session capabilities explicitly.

## Import-side-effect rule

Importing the subsystem must not:

- read or write DOM state;
- create event listeners;
- start animation frames or timers;
- create a gameplay session;
- touch local/session storage;
- make network requests;
- mutate global app state.

AR1 tests enforce the static dependency boundary and dynamic import safety.

## Intentionally not implemented in AR1

AR1 does not implement wave generation, vocabulary selection, balance values, gameplay runtime behavior, boss mechanics, DOM rendering, persistence, statistics, navigation, leaderboard integration or backend validation. Those remain owned by AR2–AR12.
