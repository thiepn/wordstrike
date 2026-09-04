# Practice Lab Target, N-Gram & Content Index Architecture

Status: PL7 foundation  
Practice database version: unchanged at 2  
Index schema: 1  
Index generator: 1  
Text segmentation: 1  
Tokenization: 1  
Shard policy: 1

## 1. Purpose

PL7 derives deterministic lookup metadata from PL6-approved corpus artifacts. PL6 remains authoritative. PL7 never corrects or replaces corpus truth; stale or corrupt indexes fail and must be rebuilt from the validated corpus.

The flow is:

```text
PL6 approved corpus
  -> shared text segmentation/tokenization
  -> content annotations
  -> partition-local content metadata
  -> training/diagnostic reverse target indexes
  -> lazy runtime query API
```

PL7 adds no IndexedDB store, profile/context field, user history, leaderboard integration, public Practice UI, or runtime corpus service.

## 2. Permanent partition rule

Training and diagnostic material support target-driven selection:

```text
TARGET -> CONTENT -> ANNOTATIONS
```

Transfer and benchmark material are protected measurement pools:

```text
CONTENT -> ANNOTATIONS
```

There is intentionally no ordinary `TARGET -> CONTENT` reverse index for transfer or benchmark. Research holdout receives content annotations for explicit research evaluation but no production reverse target index. This is structural contamination protection, not secrecy.

## 3. Derived-data identity

Every index manifest binds to:

- PL6 `corpusId`;
- PL6 `corpusVersion`;
- PL6 `language`;
- PL6 `buildChecksum` as `corpusChecksum`;
- index schema/generator versions;
- segmentation/tokenization versions;
- shard policy version/count;
- SHA-256 checksum for every generated artifact;
- one deterministic `indexChecksum` for the complete inventory.

A corpus checksum mismatch is a stale-index failure. No nearest-version fallback exists.

## 4. Version contracts

`PRACTICE_INDEX_SCHEMA_VERSION` versions generated representation. `PRACTICE_INDEX_GENERATOR_VERSION` versions build semantics. `PRACTICE_TEXT_SEGMENTATION_VERSION` and `PRACTICE_TOKENIZATION_VERSION` version grapheme/word interpretation. `PRACTICE_INDEX_SHARD_POLICY_VERSION` versions deterministic shard placement.

Changing these semantics requires a full rebuild; old artifacts are never silently reinterpreted.

## 5. Shared segmentation and tokenization

`practiceTextSegmentation.js` owns the grapheme and word-unit contract shared by the Practice session engine and PL7.

Grapheme segmentation preserves the current behavior: injected segmenter when supplied, otherwise `Intl.Segmenter(..., { granularity: "grapheme" })`, otherwise the existing `Array.from` fallback.

Word units remain maximal runs of graphemes matching the existing Practice predicate:

```text
letters | combining marks | numbers | apostrophe | hyphen
```

`createPracticeContentPlan()` consumes the same predicate. This prevents session metrics and corpus indexes from drifting into separate definitions of a word.

Build positions use half-open grapheme ranges `[startIndex, endIndex)`.

## 6. Surface words and lexical keys

Content annotations retain exact `surfaceText`, exact grapheme range, `wordOrdinal`, and a deterministic capitalization class (`lower`, `initial-cap`, `upper`, `mixed`, `uncased`).

A separate `lexicalKey` NFC-normalizes and language-aware lowercases the surface word. It does not remove accents, apostrophes, hyphens, spelling distinctions, or morphology. `The`, `the`, and `THE` may share lexical key `the` while their surface occurrences remain distinct.

The existing Practice word entity contract remains authoritative. Word units that cannot be represented as current `word` entities remain in content annotations but do not become invalid reverse-index word entries. The build reports bounded diagnostics instead.

## 7. Target extraction

PL7 observes these existing entity classes only:

- `key`: one expected grapheme;
- `bigram`: two adjacent expected graphemes;
- `trigram`: three adjacent expected graphemes;
- `word`: valid lexical word entity.

Raw n-grams preserve exact surface case and include spaces, punctuation, numbers, and symbols. Bigrams/trigrams are adjacent grapheme windows and overlap normally. They are not restricted to inside-word text.

PL7 does not implement punctuation-transition, number-pattern, symbol-pattern, personal chunks, target importance, weakness, difficulty, typability, or pedagogy.

## 8. Structural occurrence context

Each key/bigram/trigram occurrence has one bounded structural class:

- `within-word`;
- `word-boundary`;
- `whitespace`;
- `punctuation`;
- `numeric`;
- `mixed`.

This is descriptive metadata only. `within-word` relations power key/bigram/trigram-to-word lookups. Punctuation/numeric classes are not converted into later pedagogical pattern entities.

## 9. Content annotations

Every PL6 item is annotated exactly once with its PL6 identity and `contentHash`, segmentation/tokenization versions, grapheme/word counts, word ranges, structural counts, and key/bigram/trigram occurrences.

Annotations contain positions and targets but do not copy surrounding passages into each occurrence. Full text remains in PL6 partition artifacts.

Transfer/benchmark annotations make post-hoc target analysis possible only after content was independently selected.

## 10. Selected-content position safety

`verifyPracticeContentAnnotations()` resegments one selected content item under the current Practice segmenter, verifies `contentHash` binding when supplied, reconstructs every indexed target slice, reconstructs every word surface range, and rederives lexical keys.

If segmentation/runtime semantics differ, it throws `POSITION_MISMATCH`/`CORPUS_MISMATCH`. A future caller may then recompute the selected item in memory. PL7 never rescans the whole browser corpus for this safety check.

## 11. Content metadata

