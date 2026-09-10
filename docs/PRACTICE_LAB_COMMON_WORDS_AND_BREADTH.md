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
- canonical identity: PL7 word identity, represented as `word:<lexicalKey>` plus the normalized lexical key
- checksum: `sha256-7d20bd63e451df4d78cabfb622d5214b8e8921bdb35a47155f69f966308a0880`

The reference is global static data; breadth snapshots remain profile + context specific.

## 7. Statistical-reference provenance

Rank/frequency metadata comes from the reviewed `data/commonGameplayWords.json` dataset, whose underlying statistical source is `google-10000-english (US no-swears)`, MIT licensed and frequency-ranked from Google's Trillion Word Corpus.

PL28 does not self-declare this source as trusted. The canonical PL6 source registry contains three separate governed records:

- `ws-common-words-en-statistical-v1` — `sourceType: statistical-reference`, `usageApproval: statistical-only`;
- `ws-common-words-en-training-v1` — `sourceType: permissive-import`, `usageApproval: practice-display-approved`, training role only;
- `ws-common-words-en-diagnostic-v1` — `sourceType: permissive-import`, `usageApproval: practice-display-approved`, diagnostic role only.

All three PL6 records point to the immutable source-governance snapshot `PL6-COMMON-WORD-SOURCE-EN-1.json`. Under the canonical PL6 contract, their `sourceChecksum` is the **raw-byte SHA-256 of that snapshot**:

`sha256-9db3a3ed1a30fbd603890b0a7a7b29f736f8ca925f541f822b932e1fb8e6045e`

The governance snapshot separately binds the reviewed upstream Google text checksum:

`sha256-ee2d83651fbb91642bbed2bd30ead404c2cfbdfece01dacf284af6ea47795811`

and the required `data/commonGameplayWords.manual-review.json` contract. This distinction preserves the existing PL6 rule that `sourceChecksum` hashes `snapshotPath` bytes instead of overloading that field with an upstream-provider checksum.

The generated PL28 governed lexical snapshot is `WS-COMMON-SOURCE-EN-1.snapshot.json`, checksum:

`sha256-b21f765a7b059fa5401d1dbe29af28050a7ec8b5c72af976b4203e28ac53fccb`

It binds the reviewed lexical selection to canonical PL7 word IDs and to the independent statistical/training/diagnostic source roles.

Registry bindings are deliberately isolated:

- shared statistical registry checksum: `sha256-a8ad1d28ca9d813daf2d37117be6483276c641ae73d8a226934bd448b37465b5`;
- Practice training registry checksum: `sha256-7e12bb5815f4d59c615e6fda947415010ff5a19e4b8fa35d8e4685ddaa932bc2`;
- Check diagnostic registry checksum: `sha256-0612d1bd11805f91c735497eed250624fd89e447828bd479d07f933d8ee1762b`.

This separation allows a stale or revoked training approval to disable Practice without disabling Check, while a stale shared statistical reference disables both.

## 8. Display-safety boundary

Practice and Check use independently governed display approval:

- Practice: `partition: training`, source `ws-common-words-en-training-v1`;
- Check: `partition: diagnostic`, source `ws-common-words-en-diagnostic-v1`;
- both display records: `usageApproval: practice-display-approved`;
- the statistical source remains `statistical-only` and cannot pass production-display eligibility.

A statistical-only source is never silently promoted into display content. Training and diagnostic source identities are distinct, so one display-governance failure does not contaminate the other flow.

## 9. Four frequency bands

| Band | Rank range | Reference size |
| --- | ---: | ---: |
| Core | 1–100 | 100 |
| Frequent | 101–300 | 200 |
| Common | 301–700 | 400 |
| Broad | 701–1200 | 500 |

English v1 uses lowercase alphabetic forms only. One-letter forms are restricted to `a` and `i`; contractions, hyphens, digits, symbols, and capitals are excluded.

## 10. Practice bank

Practice bank:

- ID: `WS-COMMON-PRACTICE-EN-1`
- version: `1`
- status: `ready`
- partition: `training`
- display source: `ws-common-words-en-training-v1`
- lexical coverage: 100 Core / 200 Frequent / 400 Common / 500 Broad
- ready minimums: 80 / 160 / 320 / 400 respectively
- checksum: `sha256-06cb040e3cc7b15478e00c34773dcd93b8b945c3525f4ed6a726a86477c7ebdc`

