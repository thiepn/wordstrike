# Practice Lab Benchmark + Transfer Framework (PL18)

PL18 formalizes WordStrike's protected measurement architecture. It keeps training, cold transfer, and benchmark evidence methodologically distinct and prevents target-conditioned selection from being mislabeled as transfer.

## 1. Canonical distinction

- **Training:** content may be selected because it contains a target.
- **Cold transfer:** protected transfer content is selected independently of targets, then naturally occurring entity opportunities are attributed post-hoc.
- **Benchmark:** standardized protected forms are constructed, versioned, and engineering-matched before the user's result or target enters the equation.

There is no target-to-protected-content reverse-selection path in PL18.

## 2. Cold terminology and limitation

`cold` means the transfer unit has not previously been served to the current Practice profile according to the current local Practice exposure history. It does not mean the human has never encountered the text elsewhere. Manual storage deletion, external source exposure, or repository inspection cannot be detected.

Protected partitions are methodological controls, not encrypted exam banks.

## 3. Precommitment

Cold-transfer reservations separate selection from revelation. A unit may be reserved before a later target/treatment decision. `reservedAtUtc` allows downstream PL25/PL32 systems to verify ordering without PL18 itself making causal claims.

## 4. Persistent exposure state

PL18 advances Practice DB **5 -> 6** and adds exactly one structural store: `evaluationStates`.

There is one evaluation-state record per profile, not per keyboard context. Familiarity with text survives a QWERTY/QWERTZ context switch.

The state records only bounded IDs, counts, timestamps, active reservations, suite/pool lanes, and `historyStatus` (`complete`, `partial`, `reset`). It stores no protected passages, typed text, raw events, or mistyped strings. The record limit is 64 KiB.

Ordinary quota recovery never prunes evaluation state because deleting exposure history could relabel previously seen material as fresh. Full Practice reset clears it; after reset, coldness applies only to the new local history.

Corrupt state is quarantined. Known exposures may be reconstructed from retained PL18 session summaries, but reconstructed history remains `partial`, so strict cold certification is disabled.

## 5. Reservations and claim-before-reveal

Reservation TTL is **2 hours**, with at most **8** active reservations per profile. Reserve APIs are typed separately for benchmark and cold transfer and reject target-like or unknown selector fields.

A reservation chooses only an ID; it does not reveal protected text. Claim requires profile, context, reservation and session identity. Claim atomically validates ownership, marks material exposed, consumes the reservation and returns an immutable binding. Protected content can load only after that binding exists.

If claim/exposure persistence fails, text is not revealed. If the later session commit fails or the user abandons after reveal, exposure remains recorded. A claimed cold-transfer unit is never returned to the cold pool.

## 6. Benchmark suites

PL18 defines versioned immutable `PracticeBenchmarkSuite` artifacts. V1 comparability is only `engineering-matched`; empirical equating is not implemented and `calibration` remains null.

Initial ID: `WS-BENCH-EN-1`.

Release target: 8 forms; minimum ready count: 6. Each form targets 2,000–4,000 graphemes and at least 250 natural-text words, with unique content families within and across released forms.

Ready benchmark matching requires:

- PL10 available model weight >= 0.90;
- weighted RMS feature distance <= 0.75;
- difficulty-index spread <= 0.50;
- relative-difficulty percentile spread <= 15;
- grapheme length within +/-15% of suite median;
- no core standardized feature farther than 1.25 from the suite median feature value.

Matching uses general PL10 typability features and form length only. It never optimizes for keys, n-grams, mastery, weaknesses or limiters.

**PL18 v1 benchmark forms are engineering-matched, not empirically equated.**

The current protected benchmark corpus cannot meet the release gates: it contains one approved 77-grapheme / 13-word natural sentence, and its protected PL10 typability score has only 0.62 available model weight. Therefore `WS-BENCH-EN-1` is intentionally checked in as `draft` with zero released forms rather than weakening the gates or fabricating content.

## 7. Cold-transfer pools

PL18 defines `PracticeTransferPool` and one-time `PracticeTransferUnit` artifacts from the transfer partition only.

Initial ID: `WS-TRANSFER-EN-1`.

Release target: 32 units; minimum ready count: 16. Units target 2,000–4,000 graphemes, unique families across the pool, and broad engineering typability control. Core transfer percentiles are allowed in 20–80 and preferably 30–70.

Selection order is a deterministic hash of selection-policy version + profile + pool + unit. The selector accepts no target-specific inputs and reads no skill stats, learning state, limiter snapshot or mastery snapshot. A change from weakness `br` to `th` cannot change the chosen unit from the same exposure state.

If an independently selected unit contains zero occurrences of a recently trained entity, the result is simply no transfer evidence for that entity. PL18 does not resample another passage.

When every unit is claimed, the pool returns `COLD_TRANSFER_POOL_EXHAUSTED`. Cold units are never recycled.

The current protected transfer corpus contains only one approved 80-grapheme / 13-word natural sentence, so `WS-TRANSFER-EN-1` is intentionally `draft` with zero released units.

## 8. Protected loader

Protected evaluation content does not use ordinary target-driven training lookup. `loadPracticeEvaluationContent` requires a claimed binding, exact benchmark/transfer partition, constituent content-hash agreement and composite binding identity. Loading is same-origin through injected WordStrike static-content infrastructure; the PL18 module itself performs no third-party fetch.

## 9. Evaluation protocol

Benchmark and cold-transfer v1 use a fixed 60,000 ms duration protocol, `on-first-input` timing, correction mode `allow`, no target entities, no resumability, no content append and no pause/resume.

