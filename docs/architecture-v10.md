# WORDSTRIKE V10 — Presentation Lifecycle Architecture

## Purpose

V10 removes duplicate production observation of the same `#app` DOM tree. Presentation modules still own their visual semantics, but one coordinator now owns mutation observation and scheduling.

This is a runtime/maintainability change. It does not intentionally change gameplay rules, scoring, storage, auth, ranked submission, routing, or Practice Lab contracts.

## Production ownership

`js/presentationBootstrap.js` is the semantic presentation entrypoint. It registers six ordered presenters with `js/presentationLifecycle.js`:

1. Campaign gameplay
2. Endless gameplay
3. Boss gameplay
4. Arcade Rush
5. Profile / Leaderboards / Settings
6. UI12 global presentation

`presentationLifecycle.js` creates the single production `MutationObserver` for `#app` and coalesces mutation bursts into at most one shared presentation pass per animation frame.

## Presenter contract

A presenter exports an idempotent `sync...Presentation()` function. A sync function may:

- detect whether its surface is currently mounted;
- add presentation-only markup/classes/ARIA state;
- synchronize visible presentation state from the authoritative runtime;
- return without side effects when its surface is absent.

A presenter must not create another production `MutationObserver` for `#app`.

## Continuous gameplay presentation

Endless and Boss retain local `requestAnimationFrame` loops because their HUD state must remain synchronized continuously while those gameplay screens are mounted. The shared lifecycle starts those loops when their screens appear. Each local loop stops scheduling itself when its screen disappears.

Campaign remains mutation-driven because its authoritative gameplay DOM/state changes already create the mutations needed to request presentation reconciliation.

Arcade Rush keeps its old explicit `startArcadeRushGameplayPresentation()` / `stopArcadeRushGameplayPresentation()` hook for isolated compatibility use, but the module no longer auto-starts that observer. Production uses the shared lifecycle.

## UI12 global listeners

UI12 still owns document-level click and keydown listeners for interface audio. These are event-routing responsibilities, not DOM-observation responsibilities, so V10 intentionally leaves them in the UI12 module.

## Mutation policy

The shared observer watches:

- `childList`
- `subtree`
- `characterData`
- the `hidden` attribute

The `hidden` attribute is required for Arcade Rush overlays and phase presentation. Other presentation-authored attributes are deliberately not observed, which prevents ARIA/class synchronization from recursively scheduling unnecessary passes.

## Error isolation

Each presenter is invoked independently. A presentation exception is reported with the presenter identity and does not prevent later registered presenters from reconciling during the same pass.

Presentation errors must never be used to hide failures in authoritative gameplay/runtime code; only presentation synchronization is isolated here.

## Invariants

V10 requires:

- one production `MutationObserver` owner for the presentation layer;
- one scheduled shared presentation pass for a burst of mutations;
- deterministic presenter ordering;
- idempotent `start()` and `stop()`;
- cancellation of queued work when the lifecycle stops;
- no production self-starting observer in Campaign, Endless, Boss, Profile/Leaderboards/Settings, UI12, or Arcade Rush;
- preservation of the existing Endless/Boss continuous-frame presentation behavior;
- no changes to gameplay, scoring, storage, auth, leaderboard, or Practice Lab authority.

## Adding a future presentation module

Do not add another self-starting observer. Export an idempotent sync function and register it in `presentationBootstrap.js` at the required ordering point.
