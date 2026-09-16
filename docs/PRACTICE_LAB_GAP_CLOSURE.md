# Practice Lab Gap Closure Ledger

This document is the cumulative repository ledger for Practice Lab gap-closure work. It records closure progress without rewriting the frozen Implementation Completion Audit snapshot.

## GC1 — Canonical Protocol Reconciliation

Status:
`PASS`

Closed gaps:

```text
GAP-001:
CLOSED

GAP-002:
CLOSED
```

Base audited commit:
`3ef366d37c6474dc48f03ac4052a644648cebbe1`

Certified implementation head:
`72a41591ce249f4f953e9d56e06be40fc8dcbfa8`

### PL26 — Pace Ladder canonical state

```text
Reference:
30 s

Rungs:
8 × 20 s

Ratios:
0.75
0.85
0.95
1.05
1.15
1.25
1.10
0.90

Active duration:
190 s

Validation phase:
none
```

Canonical treatment identity:
`pace-ladder-canonical-v2`

The obsolete v1 PL26 protocol remains historical metadata only and cannot launch new sessions. Canonical v2 treatment identity/versioning prevents corrected sessions from pooling with obsolete v1 Treatment Response history.

### PL27 — Burst Sprints canonical state

```text
Warm-up:
30 s

Previews:
6 × 2 s

Sprints:
6 × 10 s

Recoveries:
5 × 18 s

Active typing:
90 s

Protocol-inactive:
102 s

Wall duration:
192 s
```

Canonical treatment identity:
`burst-six-canonical-v2`

The obsolete v1 PL27 protocol remains historical metadata only and cannot launch new sessions. Canonical v2 treatment identity/versioning prevents corrected sessions from pooling with obsolete v1 Treatment Response history.

### Storage state

```text
Practice DB:
12

Session Summary:
14
```

No GC1 schema migration occurred.

### Test evidence

```text
Full project suite:

373 test files
929 tests
929 passed
0 failed
0 skipped
```

### PL39 evidence

```text
PL39 Privacy / Security / Data Integrity:
PASS

Integrity tests:
27 / 27 passed

Privacy/security source audit:
PASS
```

### Migration evidence

```text
All supported Practice DB start versions:
upgrade successfully to DB12

Session Summary migrations:
reach v14

Unexpected record loss:
0
```

### CI / certification evidence

At certified implementation head `72a41591ce249f4f953e9d56e06be40fc8dcbfa8`, the following were green:

```text
Tests

PL39 Privacy Security Data Integrity

PL40 Final Practice Lab Release Certification
```

This does not imply overall Practice RC1 readiness. Remaining Gap Closure work is still required.

### Regressions found and fixed

| Regression | Classification | Resolution |
| --- | --- | --- |
| Burst host broke PL28 pulse/interrupt compatibility | Type B — real dependency | Host compatibility restored |
| New PL27 sigma test assumed the `.03` MAD floor incorrectly | Type D — GC1 test bug | Independent exact sigma expectation corrected |
| PL39 expected 3 Burst HTML sinks after refactor reduced them to 1 | Type B — audit dependency | Certified sink count tightened to 1 |
| Draft treatment variant labels disagreed with registry | Type A — obsolete expectation/metadata | Tests/docs aligned to canonical identities |

```text
Type C pre-existing failures excluded:
0
```

### Test-drift finding

> Before GC1, green PL26 and PL27 tests explicitly certified superseded protocols. GC1 replaced those expectations with independent canonical contract tests.

This historical finding is preserved; the original contradiction is not retroactively rewritten away.

### PL30 non-interference

```text
Intentional PL30 model-boundary changes:
0
```

GC1 did not modify the unresolved PL30 pseudo-entity architecture involving:

```text
punctuation-pattern
number-symbol-pattern
```

### Public state

```text
Practice public gate:
disabled
```

GC1 did not expose Practice publicly.

### Remaining gaps

```text
GAP-003:
OPEN — PL30 model-boundary contradiction

GAP-004:
OPEN — release-critical content / release evidence gap

GAP-005–GAP-010:
OPEN — unchanged from frozen audit
```

No additional gap is closed by GC1 merely because the regression and certification evidence is green.

### RC status

```text
RC1:
NO — GAP CLOSURE REQUIRED
```

### Frozen audit snapshot

