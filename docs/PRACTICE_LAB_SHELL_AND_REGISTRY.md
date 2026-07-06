# Practice Lab Shell and Registry

Status: Prompt 4 development-preview foundation

## 1. Scope

This change adds the first visible Practice Lab shell, catalog, runtime registry contracts, internal navigation, responsive rendering, and developer-mode integration. It adds no typing experiment, content generator, active session, metric calculation, recommendation, persistence, or cloud behavior.

## 2. Public feature-gating policy

`createPracticeFeatureGate()` in `js/practiceLab/practiceFeatureGate.js` is the single availability decision. Its public default is false. Existing `?dev=1` state is injected from `js/main.js`; authentication and Supabase are irrelevant to the decision.

## 3. Integration point

`Screens.PRACTICE_LAB` delegates one app-level screen to `practiceLabController`. `activateSelectedMode()` checks the Practice ID through the central gate. Other mode branches are unchanged.

## 4. Module map

| Module | Responsibility |
| --- | --- |
| `practiceFeatureGate.js` | Public/developer availability and derived mode metadata |
| `practiceExperimentCatalog.js` | Immutable serializable experiment and guided-program metadata |
| `practiceExperimentRegistry.js` | Future implementation registration and availability resolution |
| `practiceLabRoutes.js` | Validated internal route values |
| `practiceLabViewModel.js` | Pure explicit shell states |
| `practiceLabRenderer.js` | Escaped semantic markup |
| `practiceLabController.js` | Route history, rendering, root listener, lifecycle |

## 5. Catalog versus runtime registry

The catalog answers what an experiment is and contains no callbacks. The registry separately connects a known ID to runtime factories. A visible card never implies that an implementation exists.

## 6. Canonical experiment IDs

The stable IDs are `full-assessment`, `weak-keys`, `combination-repair`, `problem-words`, `accuracy-control`, `burst-sprints`, `common-words`, `real-text`, `consistency-trainer`, `metronome-typing`, `read-ahead`, `endurance`, `punctuation-capitals`, `numbers-symbols`, and `custom-text`.

## 7. Categories

Canonical categories are assessment, precision, speed, fluency, real-world, advanced, and custom. Each experiment belongs to exactly one category; advanced is reserved for later grouping without duplicating entries.

## 8. Catalog-entry contract

Entries include stable ID/version, bounded titles/descriptions, category/status, duration range, difficulty, prerequisites, device support, capability/tag arrays, internal implementation prompt, display order, visual keys, and primary skill. `validatePracticeExperimentCatalog()` verifies IDs, uniqueness, enums, duration order, visual keys, bounds, and JSON safety.

## 9. Registry contract

`createPracticeExperimentRegistry()` exposes `register`, `unregister`, `hasImplementation`, `getCatalogEntry`, `getRegistration`, `getResolvedExperiment`, `listResolvedExperiments`, `subscribe`, `getDiagnostics`, and `destroy`. Registration requires a positive implementation version and Prompt 3-compatible descriptor factory. The descriptor is validated once, stored as an immutable runtime value, and must match both catalog ID and category. Duplicate, unknown, mismatched, and invalid registrations fail with `PracticeRegistryError` and stable `PRACTICE_REGISTRY_ERROR_CODES`.

## 10. Availability resolution

Resolved state combines feature access, catalog status, and implementation registration. A runnable experiment requires an open gate, a valid registration, and catalog status `available` or `preview`; `planned`, `disabled`, and `hidden` entries remain non-runnable. This lets Prompt 6 activate the immutable Full Assessment preview entry without mutating catalog metadata. Assessment, data, device, and capability metadata are retained for later policy inputs; no profile state is fabricated now.

## 11. Guided Daily Training metadata

`PRACTICE_DAILY_TRAINING` represents `daily-training` separately from experiments. It is planned, assessment/data-dependent, recommends 12 minutes, and has no runnable action.

## 12. Internal route model

Accessible routes are home, experiment-detail, skill-map, review-queue, and progress. experiment-setup, active-session, session-results, and assessment-results are reserved and normalize to home. Unknown experiment IDs retain a controlled not-found detail route. A closed gate always normalizes to unavailable.

## 13. Controller lifecycle

`mount()` validates its root, normalizes the initial route, installs one click listener, subscribes to registry changes, and renders once. `unmount()` removes the listener/subscription, clears history, prevents rendering, and is idempotent. Back pops bounded internal history before calling the app exit callback; history also retains a safe return-focus selector for the originating card.

## 14. DOM event strategy

