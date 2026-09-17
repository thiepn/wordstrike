# Flow Phase 1 telemetry notes

The Phase 1 engine keeps raw typing telemetry intentionally separate from future scoring logic.

Recorded data:

- every inserted character with expected/actual value, position, correctness, and timestamp
- every backspace with removed position/value and timestamp
- wrong-character events
- correction events with correction delay
- word completion attempts with start/end indexes and timing
- sentence completion attempts with start/end indexes and timing

A passage may finish with unresolved mistakes. This is deliberate: Phase 1 must preserve both corrected and uncorrected error information so later scoring/cadence phases can decide how to interpret it without changing the typing engine.
