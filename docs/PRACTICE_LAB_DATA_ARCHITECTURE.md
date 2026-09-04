# Practice Lab Data Architecture

Status: PL5 context identity foundation + PL8 latency + PL9 error/recovery + PL10 context/typability normalization
Database generation: 2
Runtime integration: explicit Practice-only use; public Practice remains developer gated

## 1. Canonical identity boundary

Practice adaptive evidence is now identified by:

~~~text
PROFILE
  ↓
CONTEXT
  ↓
EVIDENCE
~~~

The durable context boundary exists so English/QWERTY, German/QWERTZ, software-keyboard, alternative-layout, and future hardware-specific evidence cannot be silently mixed. Fine-grained aggregation across contexts is not a default repository behavior.

The authoritative PL5 contract is also documented in **PRACTICE_LAB_CONTEXT_IDENTITY.md**.

## 2. Protected boundaries

Practice persistence remains completely separate from **wordstrike_save**, ranked Typing Test records, Campaign, Endless, Daily Strike, Arcade Rush, leaderboard submissions, authentication, access tokens, Supabase, and global leaderboards. Practice modules do not require auth or cloud services.

Raw per-key input traces remain memory-bounded session data. Durable Practice storage contains summaries and aggregates, not continuous keyboard telemetry.

## 3. Storage tiers

| Tier | Owns | Must not own |
| --- | --- | --- |
| Session memory | normalized input, high-frequency timing, bounded event trace, uncommitted observations | durable history |
| localStorage manifest | settings, profile/database pointer, onboarding/assessment cache, dashboard cache, storage health | context identity, histories, custom text bodies, skill maps |
| IndexedDB | profiles, contexts, skill evidence, summaries, reviews, custom text, presets, one checkpoint/profile, quarantine, metadata | ranked/auth/cloud state |

The namespaced manifest remains **wordstrike.practice.manifest.v1** at schema version 1. Its database pointer is reconciled to IndexedDB structural version 2. Canonical **activeContextId** lives only on the profile in IndexedDB; PL5 does not duplicate it into the manifest.

## 4. IndexedDB structural version 2

Database: **wordstrike-practice-lab**

| Store | Key path | Important indexes |
| --- | --- | --- |
| meta | key | none |
| profiles | profileId | updatedAt |
| contexts | contextId | profileId, updatedAt, lastUsedAt, unique [profileId, fingerprint] |
| skillStats | statId | profileId, contextId, entityType, updatedAt, priority, confidenceLevel, masteryState, unique [profileId, contextId, entityType, entityKey] |
| sessionSummaries | sessionId | profileId, contextId, experimentId, startedAtUtc, completedAtUtc, status, localDayKey |
| reviewItems | reviewItemId | profileId, contextId, dueAtUtc, localDueDayKey, state, entityType, entityKey, unique [profileId, contextId, entityType, entityKey] |
| customTexts | customTextId | profileId, updatedAt, lastUsedAt, normalizedTitle |
| presets | presetId | profileId, experimentId, updatedAt |
| activeSessionCheckpoints | profileId | unique sessionId, expiresAt |
| quarantine | quarantineId | sourceStore, detectedAt |

Database upgrade reconciles declared stores/indexes inside the IndexedDB version-change transaction. It explicitly removes the obsolete **skillStats.profileEntity** and **reviewItems.profileEntity** indexes, creates the context-aware replacements, and never deletes unknown stores blindly.

Fresh-v2 creation and v1→v2 upgrade are tested to converge on the same declared structure.

## 5. Record versions

| Record | Version |
| --- | ---: |
| context | 1 |
| profile | 3 |
| skillStat | 2 |
| sessionSummary | 5 |
| reviewItem | 2 |
| checkpoint | 2 |
| customText | 1 |
| preset | 1 |
| quarantine | 1 |

Database, record, session, experiment, and generator versions remain independent contracts.

## 6. Context record

A Practice context contains **contextId**, **profileId**, timestamps, **dataLocale**, **keyboardLayout**, **inputMethod**, nullable **hardwareProfileId**, and a versioned deterministic **fingerprint**.

Context normalization is conservative. Locale strings are trimmed, underscore separators may become hyphens, malformed/empty values are rejected, and layout identifiers are trimmed/lowercased within a bounded safe-string contract. Input method is exactly **unknown**, **physical**, or **software**. PL5 never infers input method or keyboard hardware from user agent, screen size, or touch support.

Fingerprint semantics are explicitly versioned. One profile may own at most one context for a normalized fingerprint. Existing context identity is immutable: a saved contextId cannot later be reassigned to another profile or fingerprint.

## 7. Deterministic default context

Every profile has a deterministic default context ID derived only from profileId. It is stable across reloads and does not depend on the clock or browser locale.

The default context uses the profile's existing locale/layout preferences plus:

~~~text
inputMethod: "unknown"
hardwareProfileId: null
~~~

Historical v1 evidence is mapped to this default context because old records did not distinguish physical from software input. PL5 never invents missing historical precision.