The controller uses one delegated click listener on `#app`. It adds no document/window listener and no keyboard handler. Native buttons retain Enter and Space behavior; the existing app dispatcher handles Escape only.

## 15. Home-screen structure

The home screen contains a header, developer-preview badge, help boundary, honest Today's Training card, Full Assessment entry, profile/recommendation empty states, analysis navigation, and categorized compact experiment cards. It displays no user metrics.

## 16. Experiment detail screen

One catalog-driven renderer presents title, category, descriptions, primary skill, duration, difficulty, prerequisites, device support, and availability. Planned/preview actions are truly disabled and internal implementation prompt numbers are omitted.

## 17. Skill Map empty state

The Skill Map describes future evidence areas and says no skill data exists. It renders no fake keyboard or calculated weakness.

## 18. Review Queue empty state

The Review Queue explains future evidence-based scheduling and says no reviews are scheduled. It creates no records.

## 19. Progress empty state

Progress names the future history areas and says no training history exists. It has no chart library, fake graph, or persisted placeholder.

## 20. View-model architecture

Builders in `practiceLabViewModel.js` combine routes, frozen catalog entries, registry resolution, and gate state. They do not access DOM, storage, Supabase, authentication, or session engines. Profile state is explicitly `not-loaded`.

## 21. Renderer architecture

`renderPracticeLab(root, viewModel)` renders only the Practice root. Dynamic catalog/view-model text is HTML escaped, while actions use stable data attributes. Routing and listeners remain controller responsibilities.

## 22. Accessibility

The shell uses header/main/section/article landmarks, native buttons, headings, labelled regions, visible focus states, minimum touch targets, disabled plus `aria-disabled` actions, and concise action labels. Back controls display ASCII `BACK`.

## 23. Responsive behavior

Practice-prefixed CSS supplies three-column desktop catalog grids, two-column tablet grids, and single-column mobile layouts. Header, cards, definition lists, and analysis navigation reflow without horizontal overflow. A short landscape rule reduces vertical padding.

## 24. Mobile keyboard behavior

The shell mounts no input, textarea, contenteditable element, hidden typing adapter, or focus trigger, so opening it cannot request the software keyboard. Mobile experiment support metadata describes future implementations only.

## 25. Feature-gate removal path

After the Prompt 16 release audit, change only `PRACTICE_LAB_PUBLIC_ENABLED` in `practiceFeatureGate.js` (or inject `publicEnabled: true`). Do not remove route normalization: direct-route checks remain a defense boundary.

## 26. Storage non-initialization policy

Prompt 4 does not import repository/store modules from shell code, open IndexedDB, read/write localStorage, create a manifest/profile, or persist route history. Catalog module validation is pure and import-safe.

## 27. Session-engine compatibility

The registry validates descriptor values through `validatePracticeExperimentDescriptor()` from Prompt 3. A future factory must supply matching ID, positive versions, title/category, valid correction policy/completion modes, and resumability. Prompt 4 never invokes `createPracticeSessionEngine()`.

## 28. Service-worker implications

The repository has no service worker or explicit offline asset cache. `manifest.webmanifest` is install metadata only, so no cache list/version changed and no Practice data is cached.

## 29. Testing strategy

Focused Node tests cover the public/developer gate, immutable complete catalog, Daily/Error Replay boundaries, registry compatibility and events, route fallback/gating, controller lifecycle/rerender behavior, semantic escaped rendering, disabled states, and static input/storage/session isolation. The complete existing suite protects all other modes.

## 30. Prompt 5 integration-audit contract

Prompt 5 can audit the shell through bounded controller/registry diagnostics, test route/listener ownership, and inspect responsive accessibility without creating data. It should preserve the centralized gate, empty production registry, route boundary, and storage non-initialization policy.

## 31. Prompt 6 assessment integration contract

Prompt 6 may register `full-assessment` only after supplying a valid descriptor and real setup/session/result boundaries. Its catalog status may become available only with that registration and prerequisite/device policy. It must lazy-initialize any required repository and preserve Practice-only, unranked results.

## 32. Known limitations

The Help location is visibly disabled until Practice onboarding exists. URL history does not represent internal routes. Device capability and prerequisite resolution remain metadata-only because no profile is loaded. Interactive browser coverage remains environment-dependent.

## 33. Open questions

1. Should later internal routes integrate optional URL deep links?
2. When should a real experiment initialize the Practice repository: setup entry or session start?
3. Which device capability probe should feed registry resolution?
4. Should future Help use the existing modal tutorial controller or a Practice-specific guide?
