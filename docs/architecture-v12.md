# WORDSTRIKE V12 — Typing Results Runtime 2.0

## Status

V12 replaces the always-live Typing Test results observer hub with an explicit Results runtime while preserving the mature V1–V7 result behavior and ordering.

## Runtime ownership

Normal production DOM observation remains owned by the V10 presentation lifecycle:

```text
#app mutation
  -> presentationLifecycle
  -> typing-results presenter
  -> TypingResultsRuntime.sync()
  -> ordered V1–V7 compatibility feature pass
```

The historical modules still register their old MutationObserver callbacks during boot, but V12 captures those callbacks as **inert compatibility registrations**. They do not create or own a native app/body observer. `TypingResultsRuntime` invokes them explicitly in their established order.

This is intentionally lower-risk than rewriting the calculations and DOM transformations in the same release.

## Lifecycle

`js/typingResultsRuntime.js` owns the Results lifecycle:

- `mount(context)` — establishes one active Results session and temporary interaction ownership.
- `sync()` — runs one ordered result-feature pass and reconciles the current Results/Coach state.
- `destroy()` — removes temporary document interaction handling, disconnects the scoped Coach observer, and closes an active Coach practice overlay through its real close action.

Repeated syncs of the same result do not remount the lifecycle. A new result session tears down the previous session before mounting the next one.

## Historical result feature order

The semantic result chain remains unchanged:

1. performance graph
2. pace / consistency
3. flow / trend
4. word mistake inspector
5. longitudinal baseline
6. Typing Coach shell
7. adaptive training plan

The existing V1–V7 implementation files remain compatibility internals rather than public entrypoints.

## Word profiler

The V4 word profiler remains a distinct pre-test telemetry responsibility. Its historical observer callback is captured with the other boot-time registrations, and the shared presentation lifecycle explicitly invokes compatibility passes outside the Results screen as well. This lets the profiler start when the Typing Test runtime is presented without restoring a dedicated app observer.

The profiler's sampling loop remains its existing bounded requestAnimationFrame lifecycle and stops when the Typing Test ends.

## Coach practice overlay

Coach practice is the only V12 results-related mutation observation outside the shared app presentation lifecycle.

It is deliberately scoped:

- created only while a Typing Results session is mounted **and** a Coach practice overlay exists;
- observes only that overlay;
- watches child changes plus the minimal `data-practice-view`, `disabled`, and `aria-disabled` attributes;
- mutation bursts are coalesced into one runtime microtask sync;
- disconnected when the overlay closes, the result session changes, or Results is left.

V6's own Practice controller/observer remains responsible for driving the embedded Practice flow. V12 does not broaden that scope.

## Interaction ownership

While Results is mounted, V12 installs one temporary capture-phase click listener. It is used only to schedule a post-action reconciliation so creation/removal of the body-level Coach overlay can be detected without observing the whole document body.

The listener is removed on every Results teardown.

## Preserved invariants

V12 intentionally does **not** change:

- Typing Test WPM or accuracy calculations;
- performance timeline calculations;
- word-profile calculations;
- V5 longitudinal comparison behavior;
- Typing Coach V6 recommendations;
- V7 adaptive plan progression;
- result storage or local history;
- ranked eligibility or leaderboard payloads;
- authentication/submission behavior;
- Practice Lab persistence/contracts;
- Campaign, Endless, Boss, or Arcade Rush behavior.

## Observer budget after V12

For the relevant production architecture:

- one shared `#app` presentation MutationObserver (V10);
- zero dedicated Typing Results app observers;
- zero dedicated Typing Results `document.body` observers;
- at most one V12 observer scoped to an open Coach practice overlay;
- V6 may retain its own scoped observer inside that same temporary Practice flow.

## Failure isolation

Historical compatibility callback failures are isolated by `speedTestResultsObserverHub.js`. A failed result layer is reported without blocking later layers in the same runtime pass.

The shared presentation lifecycle also isolates presenter failures, so a Typing Results failure cannot prevent Campaign/Endless/Boss/Arcade/Profile/global presentation work.

## Certification

`tests/typing-results-runtime-v12.test.js` verifies:

- explicit mount/sync/destroy behavior;
- same-session resync without remount;
- session replacement cleanup;
- scoped Coach observation;
- click/mutation coalescing;
- 100 Results enter/exit cycles without listener accumulation;
- no native observer in the historical compatibility bridge;
- registration inside the shared presentation lifecycle.

The V11 observer test is retained as a compatibility-history test but now verifies that V11's live hub is safely superseded by V12 manual dispatch.

## Follow-up

V12 deliberately separates **runtime ownership** from **historical implementation deletion**. A later architecture-consolidation release can convert the mature V1–V7 internals into native exported feature functions and delete the compatibility capture bridge after equivalent browser coverage is established.
