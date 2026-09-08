# General gameplay vocabulary provenance

WORDSTRIKE's general gameplay vocabulary is generated from the US-English,
no-swears edition of
[first20hours/google-10000-english](https://github.com/first20hours/google-10000-english),
a frequency-ranked list derived from Google's Trillion Word Corpus.

- License: MIT (source repository)
- Source file: `google-10000-english-usa-no-swears.txt`
- Retrieved: 2026-06-30
- Source SHA-256: `ee2d83651fbb91642bbed2bd30ead404c2cfbdfece01dacf284af6ea47795811`
- Review date: 2026-07-01
- Reviewed source candidates: 7,406
- Approved general-play words: 3,000

The complete row-level decision record is
`data/commonGameplayWords.manual-review.json`. Each row records the source word,
frequency rank, assigned tier, KEEP or REMOVE decision, review category, and review
note. `data/vocabularyQualityRules.json` contains the permanent semantic exclusions,
short-word allowlist, approved ambiguous ordinary words, approved geographic names,
and supporting-source checksums.

Supporting review sources are:

- U.S. Social Security Administration national baby-name data, represented by the
  checked-in `data/personalNameExclusions.json` artifact. The source is U.S.
  public-domain data and the derived mirror is CC0-1.0.
- U.S. Census Bureau 2025 National Places and National States Gazetteer files. The
  exact download URLs and SHA-256 checksums are recorded in the quality-rules file.
- `wordfreq` 3.1.1 as a build-time recognizability signal while preparing the review
  draft. It is not a runtime dependency and never overrides a recorded manual decision.

The review accepts only lowercase ASCII words of 2-12 characters. It screens short
tokens, proper names, companies, technical/scientific identifiers, abbreviations,
malformed tokens, unsuitable terms, obscure terms, duplicate variants, and regular
inflections with a sourced base form. Explicit exception lists preserve ordinary
independent words such as `business`, `spring`, and `bring`.

Difficulty tiering uses 72% source-frequency position and 28% typing complexity after
manual approval. The output contains five disjoint tiers of exactly 600 words each.
The generated `data/commonGameplayWords.json` is the shared runtime source for
Campaign, Arcade Rush, Endless, and the short/medium portion of Boss vocabulary.

## Rebuild and validation

Prepare a draft (requires the build-time `wordfreq` package):

```text
python scripts/buildVocabularyManualReview.py <source-file> data/personalNameExclusions.json data/vocabularyQualityRules.json data/commonGameplayWords.manual-review.json
```

After a human has inspected every row, regenerate with `--complete`, then validate and
build the runtime artifact:

```text
python scripts/buildVocabularyManualReview.py <source-file> data/personalNameExclusions.json data/vocabularyQualityRules.json data/commonGameplayWords.manual-review.json --complete
node scripts/buildWordPools.mjs <source-file> data/commonGameplayWords.manual-review.json data/vocabularyQualityRules.json data/personalNameExclusions.json data/commonGameplayWords.json
```

The JavaScript builder fails closed on source checksum, incomplete review status,
missing row fields, source-rank mismatches, duplicate or malformed approved words,
blocked terms, names, tier-size drift, output-count drift, and removable inflections.

`data/english200.json` is deliberately independent and remains the immutable English
200 v1 set used by ranked 15-second and 60-second Typing Test boards.
