# Practice Lab Corpus Provenance and Hard Partition Architecture

Status: PL6 foundation  
Practice database version: unchanged at 2  
Initial corpus: `practice-en-v1`, corpus version 1, status `foundation`

## 1. Purpose and permanent boundary

PL6 establishes the trust boundary for future Practice content. It does not implement an experiment, adaptive generator, target index, weakness model, typability model, assessment, Coach, transfer score, benchmark form, multilingual UI, cloud corpus service, or runtime AI text generation.

The permanent chain is:

```text
SOURCE
  -> PROVENANCE
  -> CONTENT FAMILY
  -> HARD PARTITION
  -> CONTENT ITEM
  -> ALLOWED USE
```

PL5 remains authoritative for user evidence identity (`profile -> context -> evidence`). PL6 is orthogonal application-content architecture and adds no IndexedDB store or record migration.

## 2. Static application-content namespace

Checked-in Practice content lives only under `data/practice/`. Corpus definitions are application assets, not user records, and are never written into profiles, contexts, skill statistics, session summaries, reviews, or checkpoints.

The runtime corpus modules under `js/practiceLab/` contain metadata/contracts only. They do not import partition JSON at startup, access storage, fetch a network resource, register listeners, or start timers. Future loaders must request only the partition they need.

The research holdout is an application-development contamination boundary, not a secrecy mechanism. WordStrike is a public static repository/site, so holdout data is not cryptographically hidden. Ordinary Practice runtime metadata does not load holdout text.

## 3. Existing WordStrike vocabularies remain separate

`data/commonGameplayWords.json` and the legacy Google-10k-derived gameplay pipeline remain owned by gameplay concerns and are not approved Practice corpus sources. PL6 neither broadens their use nor claims to repair their legacy licensing provenance.

`data/english200.json` remains the immutable ranked Typing Test corpus and is likewise not imported into Practice training, transfer, benchmark, diagnostic, or research-holdout material.

## 4. Source provenance and explicit usage approval

`data/practice/provenance/sources.json` is the canonical source registry. Each source contains a stable `sourceId`, title, source type, upstream reference when applicable, explicit content-license metadata, retrieval time when applicable, SHA-256 source checksum when a reviewed snapshot exists, snapshot path, usage approval, and bounded notes.

Supported source types are:

- `wordstrike-original`
- `cc0-import`
- `permissive-import`
- `public-domain-reviewed`
- `statistical-reference`
- `test-fixture`

Source type is descriptive only. The build does not infer usage rights from it, from an SPDX identifier, from HTTP accessibility, or from a repository license.

Human-reviewed usage approvals are:

- `practice-display-approved`: may feed production display corpus after item review also passes;
- `statistical-only`: may inform future statistics but raw content may not enter display partitions;
- `test-only`: usable only through explicit test build mode;
- `excluded`: cannot feed Practice runtime corpus.

Production-display content requires **both** `reviewStatus: approved` on the item and `usageApproval: practice-display-approved` on its source.

## 5. Code license vs content/data license

Repository/code licensing and underlying corpus/data licensing are distinct records. A permissive code repository does not automatically make every embedded sentence/word permissively reusable. PL6 deliberately does not encode legal conclusions from license identifiers. It executes only the recorded human-reviewed `usageApproval` decision and preserves the associated metadata for audit.

## 6. Corpus identity and versioning

A language release has stable identity such as:

```text
corpusId: practice-en-v1
language: en
corpusVersion: 1
corpusSchemaVersion: 1
partitionPolicyVersion: 1
```

The initial PL6 corpus is `foundation`; its small sample certifies the architecture only. `foundation` and `review` are authoring stages. Once a corpus is `ready` or `retired`, a rebuild that changes its content/source/partition inventory under the same version fails. Material changes or repartitioning of a released corpus require a new corpus version.

Partition policy semantics are independently versioned by `PRACTICE_CORPUS_PARTITION_POLICY_VERSION`. A future policy change may not silently repartition an old released corpus.

## 7. Hard partitions

The only canonical partition names are:

### `training`

May be repeated, oversampled, targeted, reorganized, interleaved, and manipulated by future adaptive generators for acquisition/integration. Training content can never later be reinterpreted as cold transfer or benchmark evidence within that corpus version.

### `transfer`

