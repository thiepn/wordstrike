# Practice Lab — Phase 8 Architecture Consolidation

## Goal

Replace the accumulated V20→V40 production wrapper graph with one canonical controller module and one canonical renderer module while preserving the already-certified Practice behavior.

## Canonical production owners

- `practiceLabController.js` — lazy public entry and lifecycle boundary.
- `practiceLabControllerCurrent.js` — complete Practice controller runtime. The former V21→V40 layers are embedded as internal feature sections; production no longer imports versioned controller files.
- `practiceLabRendererCurrent.js` — complete Practice renderer. Production no longer imports versioned renderer files.
- `practiceExperimentCatalog.js` — complete current catalog plus validation/constants; no V30 catalog dependency.
- `practiceCoachService.js` — complete current Daily Coach service plus its former base implementation; no V25 service dependency.

## Preserved contracts

This phase does not change training protocols, scoring, evidence semantics, recommendation policy, IndexedDB schema, session-summary schema, feature gates, Research privacy boundaries, or the Phase 7 offline/device lifecycle rules.

The service worker cache is bumped so installed clients receive the canonical modules. Historical V-files may remain temporarily for migration-only test coverage, but they are outside the production dependency graph and outside PWA precache ownership.

## Architecture gate

`tests/practice-architecture-consolidation-phase8.test.js` blocks reintroduction of versioned controller/renderer imports, the V30 catalog dependency, the V25 Coach base dependency, or legacy PWA precache entries.
