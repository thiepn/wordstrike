# PL27 — Burst Sprints

Status: implementation candidate

## Purpose

PL27 adds a target-free short-form burst diagnostic/training mode. It measures controlled acceleration above sustainable typing pace without turning a single lucky sprint into a maximum-speed claim.

## Frozen protocol

- 6 sprint bouts
- 10 seconds active typing per sprint
- 15 seconds full recovery between bouts
- 60 seconds scored active typing
- 75 seconds recovery
- 135 seconds total protocol time
- correction behavior: allowed
- timing: on-start
- resumable: no
- interruption/page-hide: invalidates the protocol

## Measurement contract

Each sprint is scored independently from bounded aggregate metrics. A sprint is estimator-eligible only when it is complete, contains at least 25 accepted characters, reaches at least 88% strict accuracy, and has positive corrected WPM.

A complete session needs at least 3 eligible sprints. The canonical session estimate is the median corrected WPM of the 3 fastest eligible sprints. This makes the estimate deliberately resistant to one anomalous fastest bout.

The six-bout dose produces at most one canonical PL13 ability observation:

- channel: `burst`
- source role: `diagnostic`
- synthetic measurement duration: 10 seconds
- WPM: robust top-three estimate
- accuracy: pooled accuracy over the selected three bouts
- persistence/uncertainty/estimator ownership: existing PL13 machinery

Incomplete, interrupted, or protocol-invalid sessions produce no burst ability observation.

## Ownership boundaries

PL27 does not create a new ability store, estimator, schema, or persistence channel. PL13 owns burst state, uncertainty, confidence, clipping, and longitudinal merging.

PL27 does not update the PL14 Control Frontier. Pace Ladder remains the control-frontier diagnostic.

PL27 does not claim universal maximum WPM, endurance ability, cold-transfer performance, or a single-sprint personal best.

## UI behavior

During sprints, live WPM is hidden. The user sees sprint number and remaining time only, plus the instruction to type fast while staying controlled. Recovery intervals reject typing and are excluded from active timing.

The result view shows the robust burst estimate, estimator-selected bouts, accuracy, eligibility, controlled-speed reference when available, and burst reserve when a reference exists.
