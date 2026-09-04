# General gameplay vocabulary quality audit

Audit completed: 2026-07-01

## Finding and root cause

The reported terms `uniprotkb`, `epson`, `siemens`, `cleveland`, and `missouri` came
from `data/commonGameplayWords.json`. The former generator accepted lowercase tokens
that passed format, limited technical/name exclusions, and morphology checks. It did
not provide a complete semantic review of brands, scientific identifiers, or proper
places. Because Campaign selects from every tier in distance order, `uniprotkb` in
tier 4 was eligible at level 83.

The old inline Campaign fallback was also not tied to the generated dataset. Its terms
were syntactically valid but were not guaranteed to satisfy the same review policy.

## Review method

1. Pin and checksum the frequency-ranked, US-English no-swears source.
2. Record every candidate from rank 1 through rank 7,406 in a row-level ledger.
3. Apply lowercase ASCII and length validation plus the reviewed short-word allowlist.
4. Cross-check SSA-derived personal names and the official Census state/place files.
5. Apply reviewed semantic categories for brands, technical/scientific terms,
   abbreviations, malformed tokens, other proper nouns, organizations, unsuitable
   terms, obscure words, and duplicate variants.
6. Remove regular `-s`, `-es`, `-ies`, `-ed`, and `-ing` forms when a source base form
   exists, independent of source ordering; preserve reviewed exceptions.
7. Use build-time word frequency only to surface obscure candidates for inspection.
8. Inspect the complete candidate/replacement sequence and approve exactly 3,000
   recognizable general-English words.
9. Assign the approved words to five deterministic 600-word difficulty tiers.

`manualReviewCompleted` is set only on the checked, final ledger. The runtime builder
does not infer approvals and cannot silently fill vacancies.

## Final counts

| Measure | Count |
| --- | ---: |
| Candidates reviewed | 7,406 |
| Words approved | 3,000 |
| Words per tier | 600 |
| Company/brand candidates removed | 47 |
| Technical/scientific candidates removed | 88 |
| U.S. state-name candidates removed | 39 |
| U.S. city/place candidates removed | 41 |
| Personal-name candidates removed | 300 |
| Abbreviation candidates removed | 613 |
| Regular inflections removed | 1,890 |

The state/place counts describe matching candidates encountered in the reviewed source
prefix, not the size of the permanent exclusion lists. Regression tests assert that all
50 complete U.S. state names are absent from the final pool.

Approved geographic names are deliberately limited to `berlin`, `china`, `england`,
`france`, `germany`, `india`, `japan`, `korea`, `london`, `paris`, and `rome`.
Ambiguous proper/common forms are kept only when explicitly documented in
`data/vocabularyQualityRules.json`; examples include `apple`, `bank`, `bear`, `orange`,
`shell`, `summer`, `target`, and `winter`.

## Runtime coverage

- Campaign loads `commonGameplayWords.json`; level 83 is covered across 500 seeds.
- Boss uses the audited common pool plus `bossCommonLongWords.json`; emergency terms
  must belong to one of those two checked sources.
- Daily Strike receives the audited common words and the audited Campaign tiers.
- Endless receives the same sources plus the separately curated Boss long-word pool.
- Offline Campaign and short Boss fallbacks share `js/auditedFallbackWords.js`, whose
  entire contents are asserted to be a subset of the approved 3,000 words.
- Typing Test continues to load immutable English 200 v1 independently.

The five reported terms are absent from the ledger's KEEP decisions, generated word
list, all tiers, and audited fallbacks.

## PL6 Practice corpus boundary

This gameplay audit remains a legacy gameplay concern. PL6 does **not** treat
`data/commonGameplayWords.json`, its Google-10k-derived source pipeline, or
`data/english200.json` as approved Practice Lab corpus sources. The Practice corpus has
its own explicit provenance/usage-approval registry under `data/practice/` and does not
import these gameplay/ranked datasets. PL6 does not make any new licensing claim about
the legacy gameplay sources.
