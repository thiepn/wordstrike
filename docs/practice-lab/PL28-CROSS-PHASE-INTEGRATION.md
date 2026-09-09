# PL28 cross-phase integration addenda

This file records the documentation changes introduced by PL28 without changing the semantics or version contracts of the earlier phases.

## PL13 — Ability Estimation

PL28 provides the first implemented standardized measurement for the existing PL13 `common-words` ability channel.

A valid completed `common-words-check` session contributes one trusted `diagnostic` PL13 observation using the canonical whole-session WPM and PL13 uncertainty model. Common Words Practice contributes no PL13 ability observation.

`common-words` ability remains distinct from `cold-natural-text`, `controlled-speed`, `burst`, and future `endurance` ability. In particular:

> common-words ability ≠ cold-natural-text ability.

PL13 estimator, policy, observation, uncertainty, and ability-state versions remain unchanged at v1.

## PL15 — Mastery / Automaticity

PL28 consumes canonical PL15 automaticity only when deriving descriptive common-word breadth coverage:

- `automatic`: automaticity score ≥ 75 with confidence ≥ medium;
- `strong`: automaticity score ≥ 90 with high confidence.

PL28 does not change mastery semantics, thresholds outside its derived coverage labels, or the PL15 data model. PL15 automaticity is **not** consulted by Common Words Practice selection.

## PL16 — Learning / Ability Trajectories

Because PL28 can now produce real PL13 `common-words` observations, the `common-words` channel can participate in the existing ability-history/trajectory machinery wherever PL16 consumes canonical PL13 state.

PL28 does not create a new trajectory model, learning model, dose type, or saturation model. Common Words Practice itself does not directly create a PL16 learning dose.

## PL22 — Problem Words

The lexical intervention boundary is now explicit:

- **Problem Words** = targeted intervention for one measured difficult lexical target, including launch/internal-word decomposition.
- **Common Words** = breadth-oriented lexical practice sampled across a fixed 1,200-word reference and four frequency bands.

Common Words must not read Problem Words weakness/priority to choose its Practice words. A poorly typed word is not automatically a Common Words priority.

PL28 reuses PL22's canonical distinction between starting a word (launch) and executing inside a word (internal timing) for descriptive Check band metrics.

## PL24 — Real Text

The broad-practice boundary is now explicit:

- **Common Words** = isolated common-word lexical execution with balanced frequency-band sampling.
- **Real Text** = natural prose with syntax, punctuation, capitalization, sentence context, and integration demands.

A standardized Common Words Check is therefore not a cold natural-text transfer measurement, and its PL13 `common-words` ability must never be presented as normal/natural-text typing speed.

## PL25 — Daily Coach

Common Words now exists, but Daily Coach v1 remains intentionally version-stable and continues to use Real Text as its broad integration block.

> Common Words now exists, but Daily Coach v1 still uses Real Text as its broad integration block. A future Coach policy may choose Common Words.

PL28 does not automatically add Common Words to Daily Coach planning. A later Coach policy may consider Common Words when common-word typing breadth is sparse and when future treatment-effect evidence supports the intervention.

## Version stability

These integration notes introduce no earlier-phase schema or policy bumps. PL28 adds its own experiment-specific versions while retaining:

- Practice DB v8;
- `skillStat` v3;
- `sessionSummary` v13;
- `abilityState` v1;
- `learningState` v1;
- `performanceState` v1;
- `coachPlan` v1;
- PL13 estimator/policy v1;
- foundation analysis v10.
