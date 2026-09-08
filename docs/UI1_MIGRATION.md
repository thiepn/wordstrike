# UI1 Migration Note

## What UI1 changes now

UI1 establishes a reusable design-system layer without taking ownership away from later screen-specific phases.

Immediate global changes on active non-Practice surfaces:

- UI copy inherits a modern sans-serif stack instead of the global terminal-style monospace stack.
- Gameplay words, timers, scores, WPM, grades, numeric telemetry, diagnostics, keyboard hints, and other data-centric elements explicitly retain the game monospace stack.
- The global scanline pseudo-element is removed from active product screens.
- Body atmosphere is quieter: broader low-opacity cyan illumination, extremely faint magenta secondary illumination, and a lower-contrast grid.
- Existing major panels receive neutral borders/elevation instead of cyan construction borders.
- Existing common buttons receive calmer neutral surfaces, restrained radii, stable hover/press motion, strong `:focus-visible`, and semantic primary/danger behavior.
- Existing Mode and Campaign tiles lose permanent neon construction borders while preserving selection, boss, locked, hover, focus, and behavioral hooks.
- Existing Campaign/Endless/Typing/Boss HUD bars keep their current geometry but use thinner/quieter separators and neutral elevation so later HUD phases can migrate them cleanly.

## New reusable primitives

`styles/ui-system.css` introduces:

- `.ui-surface` + four surface levels
- `.ui-button` primary/secondary/ghost/danger
- `.ui-icon-button` and `.ui-icon`
- `.ui-field`, `.ui-input`, `.ui-select`
- `.ui-toggle`, `.ui-check`
- `.ui-segmented`
- `.ui-tabs`
- `.ui-metric`
- `.ui-badge`
- `.ui-backdrop`, `.ui-modal`
- `.ui-hint`, `.ui-tooltip`
- `.ui-hud`, `.ui-hud-group`, `.ui-hud-surface`
- semantic typography, color, spacing, shape, elevation, bloom, focus, and motion tokens

These primitives are deliberately available before UI2–UI12 so screen redesigns can share a single grammar.

## Legacy styling intentionally retained

UI1 does not substantially restructure or replace the current compositions for:

- Title screen
- Mode Select
- Campaign progression grid
- Campaign gameplay playfield/Core/word visuals
- Endless composition
- Boss composition
- Typing Test composition
- Arcade Rush composition
- Results composition
- Pause composition
- onboarding composition
- Profile/Statistics information architecture
- Leaderboards information architecture
- Settings information architecture

Their current structural CSS remains in `style.css` until their assigned phase.

## Practice Lab exclusion

Practice Lab remains outside the redesign.

No UI1 file under `js/practiceLab/`, `data/practice/`, Practice schemas, Practice corpus, Practice scripts, Practice docs, or Practice tests is modified.

Two narrow compatibility rules exist in the new global stylesheet:

1. `.practice-lab-screen` explicitly retains the previous monospace font family so the new application-wide sans-serif inheritance does not redesign it accidentally.
2. The scanline removal targets `.screen:not(.practice-lab-screen)`, preserving the legacy Practice surface treatment.

These are containment rules, not a Practice Lab redesign.

## Migration rule for UI2–UI12

When a later phase redesigns a screen:

1. consume UI1 semantic tokens/primitives first;
2. migrate the screen's legacy selectors intentionally;
3. delete legacy declarations that become dead;
4. do not leave conflicting old/new implementations;
5. preserve behavioral hooks (`data-*`, semantic roles, keyboard routes) unless the phase explicitly changes them;
6. keep neon intensity proportional to state importance;
7. validate desktop, short desktop, mobile, mobile landscape, and mobile keyboard geometry.

UI1 is complete when the foundation is coherent and certified—not when every legacy screen visually matches its final UI12 state.
