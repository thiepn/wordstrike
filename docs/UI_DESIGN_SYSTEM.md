# WordStrike UI Design System

**Phase:** UI1 — Design System Foundation & Visual Grammar  
**Direction:** Cyber-athletic minimalism  
**Status:** Source of truth for UI2–UI12

## 1. Design intent

WordStrike is a modern competitive typing game, not a terminal simulator. Its identity remains near-black, cyan, magenta, precise typography, technical telemetry, and a high-energy game atmosphere. The interface should feel fast, focused, premium, legible, and technological without leaning on retro scanlines, permanent neon borders, glassmorphism, card walls, or decorative cyberpunk clutter.

The core rule is:

> **Neon communicates state. It is not construction material.**

Normal UI is predominantly neutral. Cyan, magenta, red, and green are spent on meaningful interaction and game states.

## 2. Global principles

1. **Content before chrome.** The interface should expose what the player needs before it decorates it.
2. **Neon communicates state.** Cyan and magenta are scarce semantic accents.
3. **Typography creates hierarchy before borders do.** Prefer scale, weight, spacing, and alignment.
4. **Gameplay has visual priority over UI.** Chrome must never compete with words or the Core.
5. **Common actions look consistent across modes.** Start, Back, Pause, Retry, Help, and settings actions share one interaction grammar.
6. **Rare events may be dramatic; ordinary events should be quiet.** Effect intensity follows event importance.
7. **Desktop and mobile are both intentional layouts.** Mobile is not a scaled-down desktop.
8. **Motion explains state changes.** Motion must communicate causality, hierarchy, success, threat, or transition.
9. **No decoration may reduce typing readability.** Gameplay text clarity is non-negotiable.
10. **WordStrike should look technological, not nostalgic.** Avoid terminal and arcade-cabinet clichés.

## 3. Architecture

`style.css` remains the legacy screen stylesheet during the staged UI2–UI12 migration.

`styles/ui-system.css` is the UI1 foundation and loads after `style.css`. It contains:

- semantic tokens;
- typography roles;
- global low-risk visual cleanup;
- reusable `.ui-*` primitives;
- responsive/accessibility behavior;
- a narrow Practice Lab compatibility scope.

This is intentional coexistence, not an uncontrolled override file. New phases should build from the UI1 primitives and progressively retire legacy declarations when a screen receives its dedicated redesign.

Do not append unrelated screen-specific redesigns to `styles/ui-system.css`. Dedicated phases may extend primitives here only when the addition is genuinely reusable.

## 4. Typography

### UI font

