# Practice Lab Data Architecture

Status: current through PL11 contextual skill aggregation and evidence

Database structural version: **2**

## 1. Canonical identity boundary

All durable adaptive evidence is scoped by:

```text
PROFILE
  ↓
CONTEXT
  ↓
EVIDENCE
```

Canonical skill identity is:

```text
profileId + contextId + entityType + entityKey
```

Current profile preferences such as locale or layout never retroactively relabel historical evidence. Session/checkpoint/stat records carry their own immutable context identity.

## 2. Protected storage boundary

Practice persistence is isolated from `wordstrike_save`, Campaign, Endless, Arcade Rush, ranked Typing Test records, leaderboard submissions, authentication, Supabase, and cloud state. Practice reset code operates only on namespaced Practice storage.

Raw per-input traces and high-frequency transition details remain bounded in session memory. Durable storage contains compact summaries/aggregates, not continuous keyboard telemetry.

## 3. Storage tiers

| Tier | Owns | Does not own |
| --- | --- | --- |
| Session memory | normalized input, typing state, bounded event/error state, PL10 transient normalized transitions, PL11 uncommitted entity deltas | durable history |
| localStorage manifest | settings/defaults, profile/database pointer, dashboard/onboarding/health cache | context identity, skill maps, histories, raw text |
| IndexedDB | profile/context records, skillStats, session summaries, reviews, custom texts, presets, one checkpoint/profile, quarantine, metadata | ranked/auth/cloud state |

The manifest remains `wordstrike.practice.manifest.v1`. Canonical `activeContextId` lives on the profile record in IndexedDB.

## 4. IndexedDB structural version 2

Database: `wordstrike-practice-lab`

PL11 does **not** change stores or indexes, so there is no structural version bump.

| Store | Key path | Important indexes |
| --- | --- | --- |
| `meta` | `key` | none |
| `profiles` | `profileId` | `updatedAt` |
| `contexts` | `contextId` | `profileId`, `updatedAt`, `lastUsedAt`, unique `[profileId, fingerprint]` |
| `skillStats` | `statId` | `profileId`, `contextId`, `entityType`, `updatedAt`, `priority`, `confidenceLevel`, `masteryState`, unique `[profileId, contextId, entityType, entityKey]` |
| `sessionSummaries` | `sessionId` | `profileId`, `contextId`, `experimentId`, `startedAtUtc`, `completedAtUtc`, `status`, `localDayKey` |
| `reviewItems` | `reviewItemId` | `profileId`, `contextId`, `dueAtUtc`, `localDueDayKey`, `state`, `entityType`, `entityKey`, unique `[profileId, contextId, entityType, entityKey]` |
| `customTexts` | `customTextId` | `profileId`, `updatedAt`, `lastUsedAt`, `normalizedTitle` |
| `presets` | `presetId` | `profileId`, `experimentId`, `updatedAt` |
| `activeSessionCheckpoints` | `profileId` | unique `sessionId`, `expiresAt` |
| `quarantine` | `quarantineId` | `sourceStore`, `detectedAt` |

The PL5 v1→v2 structural migration removed the contextless skill/review uniqueness indexes and created context-aware replacements. PL11 reuses that topology.

## 5. Current record versions

| Record | Version |
| --- | ---: |
| context | 1 |
| profile | 3 |
| skillStat | 3 |
| sessionSummary | 6 |
| reviewItem | 2 |
| checkpoint | 3 |
| customText | 1 |
| preset | 1 |
| quarantine | 1 |

Related transient contracts:

| Contract | Version |
| --- | ---: |
| foundationAnalysis | 4 |
| PL11 skill evidence schema | 1 |
| PL11 evidence policy | 1 |
| PL11 evidence delta | 1 |
| PL11 evidence confidence | 1 |
| PL11 tracker checkpoint snapshot | 1 |

## 6. Context identity

