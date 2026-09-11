# PL35 — Metronome Typing

PL35 adds a target-blind cadence experiment without changing Practice Lab storage schema, ability estimation, acquisition dose, physical-key telemetry, or Coach Personalization.

## Protocol

- Durations: **2 / 5 / 8 minutes**; default **5 minutes**.
- Begin with a silent natural-text baseline.
- Convert baseline gross characters per minute into a fixed session tempo by testing integer `charsPerBeat` values **1–16**, retaining only **90–180 BPM**, then selecting the candidate nearest **120 BPM**.
- Tempo is fixed after calibration. It never adapts during the session and is not user-defined.
- Before the first pulse block, provide a **4-beat count-in**.
- Condition blocks are deterministically counterbalanced between **Pulse on** and **Pulse off**. Counterbalancing is not randomized treatment assignment.
- Finish with a silent integration block.
- Audio cueing is preferred when supported and unlocked; otherwise use an automatic visual fallback.
- A pulse is an external cadence cue. PL35 does **not** assume one character or one keypress per beat and does not calculate phase-locking or neurological entrainment.

## Measurements

PL35 compares pulse and silent condition blocks descriptively using:

- pace variation,
- effective pace,
- first-pass accuracy,
- disfluency rate,
- correction-cost rate.

Results use association language only. There is no score, personal best, rank, leaderboard, or causal interpretation.

## Treatment-response boundary

A completed PL35 session may create one PL32 Treatment Episode. The same-session integration block is never a delayed outcome. The treatment baseline is the session's initial silent baseline. The first compatible silent baseline from a later session may be linked as the delayed outcome only when it occurs at least **24 hours** later and on a different local day. Baseline protocol duration and analysis version must remain compatible.

Duration and cue mode are retained as separate response dimensions. The counterbalance variant is deliberately excluded from treatment assignment semantics.

## Explicit exclusions

PL35 does not modify PL13 ability inference, PL16 acquisition dose, PL33 Coach scheduling/personalization, IndexedDB schema/store layout, physical key/finger/hand telemetry, music/haptics, or public ranking systems.
