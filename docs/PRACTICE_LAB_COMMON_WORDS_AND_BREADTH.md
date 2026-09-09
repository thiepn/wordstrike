# PL28 — Common Words / Typing Vocabulary Breadth

PL28 adds a broad lexical execution system to Practice Lab. It deliberately occupies the middle layer between **Problem Words** (one difficult lexical target) and **Real Text** (continuous natural prose).

## 1. Purpose

Common Words trains broad, repeated execution across a versioned common-word reference and provides a separate standardized **Typing Breadth Check**. The visible catalog ID remains `common-words`; the standardized measurement descriptor is the hidden internal ID `common-words-check`.

## 2. Typing breadth terminology

**Typing breadth** means breadth of observed typing execution across the versioned common-word reference. It is a typing-evidence construct.

## 3. Typing breadth is not language vocabulary

Typing breadth does **not** estimate receptive vocabulary, expressive vocabulary, language knowledge, reading vocabulary, CEFR level, or whether the user understands a word.

> Typing breadth measures WordStrike's typing evidence across the common-word reference. It does not estimate how many English words the user knows.

## 4. Problem Words vs Common Words

- **Problem Words:** targeted lexical intervention for a known difficult word.
- **Common Words:** breadth-oriented practice across frequency bands.

Common Words Practice must not read PL12 weakness/priority, PL15 mastery, or PL16 saturation to choose words.

## 5. Common Words vs Real Text

- **Common Words:** isolated lexical protocol with spaces between words.
- **Real Text:** natural prose with syntax, punctuation, sentence context, and broader integration demands.

`common-words` ability is therefore not `cold-natural-text` ability.

## 6. Reference bank

Canonical English v1 reference:

- ID: `WS-COMMON-EN-1`
- version: `1`
- lexical keys: exactly `1,200`
- checksum: `sha256-961a2211c1de9459fe5c7de35b08a2d75fda21e7f907d070d2f9de918b00109d`

The reference is global static data; breadth snapshots remain profile + context specific.

## 7. Statistical-reference provenance

Rank/frequency metadata comes from `data/commonGameplayWords.json`, whose underlying statistical source is `google-10000-english (US no-swears)`, MIT licensed, frequency-ranked from Google's Trillion Word Corpus. The reference records this as:

- `sourceType: statistical-reference`
- `usageApproval: statistical-only`

The statistical reference can rank lexical keys but is not by itself permission to display them.

## 8. Display-safety boundary

Practice and Check use independently display-approved artifacts:

- Practice: `partition: training`
- Check: `partition: diagnostic`
- both: `usageApproval: practice-display-approved`

A statistical-only source is never silently promoted into display content.

## 9. Four frequency bands

| Band | Rank range | Reference size |
| --- | ---: | ---: |
| Core | 1–100 | 100 |
| Frequent | 101–300 | 200 |
| Common | 301–700 | 400 |
| Broad | 701–1200 | 500 |

## 10. Practice bank

Practice bank:

- ID: `WS-COMMON-PRACTICE-EN-1`
- version: `1`
- status: `ready`
- partition: `training`
- lexical coverage: 100 Core / 200 Frequent / 400 Common / 500 Broad
- ready minimums: 80 / 160 / 320 / 400 respectively

## 11. Check forms

Check form set:

- ID: `WS-COMMON-CHECK-EN-1`
- schema version: `1`
- generator version: `1`
- status: `ready`
- partition: `diagnostic`
- generated forms: `8`
- minimum ready forms: `4`

## 12. Coverage-first Practice selection

Within each band, selection order is exactly:

1. unobserved first;
2. then lowest opportunity count;
3. then oldest `lastObservedAt`;
4. then deterministic session-scoped tie-break.

## 13. No weakness-based selection

Practice selection does not read:

- PL12 weakness/priority;
- PL15 mastery/automaticity;
- PL16 saturation.

Poorly typed words are not automatically favored here; that behavior belongs to Problem Words.

## 14. Balanced microblocks

Every Practice session is divided into 20-word microblocks. Every microblock contains exactly:

- 5 Core;
- 5 Frequent;
- 5 Common;
- 5 Broad.

No word is duplicated within a session and no band may run more than two consecutive words inside a microblock.

## 15. Practice word-count options

V1 supports exactly:

- 80 words = 20 per band;
- 160 words = 40 per band;
- 240 words = 60 per band.

Default: `160`.

## 16. No direct PL16 dose

Common Words Practice produces ordinary canonical PL11 word evidence. It does not invent a new learning record and does not directly create a PL16 learning dose or PL13 ability observation.

## 17. Typing Breadth Check

The Check is a standardized diagnostic flow that is independent of Common Words Practice. The user may run either flow without first running the other and without a Full Assessment or Daily Coach requirement.

## 18. 200-word protocol

Every valid v1 Check contains exactly:

- 200 words;
- 50 words per band;
- 10 × 20-word balanced microblocks;
- corrections allowed;
- word-count completion;
- no live WPM or aggregate accuracy display.

The approximate `~2–4 min` duration is descriptive only; completion is by word count.

## 19. Form matching

The static builder and artifact certification enforce:

- total grapheme tolerance ratio: `≤ 0.05`;
- mean word-length spread: `≤ 0.25`;
- p90 word-length spread: `≤ 1` grapheme;
- per-band mean word-length spread: `≤ 0.35`;
- PL10 available model weight: `≥ 0.90`;
- PL10 difficulty-index spread: `≤ 0.40`;
- maximum weighted RMS feature distance from form centroid: `≤ 0.60`;
- relative difficulty percentile spread: `≤ 12`;
- pairwise lexical overlap ratio: `≤ 0.30`.