## 8. Profile and settings semantics

Profile v3 adds required **activeContextId** while retaining **dataLocale** and **keyboardLayout**. Those retained fields are defaults/preferences for future context creation; they are no longer sufficient identity for persisted skill evidence.

Likewise **settings.keyboardLayout** remains a preference. No context-sensitive query may infer historical identity from current settings. Evidence identity is the record's **contextId**.

## 9. Context-sensitive records

### Skill statistics

Skill identity is now:

~~~text
profileId + contextId + entityType + entityKey
~~~

**createSkillStatId()** requires all four components and has no contextless overload. Skill-stat v2 validation verifies the ID against that exact identity.

### Review items

Canonical uniqueness is one review item per **profile/context/entity**. The same entity may have independent review state in multiple contexts. Repository and IndexedDB uniqueness both enforce this boundary.

### Session summaries

Every summary permanently stores the context in which the session produced evidence. Historical summaries never derive context later from the profile's current active context.

### Checkpoints

The one-checkpoint-per-profile architecture remains. Each checkpoint now also stores immutable **contextId**. Restore resolves that exact context and returns a recoverable failure if it is missing/corrupt; it never substitutes today's active context.

## 10. Migration and bounded reconciliation

Record migration remains cloned, sequential, deterministic, validation-backed, future-version rejecting, and idempotent.

PL5 adds:

- profile 2→3: deterministic activeContextId;
- skillStat 1→2: deterministic default context plus recomputed four-part statId;
- sessionSummary 1→2: deterministic default context;
- reviewItem 1→2: deterministic default context;
- checkpoint 1→2: deterministic default context.

Historical skill-stat identity is validated against the actual v1 profile/entity ID contract before remapping. Current-version validators never accept contextless records; only migration adapters understand historical schemas.

Storage initialization performs one bounded PL5 reconciliation over the retained Practice stores. It creates missing deterministic default contexts from profile defaults, validates ownership, backfills context-sensitive records, replaces old skill primary keys, and writes the PL5 completion marker only after successful reconciliation. Subsequent initialization is cheap and does not rescan all Practice evidence indefinitely.

If both a legacy skill record and canonical v2 record resolve to one new key, semantically equivalent duplicates collapse to the canonical record. Independent evidence that cannot be safely merged is quarantined; PL5 does not invent statistical merge formulas.

Malformed records follow bounded quarantine/recovery policy. An invalid active profile/context fails closed and cannot mark PL5 migration complete.

## 11. Repository query and ownership contracts

Context repository operations support get/list/save/create, active-context resolution, and atomic active-context switching. Logical duplicate contexts reuse the existing canonical record where possible.

Context-sensitive adaptation queries are context-specific by default. Explicit cross-context administrative methods are named as such. Session history may list all contexts, but each summary always exposes its own contextId.

Every context-sensitive write verifies **context.profileId === record.profileId**. Atomic session completion verifies the summary context and rejects skill/review/checkpoint changes from any other profile/context before committing.

Switching active context changes future evidence only. It never relabels prior stats, sessions, reviews, or an existing checkpoint.

## 12. Session completion and retention

Completed-session persistence remains atomic across summaries, stats, reviews, profile updates, checkpoints, and reconciliation metadata. A failed mixed-context commit produces no partial session write and preserves existing recovery semantics.

Retention caps remain bounded. Skill stats are never merged across contexts, and review deduplication keys include contextId. Existing session/stat/review/quarantine limits otherwise remain unchanged.

## 13. Reset and privacy

**resetPracticeData()** clears all ten Practice stores, including **contexts**, plus the three namespaced Practice manifest keys. It never calls **localStorage.clear()** and never touches gameplay/ranked/auth storage.

Contexts are durable identity records. PL5 implements no arbitrary context deletion/archive UI because dependent historical evidence would require explicit handling.

## 14. Explicit PL5 non-goals

PL5 does not implement physical/software auto-detection, a context-selection UI, hardware keyboard profiles, multilingual corpora, ability/weakness models, Coach logic, adaptive experiments, assessment UI, advanced telemetry, leaderboard behavior, or cloud sync.

## 15. PL10 durable normalization evidence

PL10 keeps IndexedDB structural version **2** and advances only **sessionSummary** from v4 to v5. The new nullable **normalizationSummary** stores compact versioned context/typability evidence. Historical v4 summaries migrate with **normalizationSummary: null**; PL10 never reconstructs normalized residuals or text difficulty from older WPM/latency/error aggregates.

Durable normalization evidence may contain the frozen context fingerprint, locale/layout/input method, transition-normalization coverage/residual aggregates, and compact text-difficulty/reference metadata. It does **not** persist raw text, per-transition residual traces, full feature vectors, entity residual maps, frequency tables, hardware nicknames, browser/device fingerprints, or leaderboard fields.

The exact model contract and protected-partition rules are documented in **PRACTICE_LAB_CONTEXT_TYPABILITY_MODEL.md**.
