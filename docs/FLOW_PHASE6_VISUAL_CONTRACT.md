# Flow Phase 6 — Quiet Signal Visual Contract

## Objective

Give Flow a recognizable visual identity that is deliberately distinct from WordStrike's cyber-athletic Campaign, Typing Test, and Endless surfaces without changing any Flow mechanics.

## Identity: Quiet Signal

Flow should feel calm, editorial, focused, and premium rather than game-arcade or utility-app generic.

### Typography

- Passage and major display typography use an editorial serif stack.
- Instrumentation, metrics, chapter counters, and IDs use the existing monospaced game/data stack.
- General controls use the WordStrike UI face but are rendered as restrained square/line controls.
- No external font download is required; Flow remains offline-compatible.

### Composition

- Reading lane targets roughly 68–72 characters on desktop.
- Passage content is centered in an open field rather than placed inside a card.
- HUD is a lightweight instrument strip, not a dashboard of boxes.
- Chapter metadata is a thin typographic strip.
- Results use editorial hierarchy and rules instead of rounded stat cards.

### Flow meter

- Meter is a two-pixel signal line with a small terminal point.
- No chunky progress-bar container.
- High Flow may use a restrained breathing glow.
- Meter animation is disabled under `prefers-reduced-motion`.

### Text states

- Pending text is subdued.
- Correct text is calm and legible rather than brightly colored.
- Current character receives the strongest local contrast and a one-pixel signal caret.
- Incorrect text uses a restrained danger treatment without shaking, bouncing, or large feedback effects.

### Chapter transitions

- Full-screen typographic transition.
- Oversized outlined chapter numeral is the primary graphic element.
- No modal card or boxed overlay.
- Existing transition timing remains excluded from Cadence and WPM exactly as in Phase 5.

### Motion

Use motion only for:

- screen/reveal entrance,
- chapter transition hierarchy,
- Flow signal movement,
- existing character/caret state changes.

No particles, explosions, bounce, screen shake, or score popups.

## Scope guardrails

Phase 6 does **not** change:

- typing engine,
- passage selection,
- run/chapter planning,
- Flow Meter mathematics,
- Momentum,
- scoring,
- Cadence calculations,
- duration profiles,
- modifiers,
- adaptive training,
- persistence,
- leaderboards,
- public Flow availability.

Public Mode Select must continue to show Flow as Coming Soon.

## Exit condition

A screenshot of Flow should be visually distinguishable from the other WordStrike modes without relying on the word `FLOW`: serif reading typography, open reading lane, signal-line meter, editorial hierarchy, and typographic chapter transitions must remain recognizable at desktop and mobile sizes.