## 11. Check forms

Check form set:

- ID: `WS-COMMON-CHECK-EN-1`
- schema version: `1`
- generator version: `1`
- status: `ready`
- partition: `diagnostic`
- display source: `ws-common-words-en-diagnostic-v1`
- generated forms: `8`
- minimum ready forms: `4`
- checksum: `sha256-e4a6801b85fb2df324985125ac6c25cdb95dfbce89e7374f15aa04f2f77d9b4c`

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

Practice plan hashes bind canonical word IDs, lexical keys, exact order, the separator, and protocol versions. The same session/evidence snapshot produces the same plan; the plan does not adapt after the session starts.

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

Final v1 generated forms measure PL10 available-model coverage `1.00`, maximum pairwise lexical overlap `0.21`, relative percentile spread `0`, and effectively zero cross-form difficulty/RMS spread within floating-point precision.

These are engineering matching gates, not empirical population equating. `empiricalEquating` remains `false`.

Form hashes bind canonical word IDs, lexical keys, exact order, separator, form version, and reference version. Text hashes independently bind the exact displayed space-separated text.

## 20. Target-blind Check selection

The Check chooses among static ready forms without reading current weaknesses, low-exposure words, mastery, saturation, or other target-specific user state. Training selection and measurement selection remain separate.

## 21. PL13 common-words ability

One completed valid Breadth Check produces exactly one trusted PL13 `common-words` diagnostic observation.

Common Words Practice produces none.

The result UI reports canonical PL13 fields:

- common-word typing ability estimate WPM;
- 95% model interval;
- confidence.

Repository commit semantics remain exactly-once: replaying the same completed Check session cannot increment the canonical PL13 ability state twice.

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

- Static Common Words artifacts load lazily; they are not loaded on normal WordStrike startup.
- Pure/runtime module imports perform zero IndexedDB opens, localStorage writes, fetches, timers, or listener registration.
- Breadth work is bounded over 1,200 reference words.
- Word stats are loaded once and indexed in memory; there are no 1,200 database lookups.
- The generic PL6 corpus validator verifies the raw bytes of `PL6-COMMON-WORD-SOURCE-EN-1.json` against every PL28 source record before any corpus rebuild/validation succeeds.
- The PL28 builder separately verifies the governance snapshot's upstream checksum, reviewed-dataset path, manual-review artifact, source schema/output count, and explicit statistical/training/diagnostic approval contract.
- Runtime verifies SHA-256 content integrity, the governed PL6 statistical/training/diagnostic registry records, generated source-snapshot integrity, PL7 canonical `wordId` identity, common-reference bindings, canonical rank/band identity, form hashes, and text hashes.
- Stale Practice data disables Practice only; stale Check data disables Check only; stale shared reference data disables both.
- Revoking only PL6 training display approval disables Practice only; revoking only PL6 diagnostic display approval disables Check only; revoking shared statistical approval disables both.
- If cryptographic verification is unavailable, the feature fails closed.

Artifacts also bind to the exact upstream corpus, PL7 index, PL10 typability reference/model, frequency reference, common-word reference, PL6 source governance, upstream provider checksum, and builder version.

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

The targeted PL28 suite passes **41/41** tests. It covers the prerequisite/channel contract, reference construction, PL7 word identity, English-v1 lexical restrictions, rank/band validation, canonical PL6 provenance, independent training/diagnostic display safety, governed source-snapshot integrity, Practice/Check artifact integrity, exact upstream bindings, plan/form hash identity, target-blind Check selection, coverage-first Practice selection, no weakness reads, balanced bands and microblocks, duplicate prevention, PL13 admission and exactly-once persistence, breadth derivation/comparison, per-band launch/internal metrics, import-side-effect safety, registry separation, UI/accessibility, canonical PL13 interval presentation, and stale-artifact/source isolation.

Final release certification additionally requires the complete WordStrike pull-request test workflow and browser regression workflows to be green on the final head.

## PL29 boundary — Common Words is not Endurance

Common Words measures broad lexical-list execution. Session duration alone does not turn Common Words Practice or the 200-word Typing Breadth Check into Endurance evidence. Only the standardized hidden `endurance-check` provider can create PL13 Endurance ability observations.
