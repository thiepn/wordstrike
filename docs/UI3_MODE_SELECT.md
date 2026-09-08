# UI3 — Mode Select

## Goal

Turn WordStrike's Mode Select from a five-card developer-style grid into a deliberate game-mode discovery surface while preserving every existing navigation, routing, availability, and persistence contract.

UI3 is presentation and interaction-hierarchy work only. It does not redesign gameplay, alter mode definitions, introduce new mode state, or enter Practice Lab.

## Product direction

The screen follows the UI1/UI2 **cyber-athletic minimalism** system:

- near-black atmosphere remains dominant;
- cyan identifies active/player/launch state;
- magenta appears selectively for Arcade Rush rather than as generic decoration;
- UI typography remains the UI1 sans stack;
- data/index/keyboard cues use the game monospace face;
- ordinary mode navigation is separator-based rather than a wall of glowing bordered cards;
- one large selected-mode stage carries visual identity and explanation;
- motion is ambient and restrained, with a complete reduced-motion fallback.

## Composition

### Header

A compact back action and `WORDSTRIKE / MODE` context line replace the old centered panel header.

### Intro

`Mode Select` is treated as the page title, with one concise explanation of what choosing a mode means.

### Selected-mode stage

The left/primary region presents the currently selected item with:

- sequence number;
- availability signal;
- short mode label;
- mode name;
- existing registry description;
- Enter/launch guidance;
- a mode-specific abstract visual for the four public modes.

The stage is a single deliberate focal surface, not a nested card collection.

### Mode rail

The right/secondary region keeps the registry order exactly:

1. Campaign
2. Typing Test
3. Endless
4. Arcade Rush
5. Practice Lab — existing disabled/coming-soon registry state

Each row contains the existing name, short label, description, and availability state. Public rows remain buttons that immediately activate their existing routes. Disabled rows remain non-button articles with `aria-disabled="true"`.

### Main Menu

Main Menu remains a sixth selectable keyboard position and lives in the screen footer. It is not folded into the five-mode registry.

## Mode visual identities

UI3 derives visual presentation from the four active public IDs inside `renderModeSelect()` only. No domain metadata is added to `js/modes.js`.

- **Campaign** — trajectories converging on the Core.
- **Typing Test** — restrained word stream and caret.
- **Endless** — concentric radar/pulse system.
- **Arcade Rush** — intersecting cyan/magenta energy lines.
- **Disabled/unknown fallback** — neutral locked/system motif based only on `enabled === false` or an unknown ID.

There is no Practice-specific CSS selector, asset, route, or presentation branch.

## Preserved architecture

UI3 does not change:

- `MODE_IDS`;
- mode registry order;
- `enabled`, `visible`, `status`, `route`, pause, seed, or persistence flags;
- `state.modeSelection` ownership;
- keyboard controller item count (`getAllModes().length + 1`);
- Arrow Up/Down/Left/Right cycling;
- Enter activation;
- Escape return to Title;
- Main Menu index (`modes.length`);
- downstream Campaign, Typing Test, Endless, Arcade Rush or Practice routing;
- save data or schema.

## Legacy retirement

UI3 moves Mode Select ownership into:

`styles/screens/mode-select.css`

The following old Mode Select construction rules are retired from `style.css` and the UI1 compatibility layer:

- `.mode-panel`
- `.mode-grid`
- `.mode-card`
- `.mode-description`
- `.mode-menu-action`
- old mobile card-density overrides

Later screens retain their legacy/UI1 compatibility styling until their own migration phases.

## Responsive rules

UI3 certifies:

- 1920×1080
- 1440×900
- 1366×768
- 1280×600
- 768×1024
- 390×844
- 360×800
- 390×360

Desktop uses showcase + rail. Tablet collapses to a stacked showcase followed by a two-column separator list. Narrow mobile uses one column. Very short viewports scroll vertically rather than reducing actionable targets below usable sizes.

## Accessibility

- all active mode options are native buttons;
- disabled entries remain semantically disabled non-actions;
- current selection exposes `aria-current="true"`;
- mode navigation has an explicit `aria-label`;
- focus rings use the UI1 token;
- active option targets remain substantially above 44 px in normal responsive layouts;
- Main Menu remains at least 44 px high;
- selected state uses a structural accent rail in addition to color;
- `prefers-reduced-motion` collapses all UI3 animation/transition durations.

## Certification

UI3 adds a dedicated source contract and Chromium/Firefox browser certification. The browser gate checks:

- source/stylesheet ownership;
- old Mode Select selector retirement;
- mode order and active/disabled state;
- keyboard wrapping and Main Menu index;
- all four active route destinations;
- focus movement;
- selected showcase changes;
- no horizontal overflow;
- minimum target size;
- constrained-height reachability;
- reduced motion;
- production screenshots.

Practice Lab is not entered by the UI3 browser suite.

## Explicitly deferred

UI3 does not include:

- UI4 Campaign progression map;
- UI5 Campaign HUD/Core/word redesign;
- UI6 Endless redesign;
- UI7 Boss cinematic treatment;
- UI8 Typing Test redesign;
- UI9 Arcade Rush redesign;
- UI10 Results/Pause/onboarding redesign;
- UI11 Profile/Leaderboards/Settings redesign;
- UI12 final motion/audio/global consistency pass.
