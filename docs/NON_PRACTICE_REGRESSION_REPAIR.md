# Non-Practice regression sweep — 2026-09-08

## Scope

This repair pass covers WordStrike's active production surfaces outside Practice Lab: title/navigation, Campaign, boss battles, Typing Test integration boundaries, Endless, Arcade Rush, Settings/onboarding, Profile & Statistics, leaderboards, shared mobile input, responsive viewport behavior, persistence, and public/PWA metadata.

Practice Lab code, data, schemas, migrations, UI, corpus artifacts, and tests are explicitly outside this repair scope and are unchanged.

## Confirmed regressions repaired

### Retired Daily Strike residue

The Arcade Rush cutover left active Daily Strike references in Settings help, public/PWA metadata, shared mobile selectors, and short-viewport CSS. The Settings button pointed at a tutorial that no longer existed. These active remnants are removed or replaced with Arcade Rush while intentional historical compatibility remains intact for old leaderboard return links and retired storage cleanup.

### Arcade Rush mobile software-keyboard input

Arcade Rush rendered through `.arcade-rush-gameplay`, but the shared mobile input adapter recognized only the older gameplay shells. As a result, touch users could enter Rush without the hidden gameplay textarea/keyboard trigger that other modes use. Arcade Rush is now an explicit shared-input host, its word layer is the tap arena, and it participates in shared visual-viewport containment. The HUD remains above the word layer so Pause stays clickable.

### Legacy leaderboard navigation test gap

A keyboard regression test referenced the removed `LEADERBOARD_BOARDS.DAILY` property, which evaluated to `undefined` and accidentally exercised the Campaign fallback instead of the intentional legacy Daily redirect. The test now uses the actual retired board key (`daily-strike-v1`) so compatibility behavior is genuinely covered.

## Regression gates

The non-Practice Node regression set includes focused checks for retired Daily UI residue and Arcade Rush mobile input. A dedicated Chromium/Firefox browser workflow exercises the real static app across title/mode navigation, Settings persistence and tutorials, Profile & Statistics, offline leaderboards, Campaign, boss battles, Endless, Arcade Rush, pause/resume behavior, mobile input, viewport shrink, and metadata.