The Implementation Completion Audit remains historical evidence and is not retroactively rewritten:

```text
Architecture specified:
100%

Implementation present:
83%

Implementation verified:
77%
```

Gap Closure progress is recorded in this ledger instead.

### GC1 formal closure state

```text
GC1:
PASS

GAP-001:
CLOSED

GAP-002:
CLOSED
```

The formal repository closure point is the documentation-only commit that introduces this ledger on top of certified implementation head `72a41591ce249f4f953e9d56e06be40fc8dcbfa8`.

Next independent work package after this committed closure:

```text
GC2 — PL30 Model-Boundary Repair
```

## GC2 — PL30 Model-Boundary Repair

Status:
`PASS`

Closed gap:
`GAP-003`

Base:
`ca54ee78c05ab8f2792f32fb6ea5001ef5be09ec`

Certified implementation head:
`0b3290f9f6feeeb9be16b6a81609d0aca55f02f8`

```text
Legacy-data strategy:
C — explicit selective cleanup migration

Practice DB:
12

Session Summary:
14
```

GC2 is a model-boundary repair within the existing DB12 architecture. It does not introduce DB13, does not redesign PL30 modes, and does not change the public Practice gate.

### Persistent PL11 entity boundary

The persistent PL11 entity boundary is exactly:

```text
key
bigram
trigram
word
```

No PL30 category entity may persist through PL11. The canonical PL11 write boundary rejects unsupported persistent entity types, so GC2 prevents future invalid creation in addition to cleaning existing invalid persistent state.

No substitute persistent category store was introduced, including stores such as:

```text
punctuationPatternStats
numberSymbolPatternStats
```

PL30 category analysis remains domain-result analysis rather than a replacement entity model.

### Legitimate PL13 ability channels

GC2 preserves the independent PL13 ability channels:

```text
punctuation
numbers-symbols
```

These are ability channels, not PL11 entities. The model distinction is explicit:

```text
PL13 punctuation ability
≠
PL11 punctuation-pattern entity

PL13 numbers-symbols ability
≠
PL11 number-symbol-pattern entity
```

### Transient PL30 domain analysis

Category-level PL30 analysis remains allowed as transient/session-derived analysis. It does not create persistent special-character pseudo-entity state for:

```text
mastery
learning
review
Coach targets
Boss targets
```

### Historical and pseudo entity identifiers

GC2 cleanup recognizes the following invalid historical/pseudo persistent entity forms:

```text
punctuation-pattern
number-symbol-pattern
punctuation-transition
number-pattern
symbol-pattern
```

These names are cleanup sentinels only; none is an active PL11 persistent entity type.

### Cleanup strategy and scope

```text
Legacy-data strategy:
C — explicit selective cleanup migration
```

This is a selective compatibility cleanup inside DB12 rather than a schema-version bump.

Cleanup is restricted to the three affected entity-bearing stores:

```text
skillStats
learningStates
reviewItems
```

GC2 does not purge or rewrite unrelated canonical state, including:

```text
canonical key evidence
canonical bigram evidence
canonical trigram evidence
canonical word evidence
PL13 punctuation ability
PL13 numbers-symbols ability
session summaries
Coach state
Treatment Response
physical telemetry
PL26 state
PL27 state
unrelated Practice Lab data
```

Historical PL30 sessions remain valid historical sessions. Cleanup removes invalid persistent entity-model state; it does not erase the sessions that created it.

### Downstream model boundary

Invalid PL30 pseudo-entities can no longer create or participate in:

```text
PL12 targetable limiter entities
PL15 mastery
PL16 learning / saturation
PL17 reviews
Daily Coach targets
Weakness Boss targets
```

### PL30 mode behavior preserved

The visible PL30 modes remain:

```text
punctuation-capitals
numbers-symbols
```

Their canonical Practice/Check structure is preserved. GC2 changes model ownership, not mode design.

When admission requirements are met, standardized Checks retain the PL13 behavior:

```text
Punctuation Check:
1 punctuation ability observation

Numbers & Symbols Check:
1 numbers-symbols ability observation
```

Practice sessions retain:

```text
PL13 ability observations:
0
```

Direct PL16 acquisition dose remains:

```text
Punctuation Practice:
0

Numbers & Symbols Practice:
0

Punctuation Check:
0

Numbers & Symbols Check:
0
```

