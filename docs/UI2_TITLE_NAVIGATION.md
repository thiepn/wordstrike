# UI2 — Title Screen & Global Navigation

UI2 is the first screen-level migration onto the UI1 cyber-athletic design system.

## Scope

UI2 owns:

- the Title screen composition;
- the primary Start action;
- top-level destinations for Leaderboards, Profile & Stats, and Settings;
- Title-screen keyboard selection/focus presentation;
- Title-specific responsive and safe-area behavior;
- the first production use of the shared line-icon visual language.

UI2 does **not** redesign Mode Select, Campaign, Typing Test, Endless, Boss, Arcade Rush, results, onboarding, Profile/Leaderboards/Settings internals, or Practice Lab.

## Composition

The old centered terminal panel is replaced by two intentional zones:

1. **Brand / launch zone**
   - WordStrike logo
   - concise product positioning
   - one dominant Start action
   - compact keyboard guidance

2. **Global navigation rail**
   - Leaderboards
   - Profile & Stats
   - Settings
   - neutral by default with cyan used for active/focused state

The layout becomes a single-column flow on tablet/mobile. Very short viewports may scroll vertically; actions must remain fully reachable.

## Visual rules

- no scanlines;
- no floating ambient words;
- no giant neon construction rectangle;
- no permanent cyan borders around ordinary utility actions;
- no all-uppercase utility navigation;
- cyan is reserved for Start, focus, selection, and small status details;
- magenta remains atmospheric only on this screen;
- no rounded-card wall;
- no glassmorphism or large blur regions.

## Copy hierarchy

Primary product message:

> Precision under pressure.

Supporting copy communicates the current public modes without turning the screen into a feature list.

The existing `START` action label is retained for onboarding/test compatibility and product continuity.

## Navigation contracts

The existing Title action ordering remains unchanged:

1. Start / Mode Select
2. Leaderboards
3. Profile & Stats
4. Settings

Therefore the existing global keyboard controller continues to use the same `menuIndex` values and wraps through four actions with Arrow Up/Down. Enter/native button activation continues to route through existing handlers.

Existing `data-action` values are preserved:

- `modes`
- `open-leaderboards`
- `profile`
- `settings`

No URL, persistence, gameplay, leaderboard, auth, or save contract changes are introduced.

## Accessibility

- semantic `<nav aria-label="Global navigation">` for utility destinations;
- native buttons for every action;
- approximately 44px+ target sizes;
- visible `:focus-visible` treatment;
- selected/focused state is not communicated by color alone;
- supporting text remains legible at constrained widths;
- safe-area insets are respected;
- reduced-motion removes the small utility hover translation.

## Responsive targets

Certified at minimum:

- 1920×1080
- 1440×900
- 1366×768
- 1280×600
- 768×1024
- 390×844
- 360×800
- 390×360

At short heights the screen may vertically scroll rather than compressing actions below usable touch sizes.

## Practice Lab boundary

Practice Lab remains explicitly excluded. UI2 contains no Practice Lab file, data, schema, corpus, migration, experiment, persistence, or layout changes.

## Handoff to UI3

UI3 should begin from this merged Title-screen state and redesign Mode Select using the UI1 primitives. It should not recreate or replace the Title global navigation system unless a genuine cross-screen requirement emerges.
