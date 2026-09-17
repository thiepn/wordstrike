# Flow post-release UX correction

This correction responds to observed release usage without adding a new roadmap phase.

## Default session shape

- Quick targets about 2 minutes and one substantial section.
- Standard targets about 5 minutes and three substantial connected sections.
- Long targets about 8 minutes and five substantial connected sections.
- Default Mixed / Natural Flow uses one coherent seeded story rather than unrelated catalog fragments.
- Default connected sections do not insert chapter-transition interruption screens between sections.
- Explicit categories, modifiers, and adaptive training remain available, but use the shorter 1 / 3 / 5 passage structure.

## Content quality

- Five original longform story series provide connected narrative practice.
- Normal/default selection penalizes quote-heavy passages unless Dialogue, Quotes, the Dialogue modifier, or a quote weakness is explicitly requested.
- Playable Flow catalog text is normalized to standard printable ASCII (U+0020 through U+007E).
- Legacy typographic punctuation is normalized before play: em/en dash to `-`, curly quotes/apostrophes to straight equivalents, ellipsis to `...`, euro to `EUR`, and pound sterling to `GBP`.

## Editing ergonomics

- Ctrl+Backspace deletes the preceding whole word in Flow.
- Meta+Backspace receives the same behavior for compatible keyboards/platforms.
- No Backspace modifier remains authoritative and blocks the shortcut.

## Release hardening

- The new longform module is part of the Flow offline release cache.
- Flow runtime and keyboard guard asset versions are bumped to avoid stale installed-PWA behavior.
- Historical Flow certifications are updated to certify the corrected session shape rather than the retired 6/12/24-fragment structure.
