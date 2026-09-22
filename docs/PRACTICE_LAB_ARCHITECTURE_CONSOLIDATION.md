# Practice Lab — Phase 8 Architecture Consolidation

## Result

The historical V20→V40 Practice wrapper graph is no longer part of the repository architecture.

Production now has these canonical owners:

- `practiceLabController.js` — lazy public entry and mount lifecycle.
- `practiceLabControllerCurrent.js` — the complete Practice orchestration runtime.
- `practiceLabRendererCurrent.js` — the complete Practice rendering surface.
- `practiceExperimentCatalog.js` — the complete current catalog, constants, and validation.
- `practiceCoachService.js` — the complete Daily Coach service.

The old controller-runtime files, renderer files, V30 catalog compatibility file, and V25 Coach base file are deleted. Test-only named controller seams remain exports of the canonical controller so historical feature contracts can still be isolated without recreating file-level wrappers.

## Preserved behavior

Phase 8 is structural. It does not change:

- training protocols or fixed doses
- scoring, evidence, mastery, retention, or recommendation semantics
- IndexedDB or session-summary schemas
- Research consent/privacy boundaries
- Physical Keyboard local-only telemetry boundaries
- feature-gate behavior
- Phase 7 offline/background/resume rules

## Offline architecture

The service-worker cache is `v63-practice-architecture`. It precaches the canonical controller and renderer and no longer downloads the deleted compatibility stack.

## Regression guard

`tests/practice-architecture-consolidation-phase8.test.js` verifies that production loads the canonical controller, obsolete files are physically absent, source/tests cannot depend on them, catalog and Coach each have one production owner, and the PWA caches only canonical architecture.
