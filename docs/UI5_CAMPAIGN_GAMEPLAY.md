# UI5 — Campaign Gameplay HUD + Core + Incoming Words

UI5 moves ordinary Campaign gameplay onto the WordStrike cyber-performance visual system established in UI1–UI4 without changing Campaign mechanics.

## Scope

UI5 owns only the ordinary Campaign playfield:

- floating Campaign HUD hierarchy;
- Campaign Core presentation and integrity states;
- ordinary incoming-word visual states;
- word-completion energy feedback;
- Campaign damage feedback;
- Campaign responsive and reduced-motion presentation.

UI5 does **not** change:

- Campaign difficulty or level generation;
- word spawning, movement, trajectory, collision, targeting or input rules;
- scoring, combo math, WPM, accuracy, lives or completion logic;
- save data, results, grades or leaderboard eligibility;
- Boss gameplay/cinematics (UI7);
- Endless gameplay presentation (UI6);
- Arcade Rush, Typing Test, results, onboarding, settings, profile or leaderboards;
- Practice Lab runtime, UI, storage, schemas, experiments, migrations or feature gate.

## Presentation boundary

The pre-UI5 ordinary Campaign shell shares `.game-screen`, `.play-area`, `.core` and word rendering primitives with Endless. UI5 therefore does not delete or rewrite the shared legacy rules. Instead `campaignGameplayPresentation.js` adds `.campaign-gameplay-screen` only to normal Campaign gameplay and every UI5 CSS rule is scoped below that class.

This preserves the existing Endless presentation intact for UI6.

The presentation module reads `appState.game` only to derive display state. It does not mutate app state, storage, gameplay configuration or runtime rules.

## HUD

The six existing live runtime IDs are preserved:

- `hud-level`
- `hud-wpm`
- `hud-accuracy`
- `hud-lives`
- `hud-score`
- `hud-combo`

The existing nodes are moved into the new hierarchy rather than recreated, preserving runtime updates and the existing pause/back listener.

The HUD now emphasizes WPM and level, keeps accuracy/combo/score secondary, represents Core integrity as three compact segments, and adds a thin mission-progress line plus restrained targeting status. It is a transparent/floating composition rather than a full-width bordered terminal bar.

Mission progress is derived only from already-authoritative runtime counters:

`completedWordCount + missedWordCount` over `config.wordCount`.

It has no effect on completion.

## Core

The Campaign Core retains the existing 58 × 58 px logical footprint so gameplay geometry is not changed. UI5 extends only the visual field around it with:

- an inner reactor;
- two restrained orbit structures;
- three integrity segments;
- a low-integrity warning state;
- a brief damage response.

Integrity is a direct presentation of the existing three-life Campaign model. No new health system exists.

## Incoming words

Campaign words no longer communicate state with rectangular neon boxes.

- idle: muted high-contrast text;
- candidate: magenta underline/aura;
- active: bright text with cyan underline;
- typed active prefix: cyan;
- typed candidate prefix: magenta;
- wrong: short red text distortion/underline;
- completed: short cyan energy return oriented toward the Core.

Renderer mechanics and the word DOM ownership model remain unchanged.

## Motion and accessibility

UI5 uses motion as event feedback, not constant decoration. Healthy Core motion is slow; wrong input and damage are brief.

With `prefers-reduced-motion: reduce`:

- Campaign orbit/reactor/critical animations stop;
- Campaign transitions collapse to effectively zero;
- wrong-word displacement is removed;
- completion streaks are suppressed;
- JavaScript screen shake is skipped for Campaign.

The HUD BACK control remains at least 44 px high, normal gameplay preserves keyboard-first behavior, and mobile/short-height layouts keep the playfield usable without horizontal overflow.

## Permanent certification

UI5 adds:

- `tests/ui5-campaign-gameplay.test.js`
- `tests/browser/ui5_campaign_gameplay.py`
- a permanent `Certify UI5 Campaign gameplay` step in the non-Practice Chromium/Firefox workflow.

Certification covers normal Campaign desktop/mobile/short-height presentation, HUD identity, mission progress, Core integrity, active/candidate/wrong words, completion/damage feedback, reduced motion, and explicit Endless/Boss isolation.