Each partition receives a compact `content.json` with content/family/source identity, PL6 content hash/type, language/partition, grapheme count, word count, unique lexical-word count, and raw uppercase/digit/punctuation counts.

These are structural facts, not typability or difficulty scores.

## 12. Word lexicon and n-gram-to-word relationships

Training and diagnostic partitions receive sharded word entries with lexical key, exact surface-form counts, corpus-local occurrence count, content coverage count, family coverage count, and content/position references.

Key/bigram/trigram target entries include `wordKeys` only when the occurrence is structurally within one canonical word. Thus punctuation outside a word cannot create a false word relationship.

Counts are named precisely:

- `corpusOccurrenceCount`: occurrences in this corpus partition;
- `contentCoverageCount`: distinct content items;
- `familyCoverageCount`: distinct PL6 exposure families;
- `wordCoverageCount`: distinct valid lexical word candidates.

None is general-language frequency.

## 13. Reverse target indexes

Training and diagnostic target shards aggregate one canonical entry per `(entityType, entityKey, partition)`. One content ID appears once with `count` and sorted occurrence `positions`; repeated occurrences do not duplicate content references.

No adaptive score, learning value, weakness, priority, density score, or recommendation rank is stored.

## 14. Deterministic sharding

PL7 v1 uses 16 hash shards. Placement is a deterministic non-security FNV-1a bucket over the versioned shard salt plus index type/entity type/entity key. Shard IDs are zero-padded and directly derivable at runtime.

The shard hash is lookup engineering, not integrity. SHA-256 remains the integrity mechanism.

Only non-empty shard files are emitted; the manifest records available shard IDs. A missing undeclared shard means no candidates and requires no fetch. Changing shard count/policy requires a versioned rebuild.

## 15. Artifact layout

For `data/practice/indexes/en-v1/`:

```text
manifest.json
<partition>/content.json
<partition>/annotations/annotation-XX.json
training/targets/target-XX.json
training/words/word-XX.json
diagnostic/targets/target-XX.json
diagnostic/words/word-XX.json
```

Transfer, benchmark, and research-holdout have no ordinary target/word reverse shard directories in canonical output.

## 16. Runtime loader and cache

`createPracticeIndexLoader()` is side-effect free. It performs no fetch until an explicit load method is called. It accepts injected `fetchImpl`, validates manifest/artifact schemas, verifies SHA-256 artifact checksums, derives only the required shard, and maintains a bounded in-memory LRU cache plus same-shard in-flight request deduplication.

Cache identity includes corpus/version/schema/generator/partition/index type/shard. Failed requests are removed from in-flight state and may be retried. PL7 uses no localStorage or IndexedDB cache.

The default base path is WordStrike-controlled static content under `data/practice/indexes`; external API URLs are not accepted as the default runtime corpus source.

## 17. Selection vs analysis APIs

`createPracticeTargetIndex()` exposes explicit, purpose-aware methods. It reuses the PL6 content-use guard.

Selection calls (`getTargetSummary`, `getTargetContentRefs`, `getTargetWordRefs`, `getWordSummary`) require training/diagnostic partitions. Transfer/benchmark attempts fail with `PROTECTED_REVERSE_LOOKUP`.

Analysis calls (`getContentAnnotations`) are keyed by independently selected `contentId`; training, transfer, benchmark, and diagnostic use their matching PL6 purposes. Research holdout requires explicit `research-evaluation` purpose.

There is no `findAnyContentForTarget` or protected fallback path.

## 18. Set intersection helpers

Pure content-reference intersection/union helpers allow later generators to combine multiple independently indexed targets without precomputing combinatorial `br+ou`, `br+th`, etc. They do not rank or select candidates.

## 19. Build process

The Node orchestrator first runs PL6 validation-only mode. It then loads only checked-in PL6 manifests/partition artifacts, validates them again through PL6 validators, analyzes each approved item with shared text utilities, assembles indexes, exhaustively validates references/ranges/counts/shard placement, computes artifact SHA-256 checksums and the index checksum, and writes a complete temporary index directory before atomic directory replacement.

Commands:

```bash
npm run build:practice-indexes
npm run validate:practice-indexes
```

Validation-only mode writes nothing and compares the exact expected file set and bytes against checked-in artifacts.

## 20. Coverage reporting

The manifest/build summary records per partition: items, families, graphemes, word occurrences, unique lexical words, unique keys, unique bigrams, and unique trigrams.

Training/diagnostic additionally record reverse target counts, targets reaching engineering diversity thresholds, and largest candidate sets. Low word/family coverage produces bounded corpus-development warnings. These are coverage diagnostics, not quality or difficulty claims.

## 21. Integrity and failure behavior

Build/runtime validation rejects stale corpus checksums, stale content hashes, malformed ranges, invalid current Practice entity keys, duplicate reverse references, wrong-shard entries, protected reverse shards, count mismatches, unknown artifacts, artifact checksum mismatches, and version mismatches.

Generated data is represented as arrays/plain values rather than target-keyed prototype-bearing objects; assembly uses `Map`, so target strings such as `constructor` cannot become prototype properties.

## 22. Non-goals and future phases

PL7 does not implement external/general word frequency, PL8 latency/fluent classification, typability, weakness scoring, ability estimation, adaptive target selection, novelty/exposure history, benchmark forms, transfer selection, personal chunks, actual Practice exercises, or Daily Coach.

PL8 consumes user observations independently. PL10 may consume PL7 structural facts without converting them into user evidence. PL20/PL21 can request training words/content for combinations/keys. PL24 can independently select transfer content and only afterward request its annotations. Future Custom Text may reuse `analyzePracticeText()` in memory without entering static indexes.