These are engineering matching gates, not empirical population equating. `empiricalEquating` remains `false`.

## 20. Target-blind Check selection

The Check chooses among static ready forms without reading current weaknesses, low-exposure words, mastery, saturation, or other target-specific user state. Training selection and measurement selection remain separate.

## 21. PL13 common-words ability

One completed valid Breadth Check produces exactly one trusted PL13 `common-words` diagnostic observation.

Common Words Practice produces none.

The result UI reports canonical PL13 fields:

- common-word typing ability estimate WPM;
- 95% model interval;
- confidence.

## 22. Per-band metrics

For Core, Frequent, Common, and Broad, the Check reports descriptive:

- whole-word first-pass accuracy;
- launch residual median;
- internal residual median;
- launch disfluency rate;
- internal disfluency rate.

No arbitrary per-band score is created.

## 23. Word launch vs internal execution

PL22's separation remains authoritative:

- **launch** = execution when starting a word;
- **internal** = execution inside a word after launch.

PL28 does not collapse these into one timing value.

## 24. Breadth snapshot

`buildPracticeCommonWordBreadthSnapshot` is pure and derived. It operates only over the 1,200-word reference and does not persist a separate breadth record.

## 25. Evidence categories

For a reference word:

- **unobserved:** no PL11 word stat or opportunities = 0;
- **observed:** opportunities ≥ 1 but repeated-evidence threshold not met;
- **repeated-evidence:** opportunities ≥ 3 **and** distinct sessions ≥ 2;
- **automatic:** PL15 automaticity score ≥ 75 **and** confidence ≥ medium;
- **strong:** PL15 automaticity score ≥ 90 **and** confidence = high.

`strong` is a subset of `automatic`. An unobserved word means **not yet measured**, not unknown to the user.

## 26. No one-number breadth score

PL28 does not create a universal Vocabulary Breadth Score. It preserves separate observed, repeated-evidence, automatic, and strong coverage questions.

## 27. Privacy

PL28 persists no user private text, definitions, vocabulary knowledge, raw typing traces, wrong strings, or reading history. It uses canonical PL11 word evidence already permitted by Practice Lab. It adds no Supabase dependency, leaderboard, PB, or global rank.

## 28. Performance and integrity

- Static Common Words artifacts load lazily.
- Breadth work is bounded over 1,200 reference words.
- Word stats are loaded once and indexed in memory; there are no 1,200 database lookups.
- Runtime verifies SHA-256 content integrity, common-reference bindings, canonical rank/band identity, form hashes, and text hashes.
- Stale Practice data disables Practice only; stale Check data disables Check only; stale shared reference data disables both.
- If cryptographic verification is unavailable, the feature fails closed.

Artifacts also bind to the exact upstream corpus, PL7 index, PL10 typability reference/model, frequency reference, common-word reference, and builder version.

## 29. Non-goals / remaining limitations

PL28 does not implement:

- linguistic vocabulary testing;
- word definitions;
- spelling-memory exercises;
- contractions;
- capitalization-heavy common-word forms;
- punctuation/symbol common-word training;
- adaptive weakness targeting inside Common Words;
- empirically population-normed/equated forms;
- Daily Coach automatic Common Words scheduling;
- endurance;
- treatment-effect causality;
- treatment personalization;
- public Practice release.

## 30. PL29 / PL32 / PL33 contracts

- **PL29** owns sustained consistency/endurance. A 200-word Check is not endurance evidence merely because it may take several minutes.
- **PL32** may later treat `common-words` Practice as an intervention, while `common-words-check` remains a measurement protocol. They must not be merged for treatment-effect attribution.
- **PL33** may later personalize when Common Words Practice is useful; PL28 itself makes no treatment-effect claim.

---

## Model ownership

- PL7 owns lexical identity.
- PL10 owns frequency/typability context.
- PL11 owns persistent word evidence.
- PL13 owns `common-words` ability.
- PL15 owns automaticity.
- PL16 owns ability/learning trajectory semantics.
- PL28 owns common-word sampling and the breadth surface.

## Version report

| Contract | Version |
| --- | ---: |
| Practice DB | 8 |
| `sessionSummary` record | 13 |
| `foundationAnalysis` | 10 |
| Common Words | 1 |
| visible experiment | 1 |
| policy | 1 |
| reference | 1 |
| Practice bank | 1 |
| Practice generator | 1 |
| Check schema | 1 |
| Check generator | 1 |
| breadth model | 1 |
| result | 1 |
| PL13 estimator | 1 |
| PL13 policy | 1 |
| PL13 observation | 1 |

PL28 intentionally adds **0 new IndexedDB stores**, does not bump generic Practice record schemas, and does not add `foundationAnalysis.commonWords` as a global layer.

## Certification coverage

PL28's targeted tests cover the prerequisite/channel contract, reference construction, rank/band validation, provenance and display-safety separation, Practice/Check artifact integrity, upstream bindings, coverage-first selection, no weakness reads, balanced bands and microblocks, duplicate prevention, breadth derivation/comparison, per-band launch/internal metrics, registry separation, UI/accessibility, canonical PL13 interval presentation, and stale-artifact isolation. Final release certification additionally requires the complete WordStrike test suite through the pull-request workflow.
