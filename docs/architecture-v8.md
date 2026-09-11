# WORDSTRIKE V8 Architecture

## Purpose

V8 is a maintainability refactor. Its primary rule is **behavior preservation**: gameplay, results, Practice Lab, leaderboards, settings, and presentation behavior must remain unchanged while implementation ownership becomes clearer.

## Bootstrap contract

`index.html` owns only platform-level resources:

- application metadata / icons / manifest
- the Supabase browser dependency
- `styles/app.css`
- `js/appBootstrap.js`

Do not add feature-specific versioned scripts or styles directly to `index.html`.

## JavaScript ownership

### `js/appBootstrap.js`

Top-level application entrypoint. It boots three domains in order:

1. `main.js` — application state, navigation, mode orchestration, persistence and core controllers
2. `speedTestResultsFeature.js` — Typing Test result intelligence / coaching enhancement chain
3. `presentationBootstrap.js` — screen-specific presentation enhancers

### `js/speedTestResultsFeature.js`

Semantic owner for the historical Typing Test result chain.

The V1–V7 files remain compatibility implementation layers because later generations depend on DOM produced by earlier generations. Their order is therefore intentional. They are private implementation details and must not be referenced from `index.html`.

Current ordered chain:

1. performance graph
2. pace and consistency analysis
3. flow, recovery and trend intelligence
4. word / mistake inspection
5. longitudinal baseline analysis
6. Typing Coach shell
7. adaptive training plan

New result work should extend or replace this semantic feature boundary rather than create a new document-level `speedTest...V8.js` script tag.

### `js/presentationBootstrap.js`

Owns side-effect presentation modules for Campaign, Endless, Boss, Arcade Rush, Profile/Leaderboards/Settings and global UI polish.

## CSS ownership

### `styles/app.css`

Single document-level CSS entrypoint. It preserves the previous cascade order and delegates Practice Lab styling to `styles/practice-lab.css`.

### `styles/practice-lab.css`

Semantic compatibility boundary for the historical Practice Lab V20/V21/V25 additive styles. Those implementation files remain temporarily because their cascade is cumulative. New work should migrate toward semantic component/screen styles rather than adding another root-level version file.

## Compatibility policy

Historical version files may remain when they contain cumulative behavior, but they must be hidden behind a semantic owner. A compatibility file can be deleted only after repository search and tests show that nothing depends on it.

`speedTestResultsV6.js` is redundant in V8 because it contains only an import of `speedTestResultsV6b.js`; the semantic result entrypoint imports the real implementation directly.

## V8 invariants

- `index.html` has exactly one local stylesheet entrypoint: `styles/app.css`.
- `index.html` has exactly one local module entrypoint: `js/appBootstrap.js`.
- result enhancement order remains V1 → V2 → V3 → V4 → V5 → V6b → V7.
- presentation enhancer order remains unchanged.
- Practice Lab V20 → V21 → V25 cascade order remains unchanged.
- no feature behavior, scoring, storage schema, route names, or leaderboard contracts are intentionally changed by V8.

## Next cleanup after V8

The next architecture pass can convert self-installing result enhancers into explicit lifecycle functions with a shared observer. That is intentionally not part of V8 because it changes runtime lifecycle semantics and deserves its own regression pass.