### GC2-specific test evidence

GC2-specific tests verify:

- fresh databases do not persist invalid PL30 pseudo-entities;
- legacy DB12 state containing invalid PL30 entity records is selectively cleaned;
- canonical `key`, `bigram`, `trigram`, and `word` records survive cleanup;
- legitimate PL13 `punctuation` and `numbers-symbols` ability state survives cleanup;
- PL30 session history remains preserved and usable;
- cleanup against an already-clean database is idempotent and has no destructive second-pass behavior.

### Verification workflows

At certified implementation head `0b3290f9f6feeeb9be16b6a81609d0aca55f02f8`, the following were green:

```text
Tests
PL30 Derived Artifact Validation
PL31–PL38 workflows
PL39 Privacy / Security / Integrity Hardening
PL40 Final Practice Lab Release Certification
PL26 Pace Ladder
PL27 Burst Sprints
PL28 Common Words / Session Pulse
PL29 Consistency / Endurance
PL9–PL17 Practice Lab foundation and learning-stack workflows
Release Finalization
CodeQL
OSV
CI pipeline
```

No new numerical test totals are asserted here beyond what repository workflow evidence independently records.

### PL39 evidence

```text
PL39:
PASS
```

PL39's focused integrity, full regression, migration, runtime/security, and production-build validation remained green as represented by the repository workflows at the certified GC2 implementation head.

### PL40 evidence

The existing PL40 Final Practice Lab Release Certification workflow remained green at the certified GC2 implementation head.

This does not close the audit's remaining broader release-evidence or release-critical content gaps.

### Source-history discrepancy

The following expected audit artifacts were not present in the certified GC1 repository state used as GC2's base and were not fabricated retroactively:

```text
docs/PRACTICE_LAB_IMPLEMENTATION_COMPLETION_AUDIT.md
practice-lab-implementation-matrix.json
```

GC2 therefore reconstructed its repair map from actual repository evidence:

```text
PL30 specification
runtime implementation
tests
storage contracts
GC1 closure ledger
```

### PR and repository state

```text
PR:
#112

Status:
draft

Base:
GC1 closure branch

Merged to main:
no

Practice public gate:
disabled
```

No change to `main` belongs to GC2 closure, and this ledger commit does not merge PR #112.

### GAP-003 formal closure

```text
GAP-003 — PL30 Model-Boundary Contradiction

Previous status:
CONTRADICTED / BLOCKER / MODEL-BOUNDARY CONTRADICTION

Closure status:
CLOSED

Closure package:
GC2
```

Closure summary:

> PL30 no longer creates persistent special-character PL11 entity types. The PL11 persistent boundary is restricted to key/bigram/trigram/word. Legacy PL30 pseudo-entities are selectively removed from skillStats, learningStates, and reviewItems while canonical skill evidence, PL13 punctuation/numbers-symbols abilities, and session history are preserved.

### Test-drift history

Earlier PL30 tests/runtime had certified the invalid persistent-entity model. That historical audit finding remains valid evidence of why GAP-003 existed and is not rewritten as though the contradiction never occurred.

### Remaining gaps after GC2

Current closure status:

```text
Closed:
GAP-001
GAP-002
GAP-003

Open:
GAP-004
GAP-005–GAP-010
```

The existing audit meanings of the open gaps remain unchanged.

```text
GAP-004:
OPEN — release-critical content / release evidence gap

GAP-005–GAP-010:
OPEN — unchanged from frozen audit
```

GAP-004 retains the known release-critical content issue, including empty/unready artifacts identified by the audit. GC2 does not populate or close those artifacts.

### Frozen audit snapshot remains historical

The original audit percentages remain unchanged historical evidence:

```text
Architecture specified:
100%

Implementation present:
83%

Implementation verified:
77%
```

They are not retroactively recalculated by gap closure.

### RC status

```text
RC1:
NO — GAP CLOSURE REQUIRED
```

### GC2 formal closure state

```text
GC2:
PASS

GAP-003:
CLOSED
```

The technical repair is certified at `0b3290f9f6feeeb9be16b6a81609d0aca55f02f8`. Formal GC2 closure is represented by the documentation-only ledger commit immediately following that certified implementation head.

Next independent work package after this committed closure:

```text
GC3 — Release-Critical Content Completion
```

GC3 is not started by this closure commit.
