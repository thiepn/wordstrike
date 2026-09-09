# Customization — P1 and P2

## Global controls (P1)

Settings → Appearance contains three native selectors and a small live preview:

- Theme: WordStrike (default), OLED, Midnight, Monochrome.
- Accent: Cyan (default), Blue, Violet, Magenta, Orange, Green.
- Interface effects: Reduced, Standard (default), Cinematic.

Changes apply immediately and are stored in the existing `wordstrike_save.settings` object. There are no extra storage keys, network requests, runtime dependencies, or frontend build steps. A storage failure leaves the preference active for the current visit and announces that it could not be saved.

Reset appearance restores only these three selectors. It does not erase progress, records, account data, audio, strict mode, particles, screen shake, or Typing Test preferences. `resetSettings(save)` is separately available for a full non-destructive settings reset; destructive progress reset retains its existing behavior.

## Preference contract

`js/customization.js` contains the curated options and pure validation functions. Missing, unknown, wrong-type, and corrupt preferences receive safe defaults. Nested defaults are fresh objects. P1 established the preference schema; P2 exposes the mode-local controls without adding them to global Settings:

```js
{
  theme: "wordstrike",
  accent: "cyan",
  effectsIntensity: "standard",
  typingTest: { hudLayout: "balanced", textSize: "auto", liveStats: true },
  gameplayHud: "standard",
  actionModeIntensity: "full"
}
```

The existing `speedTestFontSize` setting remains authoritative. Migration copies it into `typingTest.textSize`, and the existing text-size setter keeps both synchronized. Existing font-size choices are never reset by this release.

## Palette architecture

The palette lives in `styles/customization.css`. Existing CSS uses palette-aware values with the exact previous literal as the fallback. This preserves the default cascade, selector specificity, layout, and color values instead of maintaining separate per-theme screen styles. Root-level palette attributes let the existing `--color-*` tokens and their legacy aliases resolve together.

The controller mirrors `data-theme`, `data-accent`, and requested/effective effects on the document root and body. Themes change background, surface, border, and neutral text roles. The six accents affect player/interaction highlights. Danger, success, warning, boss-special colors, and grades remain semantic; there is no whole-screen hue rotation or color filter.

`data-customization-active=false` disables all palette/effects overrides while the active screen is Practice Lab. The preference is remembered and reapplied when a production screen returns. No Practice-specific file is changed or experimental mode enabled.

## Effects precedence

1. System reduced motion always wins and reacts live to preference changes.
2. Reduced suppresses decorative ambient movement, burst particles, and screen displacement; damage/error information remains visible.
3. Standard is the original presentation.
4. Cinematic adds bounded decorative bloom; it does not accelerate, slow, or extend game timers, word trajectories, input, boss phases, or results processing.
5. Existing disabled particles/screen-shake switches stay disabled; choosing an effects preset never rewrites those switches or audio settings.

Palette/effects preferences never enter scoring, vocabulary generation, leaderboard eligibility, or competitive configuration identity.

## Lifecycle and accessibility

The controller observes direct route replacements on `#app`, not its gameplay subtree. No work or storage writes occur per keystroke. Initialization has cleanup and is idempotent. Native selects retain keyboard behavior, visible focus, labels, explanatory text, 44px targets, and 16px mobile text. Save/error feedback uses a polite live region.

## Verification

- `node tests/customization-p1.test.js`: 72 preference combinations, old saves, malformed values, reset boundaries, blocked/quota storage, independent defaults, text-size compatibility, and effects/Practice policy.
- `python tests/browser/customization_p1.py`: both Chromium and Firefox; palette/effects matrix, semantic colors, contrast of new controls, persistence, keyboard focus, renderer effects, Practice switching, and constrained layouts.
- `BASELINE_DIR` enables exact before/after default screenshots for Title, Mode Select, and Campaign Route in the same engine and font environment.
- The existing source, Typing/UI8, and complete non-Practice UI1–UI12 suites remain separate release gates.

Physical-device Safari, assistive-technology validation, and the wider P3 integration/visual audit remain separate checks. Source tests do not substitute for browser or device verification.


## Mode-local controls (P2)

- **Typing Test:** Presentation → Focus / Balanced / Data and Live statistics On / Off. The existing Auto / Small / Medium / Large text-size selector remains alongside the test controls; the pause panel also provides text size. There is no second size preference or new Start button.
- **Campaign Route:** Presentation → Gameplay HUD (Minimal / Standard) and Boss visuals (Focused / Full).
- **Endless ready:** Presentation → Gameplay HUD, sharing the Campaign preference.
- **Arcade Rush ready:** Presentation → Visual intensity, sharing the Boss preference.
- **Pause overlays:** the relevant mode's presentation controls remain available without abandoning a run. Boss intensity is therefore also configurable inside a Boss encounter.

Focus hides live performance counters but keeps the existing timer / word progress. It does not overwrite the saved Live statistics preference. Switching back to Balanced or Data restores that choice; selecting Data never silently enables live stats. Results and personal-best calculations are always complete.

Data adds **completed words** and **incorrect keystrokes**, including corrected errors, using the existing runtime counters. It does not change accuracy semantics or introduce a new analytics collector. Balanced retains the existing HUD. The manual text sizes retain the established desktop 28 / 34 / 42 px and responsive mobile rules.

Minimal hides Campaign/Endless performance telemetry, not Core integrity, level/stage, progress, pressure/target status, or the pause/keyboard controls. The existing HUD row dimensions and playfield/Core geometry remain authoritative. Mobile uses explicit minimal grid areas rather than inheriting the standard multi-row placement.

Focused lowers nonessential Boss/Rush decoration, burst particles and screen displacement. State information, error feedback, threat colors, attack timers and countdown text remain visible. Full means the original mode presentation within the selected global effects policy—not an override of Reduced or system reduced motion. Palette and effect opt-outs remain independent.

`updateModeCustomizationSetting(save, field, value)` validates known fields and saves through the existing storage path. The old `speedTestFontSize` and nested `typingTest.textSize` stay synchronized. Appearance reset leaves mode preferences unchanged; full settings reset restores all defaults without erasing progress.

The mode controller observes only route replacement and direct pause-overlay insertion. Rush's persistent pause card is enhanced once when its shell mounts; its repeatedly written `hidden` attribute is deliberately not observed. It does not subscribe to the word-stream subtree or run an extra animation/timer loop. Existing input routing explicitly leaves native presentation controls alone; Escape closes an open panel, then normal Escape behavior remains available.

### P2 verification commands

```sh
node tests/customization-p2.test.js
python tests/browser/customization_p2.py
```

The pure suite covers 24 typing preference combinations, 60 effect-precedence cases, storage/reset boundaries, native keyboard isolation, and 192 controlled-time replays across all eight Typing Test configurations. The browser suite and its independent CI workflow cover actual controls, pause/resume, full results with live stats hidden, geometry invariance, responsive layouts, cleanup and screenshots in Chromium and Firefox. They are release requirements, not implied passing results merely because these test files exist.

The P1 palette screenshot comparison excludes only P2's newly requested mode-control elements. The original Title, Mode Select and Campaign compositions still undergo exact comparison; P2 control layouts have their own browser checks.
