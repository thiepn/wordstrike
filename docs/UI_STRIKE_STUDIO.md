# Strike Studio UI

## Scope

One coordinated identity layer for the existing WordStrike application. No new mode, scoring rule, persistence format, account flow, or typing engine. The home composition, mode illustrations, navigation rows, controls, Flow furniture, Practice cards, profile, settings, and results surfaces share semantic color and border tokens.

The home uses a large typographic headline and an authored, CSS-rendered key sculpture. Each released mode gets a specific SVG illustration. No new fonts, third-party assets, animation library, canvas loop, network service, or fake player statistics are introduced. Existing appearance preferences and semantic danger/success colors remain authoritative.

## Runtime contract

`strikeStudioPresentation.js` observes only direct child replacements of `#app`. It decorates Title and Mode Select once per new screen. It does not observe character/HUD subtrees, subscribe to typing events, or schedule frame/interval work. Existing buttons, focus handlers, keyboard indexes, routes, and mode availability remain the source of truth. Existing motif hooks move to the replacement SVGs.

The reading lane's metrics and layout are preserved. Flow character transitions and text shadows are disabled in this layer; upcoming text contrast is increased. The fixed setup dock uses an opaque surface instead of backdrop blur.

## PWA

The existing shared service worker remains unchanged. After it is ready, the UI module warms its two versioned assets into `wordstrike-ui-studio-20260917a`. The existing same-origin network-first service worker falls back to `caches.match`, including this separate presentation cache. Warmup is idempotent, asynchronous, and fail-soft. It neither clears user storage nor changes shared cache ownership. Bump the stamp in the HTML, module, and stylesheet reference together for a subsequent UI release.

## Verification

- `node --test tests/ui-strike-studio.test.js`
- `python tests/browser/ui_strike_studio.py`
- Existing full Node suite, public Flow release, typing performance, title navigation, and repository regression workflows.
- Dedicated browser checks render the real application in Chromium and Firefox at 1440, 390, and 360 pixels, including all five mode illustrations, Practice hub, Flow setup and paced typing, profile, settings, and leaderboards. They also verify cold UI caching and offline reload with the actual service worker.

Test results and human screenshot review must be reported from the exact tested revision, not inferred from this document or from static source checks.
