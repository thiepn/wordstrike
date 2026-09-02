# AR6 — Arcade Rush UI

AR6 adds the complete presentation layer for the isolated Arcade Rush implementation. It does **not** expose Arcade Rush through the production mode registry or `main.js`; Daily Strike remains the public fourth mode until the planned cutover.

## Ready screen

The ready view communicates only the stable v1 contract: Arcade Rush, six waves plus one final boss, five Core Integrity, an approximately five-minute target run, personal best, Start Rush, and Back. It contains no dates, streaks, attempt limits, daily rewards, or calendar language.

## Gameplay HUD

The normal HUD intentionally contains only Score, Combo, Core, Wave, and Pause. WPM, accuracy, rank, detailed timing, and personal best are not continuously displayed.

The gameplay shell owns a stable `data-rush-word-layer`. HUD updates patch existing fields instead of replacing the shell so a later runtime renderer can keep active word nodes mounted.

## Wave transitions

Transitions are automatic and require no confirmation. The UI displays the cleared wave, current score or Perfect Wave state, the next authored wave name, and a countdown derived from AR4's transition timer.

## Core Breaker

`BOSS_INTRO` identifies Core Breaker as the final encounter. During the boss, the UI exposes only information necessary to play: boss HP, encounter time, next strike time, current phrase, and the correctly typed prefix. The main Score / Combo / Core / Wave HUD stays visible.

## Pause and input ownership

The pause overlay exposes Resume, Restart, and Mode Select. AR6 does not simulate time; AR4/AR5 remain authoritative for pause behavior and clocks.

The scoped keyboard handler only consumes Enter/Escape on Ready and Results and Escape for pause/resume. Ordinary letters, spaces, and Backspace during gameplay are left to the runtime, including Core Breaker phrase input.

## Results

Successful runs prioritize final score, optional New Personal Best, WPM, accuracy, max combo, remaining Core, and active time. Failures show Core Destroyed and the stage reached. Detailed score components are placed behind a native `<details>` disclosure. View Leaderboard is a secondary action and remains disabled unless the host marks it available; AR11 supplies the real board.

## Accessibility and device behavior

AR6 includes a mode-scoped `role="status"` live region, semantic headings and labels, minimum 44px touch targets, `touch-action: manipulation`, mobile layouts, safe-area padding, `prefers-reduced-motion`, and an explicit reduced-motion controller override.

## Runtime binding helper

`createArcadeRushUiBindings(ui, options)` converts AR4/AR5 callbacks into UI operations for updates, wave transitions, boss intro/start, pause/resume, success/failure, and cleanup. AR7 can compose this helper with application state/navigation without moving gameplay into `main.js` or the global keyboard controller.

## Production boundary

AR6 deliberately does not modify `js/main.js`, `js/modes.js`, `js/appScreens.js`, `js/appStateDomains.js`, persistence, leaderboards, Supabase, or Daily Strike.
