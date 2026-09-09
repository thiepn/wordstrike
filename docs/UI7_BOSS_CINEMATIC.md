# UI7 — Boss Encounter Cinematic Presentation

UI7 moves Campaign boss encounters onto the cyber-athletic visual language established by UI1–UI6 while preserving the Boss ruleset exactly.

## Scope

UI7 owns only the active Boss encounter presentation:

- Boss intro/arrival cinematic;
- Boss HUD hierarchy;
- timer urgency presentation;
- overall encounter completion presentation;
- current-sequence progress;
- Boss phrase/caret/typed/error states;
- inter-sequence transition feedback;
- threat atmosphere and Boss-tier intensity;
- mobile keyboard presentation;
- responsive and reduced-motion behavior.

UI7 does **not** alter:

- Boss phrase generation;
- encounter vocabulary or tier patterns;
- segment counts or words per segment;
- time limits;
- timer charging during active/transition phases;
- intro duration;
- transition duration;
- scoring, combo, WPM or accuracy math;
- success/failure conditions;
- timeout miss accounting;
- Campaign unlocks or level-100 eligibility;
- save data, statistics or leaderboard eligibility;
- Campaign gameplay presentation (UI5);
- Endless presentation (UI6);
- results, pause or onboarding composition (UI10);
- Practice Lab runtime, UI, storage, schemas, experiments, migrations or feature gate.

## No fake health system

Boss encounters do not currently have Boss HP or player integrity mechanics. UI7 therefore does not fabricate them.

The encounter remains exactly what the runtime defines:

> Complete every required sequence before the timer expires.

UI7 exposes two progress concepts that are derived from existing state only:

- **Boss Resolve** — overall encounter completion across all sequences;
- **Sequence Progress** — typed-character completion within the current sequence.

Neither value changes Boss mechanics. They are read-only presentation derived from `phrasesCompleted`, `phraseIndex`, `phraseCharIndex`, current phrase length and total sequence count.

## Runtime-owned cinematic clock

The Boss runtime remains the only timing authority.

Existing phases:

1. `INTRO`
2. `ACTIVE`
3. `TRANSITION`

Existing timings remain unchanged:

- intro: **2800 ms**;
- between-sequence transition: **350 ms**.

`bossGameplayPresentation.js` reads `phase`, `introElapsedMs`, `transitionElapsedMs` and `remainingMs`. It does not create another timer or delay.

The intro uses four visual stages derived from the existing intro clock:

- arrival;
- identified;
- countdown;
- engage.

The existing UI-owned intro copy (`BOSS ENCOUNTER`, `3`, `2`, `1`, `TYPE`) remains authoritative.

## HUD

The live runtime IDs remain intact:

- `boss-phrase-count`
- `boss-word-count`
- `boss-timer`
- `boss-score`
- `boss-combo`
- `boss-wpm`
- `boss-accuracy`

UI7 moves these nodes into a low-chrome hierarchy rather than replacing them.

Priority order:

1. Boss identity / encounter index;
2. time remaining;
3. WPM;
4. accuracy, score and combo;
5. sequence / word progression;
6. Boss Resolve.

Timer semantics remain derived from the existing runtime thresholds:

- stable: over 10 seconds;
- warning: 5–10 seconds;
- critical: 5 seconds or less.

Color reinforces state but is not the sole carrier; the numeric timer remains continuously visible.

## Threat identity

Boss presentation is intentionally more magenta than normal gameplay:

- cyan remains the player's typed/progress color;
- magenta represents the Boss/threat field;
- red is reserved for critical timer/error pressure;
- green appears only for the brief successful sequence-transition cue.

Boss index affects presentation intensity only:

- Boss 1–3: standard;
- Boss 4–7: escalated;
- Boss 8–10: apex.

This tier does not alter the encounter configuration.

## Intro sigil

UI7 adds a presentation-only threat sigil behind the existing intro text:

- two rotating rings;
- crossed axes;
- a restrained inner threat core.

It has no gameplay geometry and `pointer-events: none`.

Rare intro motion is allowed to be more dramatic than normal UI, consistent with the UI1 effect budget.

## Phrase presentation

The existing renderer still owns Boss phrase characters and state classes.

UI7 restyles those states without changing renderer semantics:

- remaining characters: muted off-white;
- typed characters: cyan;
- current character: high-contrast text + cyan underline/caret;
- wrong input: short red distortion/rail response;
- sequence transition: short success sweep.

The old large cyan current-character box and permanent magenta combat-frame border are removed by Boss-scoped CSS.

Phrase density classes remain authoritative:

- `boss-phrase-size-normal`;
- `boss-phrase-size-dense`;
- `boss-phrase-size-extreme`.

## Responsive behavior

Desktop keeps the complete performance HUD.

Mobile uses a two-row compact HUD while preserving:

- BACK ≥44 px;
- Boss identity;
- timer;
- WPM;
- encounter progress;
- mobile keyboard control ≥44 px.

At approximately 390×360 visual-viewport height, UI7 deliberately reduces chrome rather than shrinking controls:

- visible: BACK, Boss identity, timer, WPM and Boss Resolve track;
- semantic but visually hidden: accuracy, score, combo, sequence text and word count;
- phrase/caret area receives the remaining vertical space;
- page/screen horizontal overflow must remain zero.

The keyboard CTA is explicitly hidden above 760 px in both Chromium and Firefox.

## Accessibility

- BACK remains a native button.
- Boss Resolve is `role="progressbar"` with live `aria-valuenow` / `aria-valuetext`.
- Current-sequence progress is also a real progressbar.
- Boss combat frame is a labeled region.
- Intro is a polite status live region using existing countdown copy.
- Transition marks the arena `aria-busy` only during the runtime transition phase.
- color is never the only representation of timer/progress state.

## Reduced motion

With `prefers-reduced-motion: reduce`:

- sigil rotation/pulse stops;
- critical timer pulsing stops;
- caret pulsing stops;
- sequence transition sweep stops;
- intro transition durations collapse;
- wrong-input displacement/filter motion is removed.

Boss mechanics and phase durations remain unchanged.

## Isolation

UI7 styling is scoped under `.boss-gameplay-screen`.

It must not target:

- `.campaign-gameplay-screen`;
- `.endless-gameplay-screen`;
- `.practice-lab-screen`.

The presentation module attaches only when `.boss-screen` exists and only reads `appState.game` while `game.mode === "boss"`.

## Permanent certification

UI7 adds:

- `tests/ui7-boss-cinematic.test.js`;
- `tests/browser/ui7_boss_gameplay.py`;
- `tests/browser/ui7_boss_visual.py`;
- a permanent `Certify UI7 Boss cinematic gameplay` step after UI6 in the non-Practice Chromium/Firefox workflow.

Certification covers intro stages, timer urgency, Boss Resolve, sequence progress, phrase typed/current/error states, transition state, desktop/mobile/390×360 containment, keyboard CTA behavior, reduced motion, and Campaign/Endless/Practice isolation.
