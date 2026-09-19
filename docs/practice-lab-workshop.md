# Practice Lab / Precision Workshop

## Review scope

A presentation-only refinement on top of Practice Studio (`47870ed616c8cc65538e538361c304badf6de1e1`). The existing masthead, original keycap drawings, search, skill filters, route navigation, results, and repaired typing hosts are retained. This is desk research and implementation review, not a user study or an exhaustive survey of every possible interface.

## Research and decisions

| Area | Alternatives considered | Decision |
| --- | --- | --- |
| Identity | More neon, glass panels, animated backgrounds, or restrained physical cues | Skill-coded training cartridges, tactile keycaps, tabular labels, and the existing original WordStrike graphics. |
| Drill discovery | Card grid only, a long text menu, or two density choices | Keep expressive cards and add a compact list using the exact same accessible controls and DOM. The choice survives setup navigation during the current mounted Practice Lab session. |
| Category recognition | Color alone or color with names and unique diagrams | Add distinct muted skill colors without removing text labels or original diagrams. No fake progress meters or ranks. |
| Target selection | Empty manual field, QWERTY diagram, or letter bank | A-Z letter bank using the existing validated Weak Keys selection action. Alphabetical order does not assume a keyboard layout or prescribe fingers. Manual entry remains available. |
| Setup | Every section stacked, wizard that hides settings, or organized workbench | A recognizable title panel and Set up / Practice / Review orientation strip. In targeted drills, controls sit beside the actual session protocol on wide screens and stack on phones. |
| Explanations | Long prose above the action, deletion, or optional detail | Keep methodology in native disclosures. Preserve visible warnings, privacy messages, constraints, and controls. |
| Interaction | JavaScript whole-card click handlers or native buttons | Expand the existing button's hit area through CSS. Keep one native action per card and a visible keyboard focus outline. |
| Live practice | Extend all decoration into gameplay or quiet live workspace | Do not run this enhancer in live session hosts. No observers, new animation loops, timing changes, input hooks, scoring changes, or storage writes. |
| Mobile | Shrink desktop controls or reflow | Full-width list entries, wrapped filters, stacked setup panels and letter targets at least 44 CSS pixels at tested widths. |
| Motion | Persistent animation or state-only feedback | Small hover feedback only; support reduced motion and system forced colors. |

## Primary references

1. Monkeytype README — unobtrusive prompts, minimal typing focus, and feedback in place. https://github.com/monkeytypegame/monkeytype#readme
2. Aimlabs — task/playlist discovery and training organized around skills. https://aimlabs.com/
3. W3C, Target Size (Enhanced) — 44 by 44 CSS-pixel target guidance; this is an enhanced criterion, not a claim that all WCAG criteria have been certified. https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html
4. W3C, Focus Not Obscured — keyboard focus must remain visible. https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
5. W3C, Contrast (Minimum) — text contrast requirements. https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
6. W3C, Headings — meaningful structure rather than visual labels alone. https://www.w3.org/WAI/tutorials/page-structure/headings/
7. web.dev, prefers-reduced-motion — respect motion preferences. https://web.dev/articles/prefers-reduced-motion

The references inform the choices above; they do not prove that this particular redesign improves learning. No competitor artwork, fonts, layouts, or proprietary assets were copied.

## Implementation boundaries

- `practiceLabWorkshop.js` builds presentation with native DOM methods and textContent. It contains no HTML sinks, persistent storage, telemetry, timers, mutation observers or engine imports.
- Layout preference is a WeakMap entry removed when Practice Lab unmounts. It is not added to saved user data.
- The outer setup renderer preserves picker focus when recommendations finish loading; live keyboard captures remain outside this path.
- Letter selection dispatches existing `choose-weak-key` actions. Validation and session construction remain in the existing controller.
- The setup orientation strip is not interactive navigation, and does not pretend that a session or result already exists.
- `practiceLabIdentity.js` calls the enhancement only in existing home/setup render paths. Existing dependency-injected and fake-DOM renderers remain supported.
- Service-worker cache revision includes the two new assets without clearing IndexedDB, local progress, or custom text.

## Verification plan and limits

Unit checks cover the family/layout allowlists, keyboard index bounds, teardown, source isolation, the existing UI controller and offline shell. Real-browser checks cover library layouts, search/filter composition, route-return state, letter selection by keyboard, target size, no horizontal overflow, focus preservation and live input isolation. Existing all-drill completion, assessment/protocol and result-persistence tests remain regression gates.

Browser screenshots and axe checks support visual/accessibility review. Phone-sized browser emulation is not a physical-device test or comprehensive assistive-technology certification. Production checks compare deployed assets before opening the live UI.

## Interaction hardening

An identical catalog refresh used to replace the button between pointer-down and click. A native-browser regression reproduced zero activations before the fix and one afterward. Identical visible catalog updates now keep the mounted DOM, search field, layout controls, and button alive; changed catalog data still renders normally. This adds no timers, observers, or early pointer-down activation.
