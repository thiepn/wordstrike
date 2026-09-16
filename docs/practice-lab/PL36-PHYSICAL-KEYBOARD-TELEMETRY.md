# PL36 — Physical Keyboard Advanced Telemetry

Status: experimental developer-gated Practice telemetry sidecar.

## Scope

PL36 records bounded, local aggregate telemetry only for completed Practice sessions whose resolved context explicitly declares `inputMethod: physical` and whose user setting `physicalKeyboardTelemetryEnabled` is enabled. It is not an experiment, score, typing mode, ability estimate, technique grade, hardware detector, or authentication mechanism.

Canonical textual correctness remains owned by the Practice input/session engine. PL36 observes `KeyboardEvent.code` before browser input is reduced to text and joins that transient physical position to the canonical processed input outcome. It never treats `event.key` as a persistent field and never reconstructs physical positions from characters.

## Privacy boundary

Persisted entities are limited to `physical-key`, `physical-transition`, and `modifier-route`. Raw key sequences, raw event timestamps, `event.key`, typed text, wrong strings, passages, Custom Text content, and remote/cloud telemetry are forbidden. The feature does not use WebHID or WebUSB.

Persistent PL36 telemetry is excluded for Custom Text and for transfer, benchmark, and research-holdout roles/partitions. Software and unknown input contexts collect nothing. Disabling the setting stops future collection while retaining existing local aggregates until the user clears them or Practice data is reset.

## Storage

Database version 11 adds `physicalTelemetryStats` and `physicalTelemetrySessions`. The canonical Practice session-summary record version is unchanged. PL36 writes after the canonical Practice commit. A failed PL36 sidecar cannot roll back or invalidate the completed Practice session.

A successfully applied session marker makes the merge idempotent. The stat merge and `applied` marker share one PL36 transaction. Coverage below 80% valid physical codes or below 30 eligible text events is marked `insufficient` and does not merge stats.

## Timing and errors

PL36 reuses the PL8 transition-eligibility policy and accepts PL10 normalized residuals when available. It introduces no replacement latency threshold. Physical-key error reporting is named **observed misstrike-origin rate** and is based only on first-pass error origins; it is not physical-key accuracy. Physical transitions are actual successful code-to-code succession such as `KeyT → KeyH`, never textual bigrams.

## Modifier observations

Left/right Shift, Alt, Control, and Meta state is transient. Persisted modifier routes use only broad output classes and broad modifier state, for example `uppercase-letter|shift|left`. Ctrl/Meta command routes are excluded. AltGraph is detected with `getModifierState("AltGraph")`. Modifier observations are descriptive and never recommended technique.

## Isolation

PL36 v1 has no consumer in limiter, mastery, learning, review scheduling, Daily Coach, PL33 personalization, or PL32 treatment response. No normal session summary or Treatment Episode contains physical telemetry.