```css
--font-ui: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

No external font request is required. Inter is used when already available; otherwise the platform's native high-quality sans-serif is used. This keeps first paint fast and offline-safe.

Use the UI face for:

- navigation;
- headings and descriptions;
- Settings;
- onboarding;
- Profile and Leaderboards;
- buttons and controls;
- labels that are not gameplay telemetry.

### Game/data font

```css
--font-game: "JetBrains Mono", "Share Tech Mono", "Consolas", "Courier New", monospace;
```

Use the game face for:

- incoming and typed words;
- WPM, score, combo, timer, rank and other numeric telemetry;
- level numbers and grades where a technical presentation is useful;
- diagnostics and keyboard hints.

Numeric telemetry should normally use tabular figures.

### Type roles

The semantic scale is defined by:

- `--text-display`
- `--text-h1`
- `--text-h2`
- `--text-h3`
- `--text-body`
- `--text-body-small`
- `--text-label`
- `--text-micro`
- `--text-game`
- `--text-game-large`
- `--text-stat`

Use `--tracking-ui` for normal interface copy, `--tracking-label` for compact labels, and `--tracking-micro` only for overlines/micro labels. Avoid `0.1em+` tracking on ordinary text.

## 5. Color semantics

### Neutral foundation

- `--color-bg`: main near-black background
- `--color-bg-elevated`: overlays/elevated dark regions
- `--color-bg-overlay`: modal backdrop
- `--color-surface-1`: quiet grouping surface
- `--color-surface-2`: interactive/elevated surface
- `--color-surface-hover`: hover surface
- `--color-surface-active`: selected/active neutral surface

### Text

- `--color-text-primary`: primary readable content
- `--color-text-secondary`: supporting content
- `--color-text-muted`: labels and metadata
- `--color-text-disabled`: unavailable content

### Borders

- `--color-border-subtle`: grouping only
- `--color-border-default`: ordinary interactive boundary
- `--color-border-strong`: hover/focus emphasis

### Accent

- `--color-accent`: cyan; player, active, progress, high-value focus
- `--color-accent-soft`: low-intensity cyan surface
- `--color-accent-hover`: stronger cyan interaction surface

### Special

- `--color-special`: magenta; bosses, threats, exceptional/special states
- `--color-special-soft`: low-intensity special surface

### Feedback

- `--color-danger`: damage, failure, destructive interaction
- `--color-success`: completion, PB, positive state
- `--color-warning`: non-destructive warning

Do not show all semantic colors merely because they are available.

## 6. Effect budget

Approximate visual allocation:

- **80–90% neutral:** background, surfaces, normal copy, ordinary controls.
- **10–20% accent:** active state, progress, boss/special state, damage, PB.

Intensity ladder:

1. normal menu — no glow or almost none;
2. hover — mild contrast/accent;
3. selected control — clear accent;
4. gameplay target — stronger cyan;
5. boss/special event — stronger magenta;
6. damage — strong, short red response;
7. PB/major achievement — stronger success response.

If every component glows, the effect budget has been violated.

## 7. Surfaces

### `.ui-surface--0`

Transparent/main composition surface. No border.

### `.ui-surface--1`

Quiet grouping. Slight tonal separation and subtle border.

### `.ui-surface--2`

Interactive/elevated region. Stronger dark surface and small elevation shadow.

### `.ui-surface--3`

Overlay/modal-level separation. Strong elevation but no neon construction border.

Use spacing and typography before adding a surface.

## 8. Borders and shape

Radii are intentionally restrained:

- `--radius-sm: 4px`
- `--radius-md: 6px`
- `--radius-lg: 8px`
- `--radius-overlay: 10px`

Do not normalize the product into 16–24px rounded SaaS cards or pill controls. A later phase may add a restrained chamfer/clipped-corner motif if it proves useful, but it must remain exceptional rather than universal.

Permanent cyan borders are not a default component state.

## 9. Spacing

Use the shared scale:

- `--space-1`: 4px
- `--space-2`: 8px
- `--space-3`: 12px
- `--space-4`: 16px
- `--space-5`: 24px
- `--space-6`: 32px
- `--space-7`: 48px
- `--space-8`: 64px

Separate content groups with space before adding dividers or cards.

## 10. Elevation and bloom

Elevation and neon bloom are different concepts.

Elevation:

- `--shadow-elevation-subtle`
- `--shadow-elevation-medium`
- `--shadow-elevation-overlay`

Bloom:

- `--bloom-accent-sm`
- `--bloom-accent-lg`
- `--bloom-special`
- `--bloom-danger`
- `--bloom-success`

Do not automatically combine elevation and bloom.

## 11. Actions

### `.ui-button--primary`

Use for the single dominant action in a region: Play, Start, Retry, Confirm. Cyan-filled, high contrast, and only mildly bloomed on interaction.

### `.ui-button--secondary`

Use for Back, Mode Select, and meaningful alternatives. Neutral surface and restrained border.

### `.ui-button--ghost`

Use for low-priority contextual actions. Transparent until interaction.

### `.ui-button--danger`

Use for destructive actions. Neutral by default; danger color appears on interaction or when the state genuinely requires it.

### `.ui-icon-button`

44×44 minimum target for compact controls such as Pause, Close, Help, Settings, and Back where an icon treatment is appropriate.

### State model

- default: stable;
- hover: surface brightens and may lift at most 1px;
- active: returns inward immediately;
- focus-visible: strong cyan focus ring;
- selected: different from hover;
- disabled: readable, clearly unavailable, no dashed arcade treatment.

Never use `transition: all` for core primitives.

## 12. Icons

Use one coherent SVG line-icon language. Do not use emoji or mix unrelated icon packs.

SVG conventions:

- `viewBox="0 0 24 24"` where practical;
- `fill="none"`;
- `stroke="currentColor"`;
- rounded caps/joins;
- approximately `1.8` stroke width;
- class `.ui-icon`.

Icons support important text labels rather than replacing labels when comprehension could suffer.

Expected later icons include Play, Restart, Pause, Settings, Profile, Leaderboard, Back, Close, Info, Keyboard, Volume, Trophy, Timer, and Target.

## 13. Inputs

Use `.ui-field`, `.ui-input`, and `.ui-select` for future migrations.

Default inputs use neutral surfaces and borders. Focus gets a clear cyan ring without a large glow. Error and valid states have semantic borders. Minimum height is 44px.

Toggle and checkbox foundations are provided by `.ui-toggle` and `.ui-check`.

## 14. Segmented controls

Use `.ui-segmented` for compact mutually exclusive options such as Typing Test configuration.

Rules:

- options share one quiet container;
- non-selected options are visually low priority;
- selected option gains a stronger surface and cyan indicator;
- keyboard focus remains visible;
- the container may scroll horizontally on constrained widths.

UI8 will perform the actual Typing Test migration.

## 15. Tabs

Use `.ui-tabs` for Profile/Leaderboard-style navigation.

The active state is communicated by label contrast plus a cyan underline, not a collection of outlined neon buttons. Tabs remain keyboard focusable and horizontally scrollable on constrained widths.

UI11 will perform the full Profile, Leaderboards, and Settings restructuring.

## 16. Metrics

Use `.ui-metric`, `.ui-metric-label`, and `.ui-metric-value`.

Metrics rely on typography and alignment rather than boxes:

```text
WPM
87
```

Semantic modifiers exist for accent, special, danger, and success values. Do not apply a semantic color without semantic meaning.

## 17. Badges/status

Use `.ui-badge` with compact left-edge semantics rather than bright pills. Modifiers include accent, special, danger, and success.

Suitable states include PB, Complete, Locked, Ranked, Online, Offline, Boss, and Dev.

## 18. Overlay/modal foundation

`.ui-backdrop` and `.ui-modal` provide:

- safe-area aware padding;
- responsive sizing;
- elevated neutral surface;
- strong separation without neon construction borders;
- shared header/body/action structure.

Existing focus-trap logic remains authoritative. UI10 will migrate Pause, onboarding, and results composition.

## 19. Hints/tooltips

`.ui-hint` and `.ui-tooltip` are intentionally quiet. Use them for compact explanation, shortcuts, and metric help—not as replacements for onboarding.

## 20. HUD foundation

`.ui-hud`, `.ui-hud-group`, and `.ui-hud-surface` define the future low-chrome HUD language:

- floating groups;
- neutral/translucent backing only when necessary;
- UI-font labels;
- game-font numeric values through `.ui-metric`;
- safe-area-aware padding;
- pointer events only on interactive children.

UI5–UI9 own the actual per-mode HUD redesigns.

## 21. Motion

Tokens:

- `--motion-instant`: 80ms
- `--motion-fast`: 140ms
- `--motion-standard`: 220ms
- `--motion-emphasis`: 380ms
- `--motion-cinematic`: 760ms

Use standard motion for common UI and emphasis/cinematic durations only for meaningful state changes. `prefers-reduced-motion` collapses primitive transition durations and removes hover translation.

## 22. Responsive rules

Design and verify at minimum:

- wide desktop: 1920×1080;
- laptop: 1440×900, 1366×768;
- short desktop: 1280×600;
- tablet: 768×1024;
- mobile: 390×844, 360×800;
- mobile short/keyboard: approximately 390×360 visual viewport.

New primitives use flexible widths, horizontal overflow for segments/tabs, and 44px touch targets. Existing gameplay visual-viewport logic remains authoritative.

## 23. Safe areas

Overlay and HUD primitives consume `env(safe-area-inset-*)`. Do not replace existing visual-viewport handling with CSS viewport assumptions.

## 24. Accessibility

Required:

- visible `:focus-visible` state;
- semantic native controls wherever possible;
- approximately 44×44 touch targets for compact actions;
- text remains legible in disabled states;
- color is not the only state signal;
- reduced motion is respected;
- gameplay/readability outranks decorative effect.

## 25. Practice Lab boundary

Practice Lab is excluded from UI1–UI12 unless explicitly brought into a later phase.

UI1 does not modify any Practice file, data, schema, experiment, corpus, or behavior. Because the global application font changes from monospace to UI sans-serif, `styles/ui-system.css` contains a narrow `.practice-lab-screen` font compatibility rule so the existing Practice presentation does not inherit the UI1 typography migration. The global scanline removal explicitly excludes `.practice-lab-screen`.

Do not use this compatibility rule as permission to redesign Practice Lab indirectly.

## 26. Explicit anti-patterns

Do not introduce:

- global scanlines;
- monospace for ordinary application copy;
- permanent cyan borders around ordinary containers;
- neon glow on every hover/control;
- wide letter spacing on body/normal labels;
- 16px+ radius card walls;
- pill controls everywhere;
- gratuitous backdrop blur;
- large moving gradient backgrounds;
- emoji icons;
- `transition: all`;
- framework/UI-library dependencies for basic components;
- decorative animation that competes with typing.

## 27. Phase ownership

UI1 deliberately does **not** complete these compositions:

- UI2 — Title + global navigation
- UI3 — Mode Select
- UI4 — Campaign progression
- UI5 — Campaign HUD/Core/words
- UI6 — Endless
- UI7 — Boss cinematic treatment
- UI8 — Typing Test
- UI9 — Arcade Rush
- UI10 — Results/Pause/onboarding
- UI11 — Profile/Leaderboards/Settings
- UI12 — final motion/audio/responsive/accessibility polish

Future phases should consume the primitives defined here rather than inventing another visual grammar.