Reserved for natural, untargeted generalization measurement. It may not be used for acquisition, problem-word drills, combination repair, target enrichment, or test preview. Future exposure history will decide whether a transfer item is sufficiently novel for a particular user.

### `benchmark`

The most protected user-facing longitudinal measurement pool. It may not be used in normal training, Coach acquisition, target-heavy material, tutorials, mode previews, screenshots/examples, or fallback content. PL18 will create benchmark forms from this partition only.

### `diagnostic`

Reserved for controlled/mechanistic probes that may intentionally manipulate variables. Diagnostic outcomes are not automatically general typing ability. PL6 reserves and protects the material but implements no diagnostic experiment/scoring.

### `research-holdout`

Reserved for future evaluation of WordStrike's own algorithms. It is excluded from ordinary training, Coach, transfer feedback, routine benchmark feedback, and iterative model tuning. Future research/evaluation code must request it through an explicitly named purpose.

There is no `any`, `test`, `validation`, `eval`, or automatic fallback partition in canonical artifacts.

## 8. Content family identity

`familyId` is the atomic partition unit. It is stable, bounded, machine-safe, independent of current partition order, and never derived from an array index.

Family granularity follows shared exposure:

- all sentences from one WordStrike-authored paragraph form one family;
- all derived sentences from one imported passage form one family;
- genuinely independent standalone sentences may form separate families;
- closely related controlled probe variants may share one family.

A family maps to exactly one partition. Per-item partition overrides are rejected. Near-duplicate detection is defense-in-depth and is not a substitute for correct family modeling.

## 9. Content item identity and SHA-256 integrity

Every emitted item contains:

```text
contentId
familyId
sourceId
language
corpusVersion
partition
contentType
text
contentHash
reviewStatus
metadata
```

Supported content types are `word`, `phrase`, `sentence`, `passage`, and `probe`.

`contentId` is stable, bounded, machine-safe, unique across the Practice corpus release, independent of array order, and not derived from a list position.

`contentHash` is SHA-256 of canonical normalized text. The existing lightweight FNV helper used elsewhere in Practice is not provenance integrity.

## 10. Canonical text normalization and safety

Build/runtime validation shares one pure normalizer. It:

- normalizes CRLF/CR to LF;
- applies Unicode NFC;
- trims leading/trailing authoring whitespace;
- preserves meaningful capitalization, punctuation, accents, and quotes;
- rejects null bytes, unsafe controls, unpaired surrogates, and hidden bidi controls;
- rejects unintended newlines for non-passage records;
- rejects raw-HTML requirements;
- rejects URLs/emails under the initial corpus policy;
- applies finite type-specific length limits.

It never ASCII-folds language text, removes accents, or silently rewrites punctuation.

## 11. Deterministic partition assignment and explicit locks

The v1 engineering policy uses weights of approximately 65/15/10/5/5 for training/transfer/benchmark/diagnostic/research-holdout. These weights are engineering policy, not scientific constants.

Unlocked families are assigned deterministically from:

```text
familyId + corpusVersion + partitionPolicyVersion + stable policy salt
```

using a stable build-time hash bucket. No `Math.random()` or source-array order is involved.

Some carefully authored families require explicit placement. A family-level `partitionLock` may name exactly one canonical partition. The resulting manifest records whether each assignment was `locked` or `deterministic`. Item-level locks are forbidden.

## 12. Exact-duplicate contamination rule

Canonical normalized text may not occur under two different content IDs in one corpus release. This is a hard build failure, including whitespace/line-ending variants that normalize identically. Identical text may never cross hard partitions.

Natural token overlap is allowed; benchmark and training English will necessarily share ordinary words such as `the`, `and`, and `is`.

## 13. Near-duplicate contamination rule

The build performs deterministic, build-time defense-in-depth similarity checks across different families in different hard partitions. It computes:

1. lowercased Unicode word-token set Jaccard similarity;
2. lowercased canonical character 4-gram Jaccard similarity;
3. the maximum of those two scores.

Policy v1 uses a configurable hard threshold of 0.90 and review-warning threshold of 0.75. Extremely similar cross-partition content fails the build. Borderline similarity produces bounded ID/score diagnostics for review. No similarity scan runs in the browser/session runtime.

The threshold is a practical contamination detector, not a claim of semantic equivalence accuracy.

## 14. Source checksum integrity

