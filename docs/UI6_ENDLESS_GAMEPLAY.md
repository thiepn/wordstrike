# UI6 — Endless Gameplay Presentation

UI6 moves Endless gameplay onto the cyber-athletic visual language established by UI1–UI5 while preserving the Endless ruleset exactly.

## Scope

UI6 owns only the active Endless playfield:

- Endless HUD hierarchy;
- stage progress and stage transition presentation;
- rolling WPM, combo, survival and active-word pressure presentation;
- Endless Core presentation and integrity states;
- Endless incoming-word state presentation;
- imminent-threat visual feedback based on already-computed word positions;
- completion/damage feedback;
- Endless mobile keyboard presentation;
- responsive and reduced-motion behavior.

UI6 does **not** alter:

- `endlessConfig.js` balance values;
- stage word counts;
- spawn timing or active-word caps;
- word generation;
- movement speed or trajectories;
- collision rules or immunity timing;
- input/targeting mechanics;
- scoring or survival-point math;
- result construction, save data or leaderboard eligibility;
- Campaign presentation (UI5);
- Boss presentation/cinematics (UI7);
- Typing Test, Arcade Rush, results, profile, leaderboards or Settings;
- Practice Lab runtime, UI, storage, schemas, experiments, migrations or feature gate.

## Presentation boundary

The existing Endless runtime already exposes the authoritative state required by the UI: stage, stage words completed, rolling WPM, combo, elapsed survival time, score, integrity, active words, active-word cap and targeting state.

`endlessGameplayPresentation.js` imports `getCurrentEndless()` and **reads** that runtime state. It does not write Endless game state, patch configuration, touch storage or invoke scoring logic.

The presentation is attached only to `.endless-screen` through `.endless-gameplay-screen`. Campaign remains under `.campaign-gameplay-screen`; Boss remains outside both boundaries.

## HUD

The existing runtime IDs remain intact:

- `endless-stage`
- `endless-progress`
- `endless-score`
- `endless-integrity`

The nodes are moved into a lower-chrome hierarchy rather than replaced. New presentation-only metrics show:

- current stage;
- rolling WPM;
- current combo;
- score;
- Core integrity;
- survival time;
- active word pressure versus the runtime cap;
- current target acquisition state;
- stage completion progress.

The original `endless-progress` and `endless-integrity` nodes remain present as visually hidden compatibility/assistive nodes.

## Pressure semantics

Pressure is descriptive only. It is derived from:

`active words / difficulty.activeWordCap`

Presentation tiers:

- low: under 45%;
- medium: 45–74%;
- high: 75% or more.

The tier changes visual intensity only. It never changes spawn rate, speed, cap, scoring or input behavior.

## Imminent words

UI6 adds a visual survival cue for idle words that have moved close to the Core. Distance is calculated from the word positions that the runtime already projected onto the playfield.

This cue:

- does not change collision distance;
- does not reorder or retarget words;
- does not affect active/candidate targeting;
- never changes gameplay state.

Active/candidate styles still take visual priority over imminent-risk styling.

## Core

The Endless Core retains the existing 58 × 58 px logical footprint used by shared gameplay geometry. Its visual identity differs from Campaign:

- expanding radar pulses;
- a rotating sweep;
- inner survival reactor;
- three integrity segments;
- pressure and critical-state tinting;
- short Core-hit response.

This creates a survival/radar identity instead of duplicating Campaign's reactor-orbit object.

## Incoming words

Endless words no longer use permanent target boxes:

- idle: clean muted white;
- candidate: magenta underline/aura;
- active: cyan underline with cyan typed prefix;
- wrong: short red distortion/underline;
- imminent idle word: restrained red proximity cue;
- completion: directional cyan energy return toward the Core.

Renderer ownership remains unchanged.

## Stage transitions

The existing runtime `bannerText` / `bannerUntilMs` state remains authoritative. UI6 only restyles `#endless-stage-banner` into a centered transition signal.

Rare stage transitions receive stronger motion than ordinary HUD updates, consistent with the UI1 effect budget.

## Responsive and accessibility

- BACK remains at least 44px high.
- Mobile has a compact two-row HUD with WPM still visually prominent.
- 390 × 360 short-height layouts preserve the playfield instead of shrinking controls below touch size.
- The mobile `KEYBOARD` action remains >=44px and is forcibly hidden above 760px in both Chromium and Firefox.
- Stage progress is exposed as a real `role="progressbar"` with `aria-valuenow` / `aria-valuetext`.
- The Core has a descriptive integrity label.
- Stage transitions use `role="status"` and polite live announcement.

With `prefers-reduced-motion: reduce`:

- radar pulses, sweep, reactor motion and critical pulses stop;
- transitions collapse to effectively zero;
- wrong-word displacement is removed;
- completion streaks are suppressed;
- JavaScript screen shake is skipped for Endless as well as Campaign.

## Permanent certification

UI6 adds:

- `tests/ui6-endless-gameplay.test.js`
- `tests/browser/ui6_endless_gameplay.py`
- `tests/browser/ui6_endless_visual.py`
- a permanent `Certify UI6 Endless gameplay` step in the non-Practice Chromium/Firefox workflow.

Certification covers runtime-ID preservation, presentation-only state derivation, active/candidate/wrong/imminent words, Core integrity, stage transition presentation, pressure tiers, desktop/mobile/390×360 containment, keyboard CTA behavior, reduced motion, and explicit Campaign/Boss/Practice isolation.
