# WORDSTRIKE / Practice Studio

## Scope and direction

Presentation redesign of Practice Lab. Preserve the repaired input pipeline, every experiment, protocol boundaries, saved data, keyboard accessibility and offline shell. No backend, schema, gameplay or personalization changes.

Direction: an arcade training studio with editorial typography, near-black surfaces, restrained cyan, and original keycap/skill diagrams. Exploration is expressive; active typing stays quiet. No new runtime libraries, downloaded fonts, external images, fake score charts, ranks or fabricated progress.

## Research and decisions

This is desk research plus inspection of the existing implementation and browser screenshots, not a user study or an exhaustive survey of every possible interface.

| Area | Considered | Selected |
| --- | --- | --- |
| Focus | Dense statistics dashboard; minimal typing canvas | Expressive drill library and a quiet, monospace live typing lane. |
| Discovery | More category panels; locked paths; direct library | Search combined with skill filters; every available drill remains directly accessible. |
| Identity | Generic neon/glass; terminal theme; original graphics | WordStrike W/ masthead, editorial hierarchy, static keycap study and 17 authored SVG drill mnemonics. |
| Onboarding | Mandatory assessment; repeated empty metrics | Optional assessment and Daily Training as two clear entry points. |
| Navigation | More back buttons; transient menus | A consistent route strip for setup/evidence pages, excluded from live sessions. |
| Explanations | Hide everything; wall of methodology | Native disclosures for selected explanatory text; controls, warnings and evidence constraints remain available. |
| Motion | Animated counters, charts and constant effects | Small hover state transitions only, respecting reduced motion. |
| Mobile | Shrink desktop wholesale | Responsive 3/2/1-column cards, horizontally scrollable category/navigation strips, 44px controls and safe-area spacing. |
| Results | Invented motivational scores | Existing measured results with clearer typography and term/value grouping. |
| Performance | Observer-based DOM decoration every keystroke | Presentation runs only when a route renders. Filtering hides existing cards without replacing the search input. Session DOM is unchanged. |

### Primary references

- Monkeytype, About: https://monkeytype.com/about — focus-first typing experience, personalization and legible typing feedback.
- Aimlabs: https://aimlabs.com/ — task-based practice organized around distinct skills; use categories to make training selection comprehensible rather than presenting undifferentiated cards.
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/ — contrast, reflow, keyboard access, non-color state cues and target-size constraints. The practical design target here is 44px controls; this is not a claim of full WCAG certification.
- W3C introduction to WCAG 2.2: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ — focus must remain visible and unobscured.
- web.dev, prefers-reduced-motion: https://web.dev/articles/prefers-reduced-motion — avoid nonessential motion when the user asks for it.
- MDN, CSS performance optimization: https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/CSS — avoid unnecessary runtime visual work.

No competitor artwork, page assets or proprietary visual design was copied. All diagrams are authored markup.

## Implementation boundaries

- `practiceLabIdentity.js`: safe catalog rendering, semantic navigation, search/filter state and setup-only enhancement; delegated listeners removed on unmount.
- `practiceLabIdentity.css`: scoped presentation, responsive layouts, keyboard focus and motion/contrast accommodation.
- Current controller integrates the presentation while retaining dependency-injected renderers used by existing tests.
- Service-worker cache revision includes the new module and stylesheet without deleting saved progress.
- HTML sink inventory includes the escaped catalog/navigation strings and fixed SVG allowlist. Typed/source text does not enter artwork.

## Verification

New unit tests cover search/category composition, escaped content, artwork allowlisting, semantic controls, listener cleanup and direct drill discovery. New real-browser journeys cover desktop/tablet/phone layouts, search, reset, route return, every setup, keyboard activation, evidence navigation, typing, correction, multiline completion and result display. Existing full-session and protected-protocol regressions remain mandatory.

Browser mobile emulation is not physical-device testing. Automated accessibility checks and screenshots support review; they do not certify every assistive-technology interaction.
