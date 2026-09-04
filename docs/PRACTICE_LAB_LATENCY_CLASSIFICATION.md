# Practice Lab Robust Latency Classification

Status: PL8 foundation  
Practice database structural version: unchanged at 2  
Session-summary record version: 3  
Latency classifier version: 1  
Latency policy version: 1  
Foundation-analysis version: 1

## 1. Purpose

PL8 is the first generic user-performance interpretation layer. It separates ordinary fluent execution from unusually slow active typing and hard interruptions without turning arithmetic mean latency into a weakness label.

A trace such as `82, 86, 91, 95, 102, 109, 124, 1420 ms` should not make a single mean the canonical statement about motor speed. PL8 instead estimates a robust fluent component and classifies comparable transitions relative to that session-local baseline.

PL8 does not implement error phenotypes, context/typability normalization, persistent entity aggregation, ability estimation, target priority, Daily Coach logic, or a public Practice mode.

## 2. Canonical timing classes

Every retained insertion event receives one final transition classification:

- `fluent`: correct, comparable insertion timing at or below the adaptive session threshold;
- `disfluent`: correct, comparable insertion timing above the adaptive threshold but below the hard interruption boundary;
- `interruption`: comparable timing at or above the hard interruption boundary;
- `excluded`: timing that should not enter ordinary fluent/disfluent interpretation.

`fluent` is not a mastery/quality label. `disfluent` does not diagnose why the transition was slow. Correctness remains a separate dimension; incorrect/current-after-incorrect transitions are excluded from the v1 fluent baseline so PL9 can analyze them without contaminating normal execution timing.

## 3. V1 engineering policy

The canonical v1 policy is a versioned engineering policy, not a scientifically optimal universal law:

```text
minimumCalibrationSamples      20
hardInterruptionMs           2000
minimumAdaptiveThresholdMs    250
medianMultiplier              2.5
robustSigmaMultiplier           4
maximumAdaptiveThresholdMs   1500
legacy longHesitationMs       750
```

The hard interruption value reuses `PRACTICE_SESSION_LIMITS.inactiveTransitionMs`. The old 750 ms long-hesitation boundary remains a compatibility diagnostic only; it is not the definition of disfluency.

## 4. Robust statistics

`practiceRobustStats.js` defines one deterministic contract:

- finite-value filtering is explicit and non-mutating;
- median uses the center observation for odd N and the mean of the two center observations for even N;
- quantiles use linear interpolation at `(n - 1) * p` (R-7 / common NumPy default semantics);
- `MAD = median(|x_i - median(x)|)`;
- robust normal-equivalent scale is `1.4826 * MAD`.

Empty robust-stat sets return `null`, never `NaN` as a normal missing-data value.

## 5. Calibration eligibility

The session-local baseline uses only transitions that are:

- insertion events;
- finite and non-negative;
- below the hard interruption boundary;
- inside one timing segment;
- not the first insertion of the session/restore segment;
- not the first insertion after a correction boundary;
- current insertion correct;
- prior relevant insertion correct.

Both `backspace` and `word-delete` create correction boundaries. The first insertion after correction is `excluded/post-correction`. Incorrect events remain in the transient event trace; PL8 does not delete or rewrite them.

## 6. Adaptive threshold

With at least 20 calibration samples:

```text
M = median(calibration latencies)
MAD = median absolute deviation
S = 1.4826 * MAD

T = max(
  250 ms,
  2.5 * M,
  M + 4 * S
)

T is capped at 1500 ms and always remains below 2000 ms.
```

Comparable correct transitions are then:

```text
latency <= T          -> fluent
T < latency < 2000    -> disfluent
latency >= 2000       -> interruption
```

The threshold is session-local. PL8 does not persist it as a permanent user threshold or create per-target/language thresholds.

## 7. Insufficient evidence

With fewer than 20 calibration samples:

```text
calibration.status = insufficient-data
thresholdMs = null
disfluencyRate = null
```

Median/MAD may still be reported descriptively inside calibration metadata. Hard interruptions and legacy long-hesitation observations can still be counted. Comparable sub-threshold transitions remain `excluded/insufficient-data` rather than receiving fabricated fluent/disfluent labels.

## 8. Timing segments

