# Full Assessment input repair

## Reproduced defects

On the current public UI, the first 20 keyboard characters advanced the assessment cursor. Clicking the displayed passage then moved focus to the document body, and the next 20 keyboard characters did not advance it. Separately, the assessment renderer omitted the `practice-real-text-char` class used by the existing caret/correct/error styles, so even accepted typing lacked visible feedback.

Baseline browser reproduction: commit `52184f2a1accb2c5d502d25b7ef722c2e73776a4`, Actions run `35474512564`. The regression failed in Chromium, Firefox and WebKit. Earlier locator-based typing tests automatically focused the textarea and did not exercise this user path.

## Repair

- Every measurement block owns one persistent native capture. Clicking/tapping its passage focuses that capture without scrolling the page. Timer updates do not steal focus from buttons.
- The bounded passage renderer uses the existing styled character classes and an explicit current-character marker. Correct typing, errors and corrections are visible without showing live aggregate scores or adaptive coaching.
- A labeled field, placeholder and focus status explain where to type and where typed feedback appears. Losing focus does not pause or reset standardized timing.
- Block-owned input listeners accept ordinary typing, line breaks, corrections and native input-only events. IME intermediate edits are not scored repeatedly; committed text is normalized and segmented consistently with the engine. Paste and drop remain disallowed for measured typing.
- Ending/completing a block removes its listeners. The offline shell includes the input module. No storage schema, scoring formula, protected assessment content, account behavior or existing progress is changed.

## Verification

`tests/browser/assessment_input.mjs` operates the actual public UI with keyboard events rather than locator APIs that secretly focus the input. It runs every block of Quick (3), Standard (6) and Deep (10); checks initial focus, click/tap recovery, visible caret, errors, Backspace, non-stealing timers, composition/fallback events, no paste scoring, exactly-once completion and reload persistence. The test also supports the live URL with service workers enabled and saturated localStorage.

`tests/practice-assessment-input.test.js` covers input routing, grapheme normalization, composition commit deduplication, paste protection and listener cleanup. Browser composition events are simulated; this is not certification of every physical mobile keyboard or operating-system IME.

The release workflow compares the deployed input module, assessment host and service worker with the checked-out release before executing the live journey. No user browser data is cleared by the repair or the verification.
