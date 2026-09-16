# Flow Phase 13 — Release Hardening Contract

Phase 13 is the final Flow development phase. It does not add gameplay systems. Its job is to convert the fully certified Phase 1–12 stack from a developer-assembled feature into a production WordStrike mode and certify the resulting release candidate.

## Release status

Flow becomes a normal public Mode Select entry:

- `enabled: true`
- `visible: true`
- `status: available`
- registry route: `flow-release`

Practice Lab remains unchanged and unavailable through its existing public gate. Arcade Rush remains hidden/retired and runtime-capable only for compatibility diagnostics.

## Single production route

The public entry uses one route contract:

`?mode=flow&flowRelease=1&flowRun=1&flowUi=1&flowUx=1&flowModifiers=1&flowAdaptive=1&flowIntegration=1`

The user never needs to know or construct the historical Phase 1–11 flags. `flowRuntimeLoader.js` owns them.

### Compatibility strategy

The Phase 1–11 modules were extensively certified behind `dev=1`. Rather than fork or rewrite those modules at release time, the loader:

1. lets `main.js` boot first with **no developer flag**;
2. prepares the normal Mode Select surface underneath Flow;
3. temporarily adds `dev=1` only while importing the already-certified Flow modules;
4. removes `dev=1` immediately after module initialization;
5. leaves WordStrike's main app state in normal production mode throughout.

Existing explicit developer Flow URLs continue to load through the same runtime loader and retain their prior behavior.

## Entry and exit

- Mouse, touch, keyboard activation, and assistive button activation of the public Flow Mode Select button must enter Flow.
- Flow's release URL must not retain `dev=1` after initialization.
- Exiting Flow restores the real Mode Select DOM and its existing handlers.
- Once Flow is exited, Phase 13 removes Flow-specific query parameters from browser history so refreshing another mode cannot unexpectedly relaunch Flow.

## Persistence

Public Flow runs use the Phase 11 canonical result pipeline exactly as certified:

- no developer-only result suppression;
- one canonical session per session ID;
- Flow-specific history/milestones/preferences saved once;
- lifetime and recent-session statistics updated through `modeStorageV2`;
- adaptive weakness context remains resumable.

Phase 13 does not introduce a new storage schema.

## PWA / offline readiness

The existing service worker uses a shared app-shell cache and network-first same-origin runtime caching. Flow was developed after that app-shell list and therefore needs an explicit release asset warm-up.

`flowRuntimeLoader.js` maintains the canonical Flow release asset list and proactively adds those JS/CSS assets to the active `wordstrike-pwa-*` cache. This includes:

- engine, Cadence, gameplay, planner, catalog, and Phase 12 expansion content;
- Phase 7–11 presentation/runtime modules;
- the Phase 13 loader itself;
- every Flow-specific stylesheet used by `index.html`.

Cache warming is best-effort and never blocks normal online gameplay. Release certification must prove that, after one online app load and service-worker activation, an offline navigation can still reopen WordStrike and launch Flow from Mode Select.

## Accessibility and input

Phase 13 preserves the already-certified Flow interaction contracts:

- semantic buttons for public entry and setup controls;
- keyboard navigation through Mode Select;
- Flow's Phase 7 keyboard guard;
- IME/composition filtering in the typing engine;
- reduced-motion behavior from the Flow visual/UX phases;
- responsive layouts through the 390 px mobile target;
- exact punctuation/case input semantics.

No release-only keyboard or scoring path is introduced.

## Release-candidate certification

The final Phase 13 gate must cover:

1. public Flow is the fourth available Mode Select mode;
2. Practice remains disabled and Rush remains hidden;
3. public launch works without a persistent developer flag;
4. the full Phase 7–11 UI stack is active on the public route;
5. a public Quick run completes and records exactly once;
6. Flow exit restores Mode Select and strips release parameters;
7. a second launch works after returning from Flow;
8. 390 px mobile entry/setup has no horizontal overflow;
9. Flow release assets are present in Cache Storage;
10. Chromium can reload the app offline and launch Flow from Mode Select;
11. explicit Phase 1–12 developer certifications continue to pass unchanged;
12. the complete WordStrike regression suite remains green.

## Non-goals

Phase 13 does not add:

- new scoring rules;
- new modifiers;
- new adaptive heuristics;
- more passages;
- Flow leaderboards;
- cloud sync;
- XP or unlock gates;
- a new statistics storage schema;
- another roadmap phase.

A green Phase 13 candidate is the Flow release candidate. Further work after this point should be driven by concrete bugs or intentionally scoped post-release product changes, not continuation of the Phase 0–13 build roadmap.
