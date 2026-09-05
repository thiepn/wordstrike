# Practice Lab Context & Typability Normalization Model

Status: PL10 generic normalization foundation; model semantics remain authoritative for PL10  
Current storage/foundation wrapper versions are superseded by PL11; see `PRACTICE_LAB_DATA_ARCHITECTURE.md` and `PRACTICE_LAB_SESSION_ENGINE.md`.  
PL10 baseline at phase close: Practice database structural version 2, sessionSummary 5, checkpoint 2, foundationAnalysis 3.  
Normalization-analysis version: 1  
Context-model version: 1  
Context-policy version: 1  
Text-feature version: 1  
Typability-model version: 1  
Typability-reference version: 1  
Keyboard-geometry version: 1

## 1. Purpose

PL10 adds two neutral normalization layers underneath future Practice interpretation:

1. **transition context normalization** — estimates how long a transition would ordinarily be expected to take under the current session/context, then reports residual latency;
2. **text/context typability normalization** — describes how mechanically demanding the content is expected to be, independently of user weakness.

The model is deliberately observational. It does not rank weaknesses, decide mastery, estimate ability, schedule reviews, choose targets, or drive a public Practice UI.

## 2. Protected boundaries

PL10 consumes PL5 context identity, PL7 content/entity indexes, PL8 latency classifications, and PL9 error/recovery facts. It does not rewrite those contracts.

The exact session context is frozen at `prepare()`. Normalization never derives historical identity from mutable current settings. Unknown keyboard geometry falls back to coarser context instead of inventing a physical layout.

## 3. Transition context model

PL10 fits expected latency only from valid PL8 `fluent` transitions. Disfluent transitions may be scored against the fitted model but never train it.

The hierarchy uses progressively coarser buckets until enough evidence exists. The current v1 engineering policy requires at least four samples for a bucket and uses recursive shrinkage with `K = 12`.

When no sufficiently supported context bucket exists, expected latency falls back safely to the PL8 fluent session baseline.

## 4. Context features

The current context signature may include bounded coarse features such as:

- structural transition class;
- word-position class;
- keyboard geometry class when known;
- word frequency band when a validated reference exists;
- bigram frequency band when a validated reference exists.

Exact words, arbitrary browser/device fingerprints, hardware nicknames, and raw content excerpts are not context features.

## 5. Residual latency

For a transition with a finite expected value:

```text
residualMs = observedLatencyMs - expectedLatencyMs
```

Negative residuals are valid and mean the transition was faster than expected under the model. Residuals are unavailable across interruption/excluded timing boundaries and are never fabricated when the model lacks adequate evidence.

PL11 consumes these residuals as observational evidence; PL10 itself does not decide whether a residual represents a weakness.

## 6. Keyboard geometry

Geometry is a coarse optional feature. If the context/layout cannot be mapped safely to known geometry, the feature is `unknown` and normalization falls back to coarser context. PL10 does not infer a physical device or keyboard from user-agent/touch heuristics.

## 7. Text difficulty / typability

Text difficulty is estimated from bounded, content-derived mechanical features and validated references where available. The output is relative context difficulty, not user ability.

A partial result is valid when only some model components are available. Coverage explicitly reports the available model weight rather than silently normalizing missing information as if it were known.

## 8. Protected corpus partitions

Training, transfer, benchmark, and diagnostic partitions remain governed by PL6/PL7 provenance and content-use guards. PL10 never searches another partition as a fallback and never reclassifies content based only on experiment metadata.

This provenance boundary is reused by PL11 evidence-role resolution so protected role evidence cannot be spoofed.

## 9. Session integration

At session finalization, PL10 receives PL8 latency analysis plus the frozen content/context snapshot and produces:

- transient normalized transition facts for downstream same-session analysis;
- a compact durable `normalizationSummary` suitable for session history.

The phase-close PL10 wrapper was `foundationAnalysis v3`. PL11 later advances the wrapper to v4 by adding canonical skill evidence while preserving PL10 normalization output unchanged.

## 10. Durable summary

The PL10 `normalizationSummary` is compact and versioned. It may store:

- context fingerprint/locale/layout/input method;
- normalization coverage/status;
- aggregate residual information;
- compact text-difficulty/reference metadata.

It does not persist raw text, per-transition residual traces, full feature vectors, entity residual maps, frequency tables, hardware nicknames, browser/device fingerprints, or leaderboard fields.

Historical sessionSummary v4→v5 migration adds `normalizationSummary: null`; the raw evidence required to reconstruct PL10 normalization is not available historically.

PL11 later advances sessionSummary v5→v6 only to add `skillEvidenceSummary`; it does not reinterpret historical PL10 normalization.

## 11. Testing invariants

PL10 tests preserve:

- PL8 fluent-only baseline fitting;
- minimum sample threshold and recursive shrinkage;
- safe global fallback for underpowered buckets;
- disfluent scoring without model fitting;
- interruption/excluded transition residual nullability;
- unknown-geometry fallback;
- mandatory slow-target preservation;
- internally consistent context coverage/hierarchy counts;
- protected partition semantics;
- unchanged underlying WPM/error metrics.

## 12. Later-phase contract

PL11 may aggregate PL10 residuals by canonical skill entity. Later interpretation phases may use those accumulated observations, but they must not retroactively change PL10 expected-latency/residual definitions without a new explicit model version.