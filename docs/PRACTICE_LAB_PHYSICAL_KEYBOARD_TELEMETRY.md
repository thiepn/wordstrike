# Practice Lab — Physical Keyboard Advanced Telemetry (PL36)

PL36 is an optional, local-only sidecar for Practice sessions performed in an explicitly declared `inputMethod: physical` context. It is not a typing mode, experiment card, score, ability estimate, hardware detector, biometric system, ergonomic diagnosis, or technique grader.

## Consent and context

`physicalKeyboardTelemetryEnabled` defaults to `false`. Collection begins only after explicit opt-in and only while an eligible physical-keyboard Practice session is active. WordStrike does not infer physical input from browser heuristics. `unknown` and `software` contexts collect nothing.

## Physical event semantics

The browser's `KeyboardEvent.code` is treated as a physical-position identity. It is never translated into a universal character identity. Textual correctness remains authoritative in the canonical Practice input/session engine. PL36 joins a transient physical code to the canonical processed input outcome; it does not reconstruct physical keys from characters.

The whitelist is bounded to supported alphanumeric, punctuation, numpad, and Space codes. Repeats, composition, dead keys, and Ctrl/Meta command shortcuts are excluded. AltGraph is detected through `getModifierState("AltGraph")`. Left/right modifier state is transient; unknown Shift side stays `unknown` rather than being guessed.

## Persisted entities

Only three entity types persist:

- `physical-key`
- `physical-transition`
- `modifier-route`

No raw physical key sequence, raw physical event timestamp, `event.key`, typed passage, wrong string, Custom Text content/hash, protected-content identifier, or replay trace is stored.

Physical-key error reporting is named **observed misstrike-origin rate** and uses first-pass error origins. It is not physical-key accuracy. Transitions use physical identities such as `KeyT → KeyH`, never textual bigrams. Modifier-route statistics use broad output classes and modifier state only; they are observations, not technique recommendations.

## Timing

Transition timing eligibility remains owned by PL8. PL36 reuses that policy and can store PL10 normalized residual samples when they are available. It introduces no replacement latency threshold.

## Storage and atomicity

PL36 raises the structural Practice database version from 10 to 11 and adds:

- `physicalTelemetryStats`
- `physicalTelemetrySessions`

The canonical Practice session-summary record version does not change.

A completed canonical Practice session commits first. PL36 then applies an isolated sidecar. PL36 failure cannot roll back or invalidate canonical Practice evidence. An `applied` session marker makes the aggregate merge idempotent, and the stat merge plus marker share one PL36 transaction.

Persistent aggregation requires all of the following:

- telemetry enabled;
- explicit physical context;
- completed session;
- eligible training or diagnostic evidence role;
- at least 30 eligible text events;
- at least 80% valid physical-code coverage.

Custom Text, transfer, benchmark, research-holdout, software input, unknown input, and abandoned sessions do not contribute telemetry statistics. Privacy/gate exclusions leave no PL36 marker; low-coverage eligible sessions may receive an `insufficient` marker without merging statistics.

## Bounds

Per session:

- at most 512 transition identities;
- at most 64 modifier-route identities;
- at most 8 retained samples per entity.

Persisted:

- at most 32 recent samples per entity;
- 128 physical-key stats per context;
- 2048 transition stats per context;
- 128 modifier-route stats per context;
- 2304 total stats per context;
- 500 session markers per profile;
- 180-day session-marker retention;
- 8 KiB maximum stat record size.

## Confidence

Confidence requires both repeated observations and distinct sessions. Thresholds are entity-specific and intentionally conservative. Low-evidence observations are not promoted into the validated limiter, mastery, learning, review, Daily Coach, PL33 personalization, or PL32 treatment-response systems.

## Diagnostics and settings

The internal developer-gated **Physical Keyboard** diagnostics page appears in Practice navigation when the current context is physical. Historical local telemetry can still be rendered when collection is unavailable. The page shows local coverage, physical-code aggregates, physical transitions, modifier patterns, evidence confidence, local-only disclosure, opt-in controls, and a confirmed clear action.

The UI never labels a physical code as weak/strong, never presents modifier-side observations as recommended technique, and never claims the data is anonymous merely because it is local.

## Privacy and network isolation

PL36 does not use `fetch`, Supabase, leaderboards, WebHID, or WebUSB. The telemetry stores are browser-local only. Normal Practice reset clears the new stores together with other Practice data.

Implementation details and phase-specific notes also live in `docs/practice-lab/PL36-PHYSICAL-KEYBOARD-TELEMETRY.md`.
