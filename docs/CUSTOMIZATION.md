# Customization — P1

## Shipped scope

Settings → Appearance contains three native selectors and a small live preview:

- Theme: WordStrike (default), OLED, Midnight, Monochrome.
- Accent: Cyan (default), Blue, Violet, Magenta, Orange, Green.
- Interface effects: Reduced, Standard (default), Cinematic.

Changes apply immediately and are stored in the existing `wordstrike_save.settings` object. There are no extra storage keys, network requests, runtime dependencies, or frontend build steps. A storage failure leaves the preference active for the current visit and announces that it could not be saved.

Reset appearance restores only these three selectors. It does not erase progress, records, account data, audio, strict mode, particles, screen shake, or Typing Test preferences. `resetSettings(save)` is separately available for a full non-destructive settings reset; destructive progress reset retains its existing behavior.

## Preference contract

`js/customization.js` contains the curated options and pure validation functions. Missing, unknown, wrong-type, and corrupt preferences receive safe defaults. Nested defaults are fresh objects. P2 preference fields are reserved and normalized but have no new UI or gameplay behavior in P1:

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

Physical-device Safari, assistive-technology validation, and P2 mode-local presentation controls remain separate work; this document does not claim those are covered by P1.