When a source record names a checked-in reviewed snapshot, `sourceChecksum` is SHA-256 of its exact bytes. `buildPracticeCorpus.mjs` recomputes it before content generation. A mismatch fails closed instead of silently consuming changed source data.

The initial WordStrike-original authoring collection is also checksummed, making edits explicit review events.

## 15. Generated partition artifacts and manifest

The builder emits separate JSON artifacts under each partition directory. It never emits one untyped generic corpus pool.

A language/version manifest contains bounded metadata only: corpus identity/version/status, source IDs, partition policy version, item/family counts, family assignments, and deterministic SHA-256 build checksum. It contains no sentence text.

The build checksum covers the selected source identity/checksum/approval/license metadata, family assignments, content IDs, family/source/partition identities, and content hashes. It therefore changes when material content identity, source identity, or partition identity changes.

Manifest counts are recomputed from emitted artifacts; checked-in count fields are not trusted as input.

## 16. Build pipeline and failure safety

`npm run build:practice-corpus` explicitly:

1. reads/validates the source registry;
2. verifies declared source snapshot checksums;
3. loads sorted reviewed authoring files;
4. normalizes and validates text;
5. enforces source usage and item review gates;
6. computes SHA-256 content hashes;
7. resolves family partitions/locks;
8. rejects family partition conflicts;
9. detects exact and near duplicates;
10. creates deterministic, sorted partition artifacts;
11. recomputes manifest counts/inventory/checksum;
12. validates the complete in-memory result;
13. writes temporary outputs and replaces canonical files only after all integrity checks pass, with rollback on replacement failure.

`npm run validate:practice-corpus` performs the same computation and source checks but writes nothing. It byte-compares deterministic expected output with checked-in generated files and exits non-zero if they are stale or corrupted.

Build diagnostics contain source/family/item counts, partition counts, duplicate/conflict/warning counts, and manifest checksum. Full corpus text is not dumped by default.

## 17. Runtime corpus registry

`practiceCorpusRegistry.js` registers manifest metadata only. It enforces valid manifests, unique corpus IDs, unique language/version pairs, immutable registrations, controlled unknown lookup, and partition count metadata. It does not import or fetch all partition content at module load.

## 18. Runtime content-use guard

`assertPracticeContentUse()` is the reusable future boundary:

```text
training purpose          -> training only
cold-transfer purpose     -> transfer only
benchmark purpose         -> benchmark only
diagnostic purpose        -> diagnostic only
research-evaluation       -> research-holdout only
```

Unknown purposes and mismatched partitions throw. There is deliberately no fallback from an empty training pool to benchmark/transfer/holdout content. Future experiment setup must return insufficient content instead.

## 19. Privacy, JSON safety, and runtime trust

Static corpus content may never contain user custom text, copied conversations, user submissions, emails/phone identifiers, or other personal data. Custom Text remains a separate local-only user feature.

Corpus metadata must be bounded JSON-safe plain values: no functions, cycles, non-finite numbers, prototype-sensitive keys, HTML/script/style/callback fields, or runtime callbacks. Text remains plain text and future rendering must escape it.

There is no runtime third-party corpus API. External material is imported/reviewed at build time and production Practice uses checked-in WordStrike-controlled artifacts.

## 20. Release readiness

A corpus should be marked `ready` only after all items and display sources are approved, hashes/source checksums validate, all family partitions are consistent, manifest counts/checksum match, the build is reproducible, and no hard exact/near-duplicate contamination remains. PL6's tiny English sample remains `foundation` and makes no production-readiness claim.

## 21. PL6 non-goals

PL6 does not provide full production corpus population, frequency statistics, target/bigram/trigram indexing, target positions, adaptive generation, typability/difficulty calibration, novelty/exposure history, benchmark forms/equating, transfer evaluation, Full Assessment, Daily Coach, multilingual Practice UI, public Practice release, cloud corpus services, or runtime AI generation.

## 22. PL7 contract

PL7 may index only PL6-validated content. Every derived word/n-gram/position index must preserve `contentId`, `familyId`, `partition`, `sourceId`, and `corpusVersion`. It may not flatten the corpus into a generic pool or erase the allowed-use boundary.

The implemented indexing contract is documented in **PRACTICE_LAB_TARGET_INDEX_ARCHITECTURE.md**. PL6 remains the source of truth; PL7 assets are rebuildable derived data bound to the PL6 manifest checksum.