A context contains `contextId`, `profileId`, timestamps, `dataLocale`, `keyboardLayout`, `inputMethod`, nullable `hardwareProfileId`, and a deterministic versioned fingerprint.

`inputMethod` is exactly `unknown`, `physical`, or `software`. Historical/default contexts use `unknown`; the system does not infer physical/software hardware from browser or screen characteristics.

Existing context identity is immutable. A saved `contextId` cannot later change owner or fingerprint. One profile has at most one context for a normalized fingerprint.

## 7. Profile preference semantics

Profile v3 retains `dataLocale` and `keyboardLayout` as defaults/preferences and stores required `activeContextId`. These preference fields are not sufficient identity for historical adaptive evidence.

Switching active context affects future sessions only. It never relabels prior skill stats, summaries, reviews, or an existing checkpoint.

## 8. skillStat v3

PL11 advances `skillStat` from v2 to v3 without changing its primary key or indexes.

A canonical v3 skill stat preserves identity and later-phase judgment fields, but replaces old canonical attempt/latency interpretation with explicit versioned evidence:

```text
identity
recordVersion: 3
evidenceVersion: 1
evidence
  opportunities / first-pass accuracy
  timing
  word launch timing where applicable
  primary error evidence
  observation diversity/breadth
  role lanes
confidenceScore
confidenceLevel
lastObservedAt
lastPractisedAt
legacyEvidenceV2
judgment fields preserved for later phases
```

PL11 itself does not update `weaknessScore`, `priority`, `masteryState`, `recentTrend`, `successfulReviewCount`, or `failedReviewCount`.

### Supported new evidence entities

PL11 creates new evidence only for:

- `key`
- `bigram`
- `trigram`
- `word`

Historical pattern entity records may migrate for preservation but are not newly emitted by PL11 v1.

## 9. v2→v3 skill migration

Migration is sequential, cloned, deterministic, validation-backed, future-version rejecting, and idempotent.

A pristine/default v2 record migrates to empty canonical v3 evidence with `legacyEvidenceV2: null`.

A non-empty v2 record preserves its old fixed accumulator payload in `legacyEvidenceV2`, while canonical v3 first-pass/contextual evidence starts empty with confidence `0 / none`. This avoids fabricating PL11 semantics that old records did not contain: first-pass opportunities, role lanes, contextual breadth, PL10 residual attribution, and PL9 primary episode attribution.

Legacy v2 evidence never contributes to v3 evidence confidence.

## 10. PL11 evidence semantics

An opportunity is one first encounter with an expected unit during a session. Correction retries do not add opportunities. Key/bigram/trigram opportunity correctness is tied to the terminal expected position's first attempt. A word opportunity is correct only if every position in that word was correct on first encounter.

Direct targeting applies only to an exact target entity. Component/containing entities remain incidental unless separately targeted.

Timing evidence keeps fluent raw latency, fluent normalized residual, and disfluent normalized residual separate. Word launch timing is stored separately from word-internal execution timing.

Error evidence comes from PL9 compact primary episode attribution and remains observational rather than causal.

## 11. Evidence roles

Canonical role enum:

```text
training
transfer
benchmark
diagnostic
custom
unclassified
```

Protected corpus roles require trusted content provenance/content-use validation and cannot be spoofed by arbitrary experiment metadata. Role is frozen for the session and retained by checkpoint v3.

Role lanes are bounded aggregates, not histories.

## 12. Custom Text privacy

Default PL11 policy does not create durable `word` skill entities from Custom Text. Local motor evidence for keys, bigrams, and trigrams remains allowed.

Neither skill stats nor checkpoints persist full Custom Text, sentence excerpts, containing-word lists, raw event traces, or growing session-ID histories.

## 13. Evidence confidence

PL11 confidence is evidence confidence—not skill/mastery probability. It combines quantity with session diversity, day diversity, and bounded contextual breadth under a versioned policy. One extremely large session cannot alone saturate high confidence.

