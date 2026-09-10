# UI4 — Campaign Progression

## Goal

Replace Campaign's legacy 100-tile level matrix with a progression surface that reads as a game route rather than a developer picker, while preserving Campaign unlocks, launch eligibility, save data, difficulty, scoring, results, and Practice Lab isolation.

## Product direction

UI4 continues the cyber-athletic minimalism established by UI1–UI3:

- near-black remains the dominant material;
- cyan marks active/player progression;
- magenta is reserved for boss encounters;
- ordinary route structure is separator- and line-based rather than a wall of bordered cards;
- grade, level number, WPM, and accuracy use the game/data face;
- labels, explanations, and navigation use the UI face;
- glow is concentrated on the selected mission, frontier, and bosses.

## New Campaign composition

### Campaign Route header

The screen begins with a compact global context line, Back action, and unlocked-count summary.

### Progression overview

The title and short explanation sit beside a selected-mission briefing. The briefing exposes:

- selected level or boss number;
- Ready / Cleared / Locked / Developer access state;
- saved grade;
- saved best WPM;
- saved accuracy;
- Enter-to-launch guidance.

This is hierarchy, not a generic card dashboard: the briefing is primarily typography, a semantic accent rail, and subtle atmosphere.

### Ten route sectors

The 100 Campaign levels are grouped into ten sectors:

- Sector 01 — levels 01–10
- Sector 02 — levels 11–20
- …
- Sector 10 — levels 91–100

Each sector presents a connected mission route. Every tenth mission remains a boss encounter and receives a distinct magenta diamond marker.

Mission states:

- **Cleared** — restrained success treatment plus saved grade.
- **Frontier** — current furthest unlocked mission with a subtle cyan pulse.
- **Selected** — larger cyan active node.
- **Boss** — magenta diamond geometry.
- **Locked** — recessed neutral node.
- **Developer access** — dashed magenta diagnostic state without changing production unlock persistence.

## Interaction contract

UI4 preserves the existing Campaign action model:

- clicking an enabled mission launches it immediately;
- Enter launches the keyboard-selected mission;
- Escape returns to Mode Select;
- locked production missions cannot launch;
- developer mode can still launch any level;
- the selected mission receives focus without forcing document scrolling.

### Responsive keyboard geometry

The old screen visually changed from ten columns on desktop to five on mobile, but `ArrowUp` / `ArrowDown` always moved by ten. UI4 fixes that mismatch without changing the underlying Campaign selection state.

`moveLevelGridSelection()` now accepts a column count:

- desktop/tablet route: 10 columns;
- narrow route (`max-width: 720px`): 5 columns.

Left/Right still move one mission. Up/Down move one visual row. Selection remains clamped to the maximum legitimately available level, or 100 in developer mode.

## Responsive rules

Desktop and tablet:

- sector label + ten-node route track;
- selected mission briefing remains alongside the Campaign title;
- the route field owns vertical scrolling.

Mobile:

- overview stacks vertically;
- each sector becomes a five-column, two-row mission field;
- touch targets remain at least 44px;
- route scrolling stays inside the Campaign surface;
- document-level horizontal overflow is prohibited.

Very short mobile / software-keyboard heights:

- secondary explanatory copy and metrics collapse;
- route viewport remains usable;
- selected keyboard focus is automatically kept inside the route viewport.

## Accessibility

- enabled missions are native buttons;
- production-locked missions use native `disabled`;
- selected mission exposes `aria-current="true"`;
- every mission has a descriptive level / boss / state label;
- every sector has an accessible sector/level-range label;
- the route has an explicit Campaign progression label;
- selected state uses size and structure in addition to color;
- boss state uses geometry in addition to magenta;
- reduced-motion mode collapses progression animation and transitions.

## Legacy retirement

UI4 moves Campaign progression ownership into:

`styles/screens/campaign-progression.css`

The following old selection-surface ownership is removed from `style.css` and `styles/ui-system.css`:

- `.level-grid`
- `.level-tile`
- old `.level-screen` selection layout
- old level-tile hover/selected/boss compatibility rules
- old mobile five-column override that was disconnected from keyboard geometry

The `.level-screen` class remains in markup only as a stable screen identifier for existing non-Practice routing tests; its visual ownership is UI4's `.campaign-progress-screen`.

## Certification

UI4 adds:

- `tests/ui4-campaign-progression.test.js`
- `tests/browser/ui4_campaign_progression.py`

The browser suite certifies Chromium and Firefox for:

- ten sectors / 100 missions;
- unlock and locked boundaries;
- completed grades;
- boss identity;
- desktop ten-column keyboard movement;
- mobile five-column keyboard movement;
- Enter launch;
- Escape return;
- developer access;
- focus visibility while the route self-scrolls;
- minimum touch targets;
- horizontal overflow;
- short-height reachability;
- reduced motion;
- production screenshots.

Practice Lab is never entered by UI4 certification.

## Explicitly deferred

UI4 does not redesign:

- Campaign gameplay HUD;
- Core visuals;
- incoming-word presentation;
- Campaign difficulty or level generation;
- boss gameplay/cinematics;
- Results/Pause/onboarding;
- Profile/Leaderboards/Settings.

Those remain owned by UI5 and later phases.
