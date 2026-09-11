# WORDSTRIKE V13 — Native Typing Results Feature Pipeline

V13 removes the final observer-capture compatibility layer from Typing Test Results.

## Ownership

- `presentationLifecycle` remains the single production observer of `#app`.
- `TypingResultsRuntime` is the lifecycle owner for Typing Results.
- `speedTestResultsFeature.js` is the ordered native feature registry.
- V1–V5, V6, and V7 expose idempotent sync functions and never self-install.
- The V4 word profiler is started explicitly by the shared result feature pass and uses its existing rAF sampler without an app observer.
- V6 embedded Practice no longer creates its own MutationObserver.
- While Coach Practice is open, `TypingResultsRuntime` owns exactly one observer scoped to that overlay.
- V7's retest interception is routed through the runtime's one temporary capture-phase click listener.

## Feature order

1. Word-profile sampling handoff
2. V1 performance graph
3. V2 pace/consistency
4. V3 flow/trend
5. V4 word/mistake inspector
6. V5 longitudinal baseline
7. V6 Typing Coach shell
8. V6 Coach Practice synchronization
9. V7 adaptive training plan

The public historical feature chain remains V1 → V2 → V3 → V4 → V5 → V6 → V7. The profiler and Practice synchronizer are lifecycle support steps rather than additional user-facing result versions.

## Observer budget

Normal application runtime:

- one shared `#app` presentation observer from V10
- zero Typing Results app/body observers
- zero word-profiler app observers
- zero V6/V7 self observers

Coach Practice open:

- the same shared presentation observer
- one temporary observer scoped to the Coach Practice overlay

Leaving Results disconnects that temporary observer and removes the temporary document click listener.

## Preserved behavior

V13 does not change WPM, accuracy, timelines, word profiling math, V5 baselines, V6 recommendations, V7 adaptive-plan rules, storage schemas, ranked eligibility, leaderboard payloads, auth, Campaign, Endless, Boss, Arcade Rush, or Practice Lab contracts.

## Rule for future result features

A new Typing Results feature must export an idempotent sync function and register it in `speedTestResultsFeature.js`. It must not add a document/body/app MutationObserver or module-level DOMContentLoaded installer.
