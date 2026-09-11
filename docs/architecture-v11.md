# WORDSTRIKE V11 — Typing Test Results Observer Hub

## Goal

V11 removes duplicated production `MutationObserver` ownership from the historical Typing Test result stack without rewriting the mature V1–V7 result implementations.

The result UI remains additive and ordered:

1. V1 performance graph
2. V2 pace and consistency
3. V3 flow, recovery and trend
4. V4 word and mistake inspector
5. V5 longitudinal baseline
6. V6 Typing Coach shell
7. V7 adaptive training plan

No scoring, result math, storage format, ranked eligibility, leaderboard contract, or Practice Lab training logic changes in V11.

## Observer architecture

`js/speedTestResultsObserverHub.js` is imported before every historical result layer by `js/speedTestResultsFeature.js`.

During that one-time module bootstrap it temporarily replaces the global `MutationObserver` constructor with a compatibility observer. Historical V1–V7 observers, including the V4 word-profiler wake-up observer, therefore register with the V11 hub rather than allocating independent native observers.

The hub owns exactly one native `MutationObserver` for captured Typing Test observers. It merges duplicate target observation options and routes each mutation batch only to virtual observers whose historical target/options match the record.

After V1–V7 finish evaluating, `speedTestResultsFeature.js` calls `releaseSpeedTestResultsObserverCapture()`. This restores the native browser constructor immediately. Existing virtual result observers stay connected to the shared V11 hub, while observers created later by unrelated features remain ordinary native observers.

## Why capture instead of rewriting V1–V7

The V1–V7 modules contain mature result rendering, interaction, persistence and coach behavior with substantial regression coverage. Their self-installing observer boilerplate is an architectural problem, but their feature logic is not.

V11 therefore treats those modules as compatibility layers and centralizes observer allocation at their semantic owner. This reduces runtime observer duplication while minimizing behavioral churn.

## Scoped observers intentionally retained

V6 can create a temporary Practice Lab overlay observer after the results bootstrap has finished. That observer is intentionally native and scoped to the temporary Practice overlay root. It is not part of the always-on Typing Test results observer set.

V10's shared presentation lifecycle is also unaffected because V11 restores the native constructor before unrelated runtime observer creation.

## Routing semantics

The hub preserves the historical observation contracts:

- `childList` mutations are routed only to observers that requested `childList`.
- attribute mutations are routed only to observers that requested attributes.
- attribute filters such as V7's `data-practice-view` filter remain enforced.
- `subtree` containment is respected.
- disconnecting one virtual observer does not disconnect the shared native hub.
- one callback failure is reported without preventing other historical result layers from receiving the batch.

`takeRecords()` intentionally returns an empty array for virtual observers. None of the captured historical Typing Test observers use it, and allowing one virtual observer to drain the shared native observer would violate ownership isolation.

## Invariants

1. `speedTestResultsObserverHub.js` must remain the first historical-results import in `speedTestResultsFeature.js`.
2. V1→V7 feature order must remain unchanged.
3. `releaseSpeedTestResultsObserverCapture()` must run only after the historical modules have evaluated.
4. The hub must create at most one native observer for captured result observers.
5. The hub must not introduce polling, interval loops, or another animation-frame loop.
6. New Typing Test result features should integrate through `speedTestResultsFeature.js` rather than adding document-level scripts or independent always-on observers.

## Verification

`tests/speed-test-results-lifecycle-v11.test.js` verifies:

- one native observer backs multiple captured observers;
- duplicate targets are collapsed;
- child-list and attribute-filter routing remains correct;
- virtual disconnect is isolated;
- callback failures are isolated;
- native `MutationObserver` is restored after bootstrap;
- captured observers continue functioning after restoration;
- later unrelated observers stay native;
- semantic V1→V7 import order remains intact.