Measurement feedback is a transient override: live WPM, live aggregate accuracy, rhythm feedback, metronome, adaptive hints and target hints are disabled. Persistent user settings are not overwritten.

## 10. Integrity

Integrity statuses are `valid`, `nonstandard`, and `invalid`, with bounded reason codes. Core invalidating conditions include wrong/missing binding, wrong partition/hash, targeted content, append, wrong duration/completion, manual stop, pause/visibility interruption, restore, wrong correction policy, feedback-policy violation, content exhaustion, transfer repeat or unsupported protocol.

Partial history and benchmark repeat are nonstandard rather than fabricated as fresh.

PL18 explicitly derives evidence-admission booleans so downstream phases do not infer eligibility indirectly.

### Fresh benchmark

Valid + first exposure + complete history:

- PL11 skill evidence: eligible (`benchmark` role)
- PL13 ability: eligible when the declared ability channel otherwise qualifies
- PL16 transfer: not applicable
- benchmark comparison: eligible

### Repeated benchmark

- integrity: nonstandard
- PL11 canonical skill update: false
- PL13 ability update: false (`evaluation-not-fresh`)
- strong benchmark comparison: false; descriptive-only result allowed

### Cold transfer

Valid + fresh + complete history:

- PL11 skill evidence: eligible (`transfer` role)
- PL13 ability: eligible when channel policy otherwise qualifies
- PL16 transfer observation: eligible
- PL16 acquisition dose: always zero

### Partial-history transfer

Strict cold inference is disabled: PL11 protected evidence, PL13 ability and PL16 transfer admission are false. Descriptive session metrics may remain.

### Invalid evaluation

All protected-evidence admission booleans are false.

## 11. PL11 / PL15 / PL16 / PL17 boundaries

PL11 now admits protected benchmark/transfer role evidence only through PL18 integrity admission. Repeated benchmark forms do not inflate role robustness.

PL15 transfer remains derived from PL11 transfer evidence; its semantics strengthen automatically because PL11 now accepts only admitted cold-transfer evidence. Fresh benchmark evidence may corroborate context robustness; repeated forms may not.

PL16 transfer observations require trusted PL18 `cold-transfer` purpose. Protected benchmark/transfer sessions never add acquisition dose.

PL17 remains deliberately separate: retention review is targeted, delayed, and uses training material. Cold transfer is untargeted and uses the protected transfer partition.

## 12. Ability

PL18 benchmark/transfer measurements reuse PL13's adjusted-performance and uncertainty core. PL18 does not create a second typability correction, a population percentile, or a 0–100 benchmark score. One benchmark measurement is one observation; PL13 latent ability remains the stable estimate.

Existing non-PL18 PL13 diagnostic ability protocols remain valid and do not universally require an evaluation binding.

## 13. Benchmark comparison

`comparePracticeBenchmarkMeasurements(a,b)` uses adjusted log performance. Strongest comparison requires same suite/protocol, valid integrity, fresh first exposures, engineering-matched forms and compatible context.

Delta is `Yb - Ya`; relative difference is `exp(delta)-1`; combined uncertainty is `sqrt(sigma_a^2 + sigma_b^2)`; reliability uses `|z| >= 1.96`; practical difference uses the existing 2% threshold.

Outputs are `higher`, `lower`, `similar` or `uncertain`, never `improved`/`regressed`. Repeated forms are explicitly `exposure-contaminated`.

## 14. Version envelope

PL18:

- Practice DB: 6
- evaluationState record: 1
- sessionSummary: 11
- foundationAnalysis: 9
- evaluation framework/state/selection/reservation/integrity/analysis: 1
- benchmark suite/form/match policy: 1
- transfer pool/unit/selection policy: 1

Historical session v10 -> v11 adds `evaluationSummary: null`. No historical benchmark-like or transfer-like session is retroactively certified under PL18.

## 15. Build architecture

`scripts/buildPracticeBenchmarkSuite.mjs` and `scripts/buildPracticeTransferPool.mjs` are deterministic, support `--validate`, use exact protected partitions, bind corpus/index/PL10 identities and atomically replace generated manifests. Build-time work may be heavier; browser selectors only inspect bounded prebuilt forms/units.

The registries are pure and lazy. Importing PL18 pure modules performs zero IndexedDB/localStorage access, zero fetches, zero timers and zero listeners.

## 16. Remaining limitations

PL18 does not implement empirical form equating, population norms, percentile rankings against other users, benchmark leaderboards, Full Assessment orchestration, assessment scoring/profile synthesis, public benchmark UI, automatic transfer scheduling, treatment-effect causality, adaptive transfer targeting, research-holdout experiments, or public release.

PL19 must consume these benchmark/transfer artifacts and reservation APIs rather than creating another framework. PL25 may reserve cold transfer before choosing training. PL32 may use reservation timestamps for later treatment-order checks. PL38 may empirically calibrate forms and retest effects while preserving PL18 version/checksum identities.

## 17. Permanent architectural rule

Training content may know the target. Transfer content must not know the target. Benchmark content must be fixed before the target or user result.

The canonical transfer path is protected pool -> target-blind reservation -> optional precommitment -> claim/exposure before reveal -> fresh typing -> post-hoc annotation -> naturally occurring entity evidence.

The canonical benchmark path is protected benchmark corpus -> build-time form construction -> PL10 engineering matching -> versioned immutable suite -> profile-wide rotation -> claim/exposure tracking -> standardized session -> adjusted performance + uncertainty.

Fresh benchmark is not repeated benchmark; cold transfer is not target-rich unseen practice; engineering-matched is not empirically equated; benchmark measurement is not latent ability; transfer absence is not transfer failure.