Only general evidence confidence is persisted in the stat. Dimension-specific confidence for accuracy, fluent timing, normalized residual, disfluency, errors, or word launch is derived from the stored canonical evidence when needed.

## 14. SessionSummary v6

Session summary v6 adds nullable compact `skillEvidenceSummary` beside the existing PL8 `fluencySummary`, PL9 `errorSummary`, and PL10 `normalizationSummary`.

The summary stores counts/coverage/policy metadata only; per-entity deltas are transient and are explicitly forbidden from session summaries. Historical v5 summaries migrate with `skillEvidenceSummary: null` because older summaries cannot reconstruct PL11 entity evidence.

Raw events, normalized transition arrays, PL11 entity deltas, private Custom Text excerpts, leaderboard payloads, and auth state remain forbidden.

## 15. Checkpoint v3

Checkpoint v3 retains existing identity/content/typing/metrics state and adds bounded `skillEvidenceTrackerSnapshot` inside `metricsSnapshot`.

The snapshot preserves:

- frozen evidence role;
- first-attempt cursor frontier;
- current word first-pass state;
- bounded admitted entity evidence;
- primary-error drain boundary;
- truncation/coverage metadata.

Historical v2 checkpoints migrate with `skillEvidenceTrackerSnapshot: null`. Restore remains valid, but PL11 starts from the restored cursor with `partial-session` accuracy coverage rather than pretending missing pre-restore evidence was observed.

## 16. Atomic session commit

The canonical session engine supplies `skillEvidenceDeltas`; experiment analyzers do not supply full canonical skill-stat records.

Before committing, the repository validates:

- session/profile/context identity;
- context ownership;
- the entire delta batch and each stat ID;
- review/profile/checkpoint ownership;
- merged v3 skill-stat validity.

Inside one read/write transaction it loads/migrates or creates each stat, merges its one-session delta, writes merged stats, applies review/profile mutations, writes the session summary, clears the checkpoint, and marks reconciliation metadata.

Any failure aborts the transaction.

## 17. Exactly-once evidence application

`sessionId` is the commit idempotency boundary. If an identical completed summary already exists, commit returns idempotent success **before** applying skill evidence. If the same `sessionId` is associated with a different summary, commit fails as a duplicate/conflict.

This avoids duplicate skill evidence on retry without storing unbounded applied-session-ID lists on every stat.

Direct non-empty `updatedSkillStats` replacement is rejected on the canonical completion API; PL11 canonical writes use evidence deltas only.

## 18. Retention

Existing global skill/review/session/quarantine caps remain bounded. Skill records are never merged across contexts.

PL11 low-confidence pruning uses canonical v3 evidence confidence and deterministic tie-breakers. At equal confidence, purely incidental evidence is less protected than targeted evidence where practical. Review-linked entities remain protected by current repository integrity rules.

Per-session admission is also bounded. Direct target capacity is reserved ahead of incidental entities, and truncation/omission is represented explicitly rather than silently pretending complete coverage.

## 19. Reset and privacy

`resetPracticeData()` clears all Practice stores, including contexts, plus the namespaced Practice manifest keys. It does not call `localStorage.clear()` and does not touch gameplay/ranked/auth/cloud storage.

Durable PL11 data is local observational evidence. It does not create leaderboard payloads, remote profiles, browser fingerprints, hardware nicknames, or raw keyboard telemetry.

## 20. Later-phase contract

PL11 ends at evidence accumulation. Later phases may interpret it but must not silently rewrite the measurement definitions:

- PL12: limiter/weakness interpretation and impact;
- PL15: mastery;
- PL16: trends and learning curves;
- PL17: review semantics.

The dedicated PL11 contextual skill aggregation/evidence-model document is authoritative for first-pass opportunity rules, timing lanes, primary error attribution, confidence policy, role semantics, admission bounds, and checkpoint compaction.