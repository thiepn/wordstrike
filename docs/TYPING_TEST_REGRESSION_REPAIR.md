# Typing Test regression repair — 2026-09-08

## Causes and repair

An incomplete selector left after Daily Strike CSS removal had a closing brace but no opening brace inside the mobile media query. This broke media-query scope and let later mobile rules affect desktop. Repair the actual selector rather than layering desktop overrides over malformed CSS.

The short viewport flag was also based on height alone. It now requires a narrow viewport or a primary coarse pointer. Wide, fine-pointer desktop windows keep three rows even below 520px height. CSS sizing now uses a shared font/line-height/gap/row-count contract; JavaScript's three-row desktop / two-row constrained scrolling stays aligned with the rendered rows. The reading column is centered and capped at 1060px.

The hidden gameplay textarea swallowed Tab and Escape: the mobile adapter ignored commands, while the global router excluded all text fields. Only commands from the app-owned gameplay textarea now reach gameplay routing. Ordinary text fields, select controls and typing-event ownership remain isolated. Tab resets from the word area/body, Shift+Tab exits the input, and Tab on visible controls remains native focus navigation. Modified, repeated and composing Tab events do not restart a test. Escape pauses from the gameplay field.

Changing timer position previously replaced the DOM without reattaching the gameplay input. Full Typing Test renders now clean up and remount the adapter, cancel stale layout callbacks, and retain the attempt's timer, text and metrics. Text-size changes update presentation in place without replacing the input or resetting the test.

## Controls and persistence

Time: 15 / 30 / 60 / 120 seconds. Words: 10 / 25 / 50 / 100. Timer position: Center / Top. Text size: Auto / Small (28px) / Medium (34px) / Large (42px). Auto scales with the viewport and uses a smaller mobile size.

`wordstrike_save.settings.speedTestFontSize` is a validated additive preference, defaulting to `auto`. Existing progress, records, timer position and Practice Lab data are preserved. No score, ranked rule, Practice database or session schema is changed.

Time/word-count choices lock during an active test; Restart/Tab returns them to an editable ready state. Timer placement and text size remain available while typing. Short layouts never use `display:none` for the settings wrapper. Exceptionally short windows can scroll instead of clipping essential controls or words. If a mobile software keyboard shrinks the viewport while the typing input is focused, both rows are revealed within the scrollable screen.

## Regression gates

`npm test` includes focused keyboard-routing, legacy-save/presentation and viewport/CSS-structure regressions in addition to existing WordStrike tests.

The `Typing browser regressions` workflow runs the actual static app in Chromium and Firefox. It covers desktop/short-desktop layouts, mobile/coarse-pointer layouts in Chromium, all configurations, repeated Tab reset, Escape pause/resume, Shift+Tab, modified/repeated/composing Tab, timer remounting, live font changes, persistence, rolling rows, active resize, completion/retry cleanup and a software-keyboard-size viewport shrink. Optional external services are blocked in the browser tests; live leaderboard services are not exercised by that suite. Screenshots and a machine-readable report are retained as workflow artifacts.

Local browser checks:

```
pip install -r tests/browser/requirements.txt
python -m playwright install chromium firefox
python tests/browser/typing_regressions.py
```
