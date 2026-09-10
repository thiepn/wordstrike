# Practice Lab PL23 — Accuracy & Recovery

## Purpose

PL23 implements the existing `accuracy-control` experiment as **Accuracy & Recovery**. It is the first Practice intervention defined primarily by a treatment mechanism rather than by target size. It trains one canonical PL11 entity through clean first-pass execution and natural recovery from real errors.

PL23 does not teach slow typing, manufacture mistakes, or force a correction technique. Its core rule is:

`Baseline → Control → Repair → Mix → Check`

A completed standard session is one direct PL16 acquisition dose for exactly one selected target.

## Model ownership

PL23 does not create another persistent skill, limiter, mastery, or learning model.

- **PL9** owns observable error/recovery episodes.
- **PL10** owns normalized timing.
- **PL11** owns persistent first-pass skill evidence and primary error attribution.
- **PL12** owns inaccurate/recovery-heavy diagnosis, hierarchy, and impact.
- **PL15** owns mastery/automaticity.
- **PL16** owns learning curves, acquisition dose, marginal gain, and saturation.
- **PL18** owns protected partition boundaries.
- PL23 owns only the v1 intervention protocol, transient repair feedback, and its same-session result analysis.

No database store, generic record, session-summary, or foundation-analysis version is introduced by PL23.

## Stable intervention identity

- experiment ID: `accuracy-control`
- experiment version: 1
- Accuracy / Recovery version: 1
- policy version: 1
- generator version: 1
- selection version: 1
- feedback version: 1
- result version: 1

Future treatment-effect work can therefore identify this as one stable intervention family.

## Supported targets

PL23 v1 trains exactly one target of one of these canonical PL11 types:

- `key`
- `bigram`
- `trigram`
- `word`

Target normalization is delegated rather than reimplemented:

- key rules come from PL21 Weak Keys;
- bigram/trigram rules come from PL20 Combination Repair;
- word rules come from PL22 Problem Words.

Manual entry requires an explicit family selector: **Key**, **Combination**, or **Word**. This prevents ambiguous text such as `the` from silently switching between trigram and word identity. Combination mode maps two graphemes to bigram and three to trigram.

Punctuation transitions, numeric patterns, and symbol patterns are outside PL23 v1.

## Recommendation policy

Recommendations are derived from existing evidence only. PL23 does not persist its selection score.

Primary recommendation evidence is PL12 `inaccurate` and `recovery-heavy`. `confirmed` and `likely` evidence is preferred; `possible` can be used secondarily. A mixed limiter is eligible only when inaccurate or recovery-heavy severity is materially involved. Slow-only, hesitant-only, and unstable-only targets are not normally recommended.

PL15 Learning/Acquired stages are preferred. Robust/Retained targets are excluded from ordinary PL23 recommendations, although manual practice remains possible after normal feasibility validation.

PL16 saturation statuses `likely` or `supported` de-emphasize recommendations. Manual practice remains available with the warning:

> Recent similar acquisition practice appears to have low marginal gain.

PL12 hierarchy remains authoritative. Strongly explained higher-order targets are de-emphasized, not declared causal. A user can still choose such a target manually.

At most eight candidates are returned.

## No claim of optimal treatment

A recommendation means only that current evidence makes Accuracy & Recovery reasonably relevant. It does not mean this treatment has been experimentally proven better than Weak Keys, Combination Repair, or Problem Words. PL32/PL33 own later treatment-effect and personalization work.

## Training-only content

Every PL23 source item is `partition = training` and uses approved training indexes/annotations. PL23 uses no target-selected:

- transfer content;
- benchmark content;
- diagnostic content;
- research-holdout content.

The final Check remains target-enriched training evidence, not cold transfer or generalization evidence.

Generated word sequences, where used, contain only approved training-derived lexical candidates. There is no runtime LLM sentence generation and no whole-corpus target scan.

## Entity adapters and probe reuse

PL23 deliberately reuses the established entity interventions rather than creating a fourth incompatible content/probe system:

- **key** content/probe composition delegates to PL21;
- **bigram/trigram** content/probe composition delegates to PL20;
- **word** content/probe composition delegates to PL22.

PL23 remaps their intervention phases to its stable control protocol. For combinations, Mix receives genuine target-free training-derived lexical material because PL20's target-rich Mix alone is insufficient for PL23's interleaving contract.