Each new input event carries a deterministic integer `timingSegmentId`. The first active segment begins at 1.

A new timing segment begins after normal pause/resume and after checkpoint restoration. Correction activity does not create a new segment; it uses the separate post-correction exclusion.

The first insertion after:

- initial session start -> `excluded/segment-start`;
- normal pause/resume -> `excluded/timing-boundary`;
- checkpoint restore -> `excluded/segment-start`.

A long 2000+ ms latency is an interruption but does not itself mutate the timing segment. Later transitions may return to normal classification.

Event-tail semantics are explicitly versioned with `PRACTICE_EVENT_TRACE_VERSION = 2`. Historical checkpoint tail events without segment metadata normalize in memory and remain restorable.

## 9. Event-buffer coverage

The bounded event buffer still retains at most 20,000 events. It now exposes immutable content-free metadata:

```text
capacity
retainedEventCount
totalEventCount
truncated
```

Latency analysis persists a coverage object with:

```text
scope = complete-session | retained-window
```

If the event trace overflowed or a legacy restore cannot prove completeness, analysis uses `retained-window`. This does not invalidate WPM/accuracy or the whole session; it only constrains claims made from the retained trace. A truncated trace also caps analysis confidence so it cannot claim `high` whole-session coverage.

## 10. Summary rates

Canonical rates use the 0..1 convention.

```text
disfluencyRate = disfluent / (fluent + disfluent)
```

Hard interruptions and excluded observations do not enter that denominator. If there are no fluent/disfluent observations, the rate is `null`.

```text
interruptionRate = interruption / (fluent + disfluent + interruption)
```

The summary also retains fluent median/MAD/P90, disfluent median, counts, threshold, long-hesitation count, and bounded exclusion-reason counts.

## 11. Generic foundation analysis

Every finalized Practice session now creates:

```text
foundationAnalysis = {
  version: 1,
  latency: ...
}
```

before any experiment-specific `analyzeResult()` call. The experiment receives the frozen foundation analysis in addition to the existing session snapshot, metrics snapshot, event trace, and observations.

Experiment output cannot author or overwrite the canonical generic `fluencySummary`. `buildPracticeSessionResult()` owns that field from `foundationAnalysis.latency.sessionSummary`.

## 12. Session-summary schema and migration

`sessionSummary` advances from record version 2 to 3 and adds:

```text
fluencySummary
```

Historical v2 summaries migrate with:

```text
fluencySummary: null
```

Historical raw traces were not persisted, so robust fluent median/MAD, disfluency rate, and threshold cannot be honestly reconstructed from old arithmetic mean/variance fields. PL8 deliberately does not fabricate them.

Practice IndexedDB stays at structural version 2. `skillStat`, profile, review-item and checkpoint record versions do not change.

## 13. Checkpoint/restore behavior

Checkpoints still store only the bounded recent event tail. New checkpoints add small event-trace coverage metadata inside the already-extensible metrics snapshot; no checkpoint schema bump is required.

On restore:

1. historical tail events without PL8 metadata are normalized in memory;
2. prior trace coverage is restored when known, otherwise conservatively marked partial;
3. a new deterministic timing segment is created;
4. the first resumed insertion is never compared as one continuous latency with pre-restore typing.

## 14. Privacy

PL8 uses raw timing/event evidence transiently in memory. Durable session summaries contain only compact aggregates.

PL8 does **not** add these to session summaries:

- raw event trace;
- classified event trace;
- raw latency arrays;
- custom-text contents;
- surrounding corpus passages.

The event-buffer metadata accessor is content-free.

## 15. Compatibility

PL8 does not redefine or remove existing:

- `wpm`;
- `rawWpm`;
- `accuracy`;
- correction-cost metrics;
- word-start delays;
- `longestInputHesitationMs`;
- legacy coefficient-of-variation `consistency`.

The robust classifier runs at finalization, not per key, so normal input handling remains O(1) aside from existing work.

## 16. Future contracts

PL9 may correlate transient classified transition indices with error/correction sequences. PL10 may model expected latency conditional on target/context. PL11 may aggregate fluent latency/disfluency evidence per `profile -> context -> entity`. PL12 may later infer limiter phenotypes such as slow vs hesitant.

Those phases consume PL8 evidence; PL8 itself does not implement their conclusions.
