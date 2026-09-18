# Strike Studio UI

## Shipped scope

One coordinated identity layer over the existing WordStrike renderers: a typographic
home with layered CSS keycaps, authored artwork and glyphs for all five public modes,
clearer secondary text, coherent controls, Flow setup/HUD furniture, Practice cards,
profile, settings, leaderboards, results and overlays. No new fonts, third-party
artwork, animation libraries, fake player statistics or additional network services.
Semantic palette tokens, danger/success colors and appearance settings remain authoritative.

## Preservation and performance

The presentation observer watches only direct child replacements of `#app` and
idempotently decorates Title and Mode Select. It adds no typing listeners, frame
loop, interval or HUD-subtree observer. Native buttons, keyboard indexes and routes
remain authoritative. Existing mode motif hooks are retained on the new SVGs.

Flow's typing engine, scoring, cadence, content, save formats and incremental
character renderer are untouched. The setup side summary now derives section count,
word count and duration from the real planner instead of the obsolete 12-passage
table. Preview computation runs only on setup changes, preserving seed, modifier
and adaptive context without modifying the active plan. Its old subtree observer
is removed. The quiet serif reading lane and square Flow controls are retained.

OS reduced-motion and in-app reduced-effects preferences suppress every transition
introduced by the redesign. Forced colors and visible keyboard focus are supported.

## Offline and versioning

PWA cache v13 explicitly precaches both bare and versioned UI assets and the revised
Flow loader/setup-summary module. The existing network-first fetch strategy and
user data are unchanged. The independent fail-soft UI cache remains for upgrades
from older installed shells. Startup, loader and cache references use one release
stamp, `20260918a`; the proven Flow engine hotfix remains `20260917b`.

## Verification contract

- Full repository Node suite and focused UI/planner-preview regression tests.
- Chromium and Firefox public-route screenshots at 1440, 390 and 360 pixels.
- All five mode illustrations, keyboard focus, responsive overflow, Practice hub,
  profile, settings, leaderboards, actual Flow setup counts and paced typing.
- Real service-worker control, explicit cache membership and offline reload.
- Existing Flow hot-path, public-release and full mode/browser regressions.
- The appearance matrix still tests every theme/accent/effects combination,
  contrast, persistence, keyboard controls, resets and responsive target sizes.
  Pixel equivalence now tests the current design before customization versus after
  Reset, rather than requiring an intentional redesign to equal an obsolete UI.

Runtime evidence and visual review must come from the exact tested revision.
This document alone is not release certification.