Probe matching remains owned by PL20/PL21/PL22, including their family/content disjointness, typability, geometry/position, feature-distance, or launch-context rules as applicable.

## Exact dose

One completed standard session equals one PL16 direct acquisition dose for the selected entity:

| Entity | Baseline | Control | Repair | Mix | Check | Total |
|---|---:|---:|---:|---:|---:|---:|
| key | 8 | 24 | 20 | 20 | 8 | **80** |
| bigram | 5 | 15 | 12 | 13 | 5 | **50** |
| trigram | 4 | 10 | 9 | 8 | 4 | **35** |
| word | 3 | 4 | 3 | 2 | 3 | **15** |

Dose is opportunity-based. An incorrect first attempt still counts as one opportunity; a retry does not add dose. Performance never extends the session, changes the target, or skips a phase.

## Phase semantics

### Baseline

- no target cue;
- no aggregate live feedback;
- matched pre-practice target observation.

### Control

- manageable target-rich contexts;
- subtle target cue;
- clean first-pass emphasis at comfortable normal pace;
- no numeric live accuracy target.

### Repair

- broader target-bearing contexts;
- subtle target cue;
- errors are not induced;
- normal correction behavior remains available;
- transient repair feedback can appear only after a real target-attributed PL9 episode closes.

### Mix

- target-bearing and genuine target-free material are interleaved;
- target cue off.

### Check

- matched target-enriched training material;
- target cue off;
- aggregate feedback off until completion;
- not transfer.

## No deliberate error injection

PL23 never:

- inserts fake mistakes;
- swaps letters to create an error;
- asks the user to type the wrong key;
- forces a wrong response;
- generates malformed target words;
- blocks forward typing until an error is corrected;
- requires a particular number of Backspace presses;
- requires 98% or 100% accuracy.

The user types normally. PL9 observes errors only when they naturally occur.

## Repair feedback

Repair feedback is the only intervention-specific live feedback. It consumes compact facts from a **closed** PL9 episode after canonical PL11 target attribution.

Codes:

- `repair-clean`: episode corrected and `correctCharactersRemoved = 0` → **Clean repair**
- `repair-extra-deletion`: episode corrected and `correctCharactersRemoved > 0` → **Extra correct text was deleted**
- `repair-complete`: episode corrected but precision detail unavailable → **Repair complete**

The v1 display duration is **700 ms** with a **1000 ms** cooldown. Feedback never pauses input. Live repair milliseconds are not shown.

If no relevant error occurs, no repair feedback is produced. This means recovery was **not observed**, not that recovery was perfect.

## PL9 recovery observables

PL23 consumes existing PL9 facts where available, including:

- correction initiation;
- correction action count/distance;
- incorrect and correct characters removed;
- error-to-repair time;
- repair-to-resume time;
- resume-to-fluent time;
- corrected versus uncorrected episodes;
- bounded cascade evidence for diagnostics.

PL23 does not infer cognitive intent such as carelessness, panic, late noticing, or loss of focus. Counterfactual Recovery Debt remains intentionally absent.

## Target attribution

Primary recovery results include only episodes attributed to the selected target through the existing PL11 primary-error attribution doctrine. A narrow shared helper exposes this already-existing mapping to both PL11 persistence and PL23 transient/result consumers, avoiding a second error-to-entity resolver.

Recovery aggregation uses target-attributed episodes from Control, Repair, and Mix. Baseline and Check still record errors separately for probe first-pass/control comparison.

## Recovery coverage

Coverage is an engineering observation label:

- `none`: 0 corrected target-attributed episodes;
- `limited`: 1–2 corrected target-attributed episodes;
- `usable`: 3 or more corrected target-attributed episodes.

No observation is represented with `null`, never `0 ms` or infinite recovery time.

The primary recovery profile contains:

- error episode count;
- corrected episode count;
- uncorrected episode count;
- corrected rate;
- correction initiation median;
- error-to-repair median;
- repair-to-resume median;
- resume-to-fluent median;
- total correct characters removed;
- correct characters removed per corrected episode;
- correction-action median;
- characters-removed median;
- recovery coverage.

## Probe control profile

Baseline and Check remain separate from recovery aggregation. Their profile includes:

- opportunity count;
- first-pass correct/error counts;
- first-pass accuracy;
- normalized PL10 residual timing where eligible;
- PL8 disfluency where timing coverage exists;
- target-attributed error episode counts;
- canonical execution quality and coverage.

Execution quality reuses the shared 45% Accuracy / 40% Speed / 15% Disfluency helper. PL23 does **not** create an "Accuracy/Recovery quality score"; recovery stays a separate observational dimension.

For word targets, PL22's separate **word launch** and **internal execution** diagnostics remain available. They are not collapsed.

## Result deltas

PL23 reports these same-session deltas when evidence exists:

- `AccuracyDeltaPp = CheckFirstPassAccuracy - BaselineFirstPassAccuracy`, expressed in percentage points;
- `ImmediateExecutionDelta = CheckQuality - BaselineQuality`;
- `ResidualDeltaMs = CheckResidualMedianMs - BaselineResidualMedianMs`;
- `DisfluencyDelta = CheckRate - BaselineRate`.

Negative residual change means faster relative to expected context. Accuracy and timing remain visible separately: an accuracy increase accompanied by major timing deterioration is never presented as unconditional success.

There is no single `success` boolean and no arbitrary combined Accuracy/Recovery score.

## Session engine and persistence

PL23 runs through the canonical Practice session engine with:

- correction behavior `allow`;
- training evidence role;
- content-complete termination;
- `resumable = false`;
- no active checkpoint;
- no ability channel;
- no performance-frontier measurement;
- no retention measurement;
- no evaluation measurement;
- no assessment binding.

PL16 uses the trusted immutable **Baseline** and **Check** phase bounds for PL23 acquisition entry/exit semantics. This privilege is object-bound by the PL23 trust layer; serialized metadata alone cannot claim it. Generic Practice sessions retain their existing fallback behavior.

## Live UI

The active session shows target identity, phase progress, current text, ordinary character correctness, and transient repair status. It does not show:

- live WPM;
- aggregate live accuracy;
- PB indicators;
- leaderboard;
- metronome;
- rhythm coach;
- live repair milliseconds.

Target/feedback cues are textual/non-color-only and work with software-keyboard contexts. No physical finger guidance is introduced.

## Privacy

PL23 persists no custom text, raw wrong strings, additional raw event traces, or remote analytics. Transient repair feedback retains only compact closed-episode facts already produced by the canonical PL9/PL11 pipeline and resets each session.

## Shared intervention audit

PL20–PL23 now demonstrate several genuinely shared mechanics: canonical execution quality, deterministic exact-opportunity composition, matched probes, immutable phase boundaries, and entity validation. PL23 reuses those existing components rather than creating a universal coach/treatment engine. The only narrow new shared abstraction introduced here is canonical primary-error attribution so PL11 and PL23 consume one doctrine.

PL24 has materially different protected/untargeted semantics and must not be forced into this target-rich intervention architecture.

## Non-goals

PL23 v1 does not implement:

- induced-error paradigms;
- predictive error warnings;
- forced correction strategy;
- Recovery Debt;
- punctuation/symbol-specific repair;
- physical keyboard/finger telemetry;
- protected Real Text transfer;
- Pace Ladder;
- Burst Sprints;
- Common Words;
- Endurance;
- automatic intervention selection;
- Daily Coach;
- treatment-effect causality;
- treatment personalization;
- public Practice release.

## Forward contracts

- **PL24** owns Real Text / protected cold transfer. PL23 Check remains training evidence.
- **PL25** may later choose `accuracy-control` through `external-plan`, but the v1 protocol remains unchanged.
- **PL32** may later compare treatment effects across Combination Repair, Weak Keys, Problem Words, and Accuracy & Recovery.
- **PL33** may later personalize treatment choice; PL23 itself makes no such inference.

## Interpretation boundary

The results view states:

> This compares the beginning and end of this practice session. Recovery metrics are observational and only exist when relevant errors occurred. Durable learning, transfer, and retention require later evidence.

A strong Check does not mean mastered, transferred, retained, fixed, or causally improved.

## PL30 boundary

Accuracy & Recovery v1 remains limited to the existing alphabetic key/bigram/trigram/word entity architecture. PL30 does not route punctuation, numeric, or symbol patterns through PL23 target entities.
