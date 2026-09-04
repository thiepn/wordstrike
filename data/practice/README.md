# WordStrike Practice corpus data

This directory is the only checked-in static corpus namespace approved for future Practice Lab content. It is separate from gameplay vocabulary and ranked Typing Test data.

## Boundary

Every displayable Practice item must pass this chain:

`source -> reviewed provenance -> family -> hard partition -> content item -> allowed use`

The five canonical partitions are `training`, `transfer`, `benchmark`, `diagnostic`, and `research-holdout`. A `familyId` belongs to exactly one partition in a corpus version. Never split one paragraph, imported passage, related probe family, or other shared-exposure unit across partitions.

## Directory layout

- `authoring/`: reviewed build inputs. These are not runtime artifacts.
- `provenance/sources.json`: explicit source records and human-reviewed usage approvals.
- `provenance/LICENSES.md`: content-license/provenance notes; repository code licensing is a separate concern.
- `manifests/`: generated corpus inventory metadata and checksum; no sentence text.
- `training/`, `transfer/`, `benchmark/`, `diagnostic/`, `research-holdout/`: generated partition artifacts.
- `indexes/`: generated PL7 derived metadata/index shards bound to an exact PL6 corpus checksum. Never hand-edit these files.

The PL6 English corpus is intentionally `foundation`, not `ready`. Its few WordStrike-authored items exist to certify the pipeline, not to claim production coverage.

## Authoring rules

1. Give every source a stable `sourceId` and explicit `usageApproval`.
2. Use `practice-display-approved` only after human review. SPDX/repository license labels do not grant approval automatically.
3. Give each exposure family a stable `familyId` independent of partition order.
4. Give each item a stable `contentId`; never use an array index.
5. Put an optional `partitionLock` on the family, never on an item.
6. Set item `reviewStatus` to `approved` before it can enter generated runtime artifacts.
7. Do not add n-gram/target indexes here; PL7 owns derived indexing.
8. Do not add user/custom text, PII, HTML, callbacks, or runtime network dependencies.

## Build and validation

Generate checked-in artifacts explicitly:

```bash
npm run build:practice-corpus
```

Validate source checksums, provenance, hashes, family partitions, duplicates, near-duplicate contamination, manifest counts/checksum, and exact checked-in output without modifying files:

```bash
npm run validate:practice-corpus
```

Build output is deterministic. The builder completes all validation before replacing canonical files. A source snapshot checksum mismatch, unapproved source, unapproved item, duplicate, hard near-duplicate, partition conflict, or stale generated artifact fails closed.

When a corpus has status `ready` or `retired`, changing its build inventory under the same corpus version is rejected. Create a new corpus version for material changes/repartitioning.

## PL7 index build flow

After changing reviewed corpus source, use the complete deterministic sequence:

```bash
npm run build:practice-corpus
npm run validate:practice-corpus
npm run build:practice-indexes
npm run validate:practice-indexes
```

PL7 indexes are derived only. If an index is wrong, fix the PL6 corpus or PL7 analyzer/build logic and rebuild. **Never hand-edit generated PL7 indexes.** Training and diagnostic receive target→content reverse indexes; transfer and benchmark receive content→annotations only.

## Deliberate isolation

`data/commonGameplayWords.json` and its legacy Google-10k-derived pipeline are **not** approved Practice corpus sources. `data/english200.json` remains the ranked Typing Test corpus. Neither is imported by the Practice corpus runtime or build pipeline.
