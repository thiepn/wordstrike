# Practice Lab Data Architecture

Status: Prompt 2 foundation
Database generation: 1
Runtime integration: explicit future-feature use only; no shell initialization

## 1. Scope and goals

This document defines the durable local data boundary used by future Practice Lab prompts. The implementation lives under **js/practiceLab/**. The production entry imports only the separate Prompt 4 shell/catalog/controller path; it does not import the repository, manifest store, IndexedDB backend, memory backend, or session engine. The data foundation provides schemas, defaults, structured validation, migration, retention, manifest recovery, native IndexedDB and memory stores, and a high-level repository.

It deliberately does not implement UI, assessment, experiment execution, input processing, analysis formulas, mastery decisions, review scheduling, recommendations, account sync, or Supabase behavior.

## 2. Protected boundaries

Practice records are separate from **wordstrike_save**, **wordstrike_mode_data_v1**, Typing Test records, English 200, pending result recovery, leaderboard boards, and Campaign/Daily/Endless results. Practice modules import none of the existing storage, scoring, leaderboard, auth, or Supabase modules. Practice summaries have no board key, submission payload, eligibility field, access token, or raw event trace.

The developer-only Practice route imports shell modules but does not initialize this persistence layer. Public Practice remains COMING SOON.

## 3. Storage ownership

| Tier | Owns | Must not own |
| --- | --- | --- |
| Controller/session memory | Normalized input events, high-frequency timestamps, per-character arrays, uncommitted latency samples, renderer state, generator candidates | Durable history |
| localStorage manifest | Settings, profile/database pointer, onboarding/assessment state, dashboard cache, checkpoint metadata, health/migration state | Histories, custom-text bodies, skill maps, queues, raw events |
| IndexedDB | Profiles, aggregates, summaries, review items, custom text, presets, one checkpoint/profile, quarantine, metadata | Ranked records or authentication |

Raw input events are summarized before persistence and are never continuously written per keypress.

## 4. localStorage manifest

**practiceConstants.js** defines:

- primary: **wordstrike.practice.manifest.v1**;
- backup: **wordstrike.practice.manifest.backup.v1**;
- temporary: **wordstrike.practice.manifest.temp.v1**;
- serialized soft/hard write budget: 64 KiB.

**createPracticeManifestStore()** supports injected storage. **load()** validates/migrates the primary, recovers from a valid backup, or creates controlled defaults. **save()** validates and serializes before a temporary/backup/primary sequence. **clear()** removes only these three namespaced keys and never calls localStorage.clear.

The manifest includes **manifestVersion**, profile/database identity, timestamps, **settings**, onboarding state, assessment state, bounded dashboard summary, last session/assessment timestamps, optional checkpoint metadata, **storageHealth**, and **lastSuccessfulMigration**.

## 5. IndexedDB database and stores

**practiceConstants.js** defines database **wordstrike-practice-lab**, structural version **1**. **createPracticeIndexedDbStore()** is lazy: construction performs no open or write. **open()** is explicit.

Stores:

| Store | Purpose |
| --- | --- |
| **meta** | Schema, migration, health, counters, retention, reconciliation |
| **profiles** | Canonical local Practice profile |
| **skillStats** | Aggregated key/n-gram/word/pattern evidence |
| **sessionSummaries** | Completed/abandoned/interrupted summaries without raw traces |
| **reviewItems** | Future review state only; no scheduler |
| **customTexts** | Local-only user text |
| **presets** | Saved structural experiment configuration |
| **activeSessionCheckpoints** | Maximum one checkpoint per profile |
| **quarantine** | Bounded malformed/unmigratable evidence |

## 6. Store keys and indexes

**PRACTICE_STORE_DEFINITIONS** is authoritative and is consumed by both stores and upgrade tests.

| Store | Key path | Indexes |
| --- | --- | --- |
| meta | key | none |
| profiles | profileId | updatedAt |
| skillStats | statId | profileId, entityType, updatedAt, priority, confidenceLevel, masteryState, unique profileEntity |
| sessionSummaries | sessionId | profileId, experimentId, startedAtUtc, completedAtUtc, status, localDayKey |
| reviewItems | reviewItemId | profileId, dueAtUtc, localDueDayKey, state, entityType, entityKey, unique profileEntity |
| customTexts | customTextId | profileId, updatedAt, lastUsedAt, normalizedTitle |
| presets | presetId | profileId, experimentId, updatedAt |
| activeSessionCheckpoints | profileId | unique sessionId, expiresAt |
| quarantine | quarantineId | sourceStore, detectedAt |

The unique profile/entity review index means one canonical item changes state in place; it does not accumulate duplicate active records.

## 7. Schema-version strategy

The implementation keeps independent integers:

- manifest schema version: 1;
- IndexedDB structural version: 1;
- profile record version: 2;
- skill stat, session summary, review item, custom text, preset, checkpoint, and quarantine record versions: each 1;
- session schema version: 1;
- experiment version: experiment-owned integer;
- experiment configuration version: 1 foundation contract;
- content-generator version: generator-owned integer, initially 1.

Database version changes only store/index structure. Record versions change one record contract. Experiment versions change experiment behavior. Generator versions identify generated content reproducibility. They are not interchangeable.

## 8. Identifier strategy

**practiceIds.js** centralizes IDs. **createPracticeId()** prefers injected UUID, then **crypto.randomUUID()**, then a timestamp plus four randomized 32-bit components. Readable prefixes distinguish profile, session, review, text, preset, and quarantine IDs. The fallback accepts injected clock/random dependencies for deterministic tests and never uses array positions or timestamps alone.

Skill statistics use **createSkillStatId(profileId, entityType, entityKey)**, a stable encoded compound identity. Authentication IDs are never used.

## 9. Time semantics

**practiceTime.js** writes canonical UTC ISO strings with millisecond precision. **getPracticeTimeContext()** captures:

- UTC timestamp;
- original local **YYYY-MM-DD** day key;
- timezone offset minutes at session start;
- IANA timezone ID when safely available.

Historical local day keys remain unchanged after timezone changes. UTC due timestamps are canonical; local due-day keys are secondary grouping data. Future active elapsed timing belongs to performance.now; wall-clock UTC belongs to persisted records. Validators reject malformed timestamps, invalid days, negative durations, completion before start, and impossible active/wall relationships.

## 10. Practice profile schema

**createDefaultPracticeProfile()** creates:

- identity/version/created/updated fields;
- data locale and keyboard layout;
- first/last assessment and practice state;
- last local training-day key for idempotent active-day totals;
- total completed sessions, duration, and active days;
- settings and dashboard summary versions;
- bounded dashboard summary.

The dashboard carries nullable sustainable/burst/controlled WPM, accuracy, consistency, up to eight primary limiter IDs, due count, and a small trend label. It embeds neither full skills nor history and has no auth relationship.

Profiles also preserve nullable **lastTrainingDayKey** as a canonical local **YYYY-MM-DD** key. It is separate from UTC timestamps and lets completion count a local training day once without re-deriving historical locality after timezone changes. Profile v1 records migrate deterministically to v2 by adding **lastTrainingDayKey: null** when absent. IndexedDB remains structural version 1 because no store, key, or index changed.

## 11. Settings schema

**createDefaultPracticeSettings()** supplies:

- 12-minute daily sessions and five target days/week;
- common words as the initial preferred content type;
- low punctuation and number frequency;
- sound and metronome disabled;
- QWERTY, correction allowed, adaptive difficulty, system reduced motion;
- live WPM hidden, live accuracy and rhythm feedback visible.

**validatePracticeSettings()** enforces integer ranges, bounded content-type arrays, enums, booleans, and keyboard-layout length. **normalizePracticeSettings()** safely fills optional fields and normalizes enum casing. No UI consumes these settings yet.

## 12. Skill-stat schema

**createDefaultSkillStat()** supports key, bigram, trigram, word, punctuation-transition, number-pattern, and symbol-pattern entities.

Counters include sample/correct/error/corrected/uncorrected and review outcomes. Timing uses Welford-compatible count/mean/M2, min/max, EMA, eight fixed histogram buckets ending at infinity, and a ring capped at 64 recent samples. Historic events are not retained. Confidence, weakness, priority, trend, and mastery are stored values only; this prompt supplies no decision formula.

Validation enforces entity-specific key shape, counter relationships, bounded samples, finite timings, confidence levels, and mastery values. Key statistics are exempt from count-based pruning.

## 13. Session-summary schema

**createDefaultSessionSummary()** and **validateSessionSummary()** define universal identity/version, experiment/generator versions, controlled status/reason, UTC/local timezone context, durations, bounded configuration/content/targets, character/word counters, WPM/raw WPM/accuracy/consistency, optional before/after/transfer/fatigue/quality summaries, and bounded recommendation IDs.

Statuses are completed, abandoned, interrupted, or invalid. Reasons are time-complete, content-complete, word-target-complete, manual-stop, navigation-away, refresh-interruption, or error.

Objects are bounded to 128 KiB with configuration fields bounded separately. Raw events/traces, leaderboard eligibility, submission payloads, access tokens, board keys, and rules versions are explicitly rejected. Isolation is guaranteed by the Practice record type rather than a mutable ranked flag.

## 14. Checkpoint schema

**createDefaultCheckpoint()** records profile/session and version identity, 24-hour expiry, phase, configuration, content descriptor plus snapshot/reference/hash, cursor, typed buffer, completed units, elapsed active/paused values, metrics snapshot, resumability, and recovery reason.

It stores no raw input/latency trace. Key path **profileId** replaces the previous checkpoint, enforcing one per profile. Completion/abandonment may clear it transactionally. Restore must compare experiment/session versions and content hash in Prompt 3. Expired checkpoints are first in retention. Incompatible loaded records are quarantined by the repository.

## 15. Review-item schema

**createDefaultReviewItem()** defines entity identity, source experiment, state, priority, due UTC/local day, interval and outcome counters, last outcome, and mastery. States are new, due, learning, improving, stable, mastered, and suspended.

The repository detects active profile/entity conflicts before writes; IndexedDB additionally provides a unique compound index. This prompt does not calculate due dates or mastery.

## 16. Custom-text schema

**createDefaultCustomText()** stores plain text, normalized title, derived character/word counts, content hash, timestamps, language, analysis metadata, and fixed **local-only** privacy.

Limits:

- 20 texts/profile;
- 250,000 characters/text;
- 1,000,000 total characters/profile;
- 120-character title.

Oversized records are rejected, never truncated. Retention and quota recovery never auto-delete valid custom text. Text is not HTML and is excluded from error messages/diagnostics.

## 17. Preset schema

**createDefaultPreset()** stores ID/profile/version, name and normalized name, experiment ID/version, bounded JSON-safe configuration, and timestamps. Names are limited to 60 characters; each profile may hold 10 presets. New records beyond the cap are rejected, while an existing preset may be replaced.

Experiment-specific configuration validation is deferred to the owning experiment.

## 18. Validation and normalization

**practiceValidation.js** returns **{ valid, errors[] }**, where each error has path, code, and message. It validates required types, IDs, versions, enums, finite/ranged numbers, UTC/day values, array/string/serialized limits, plain JSON-safe structure, depth, cycles, and cross-field relationships.

Normalizers exist for settings, manifest, skill stats, summaries, and custom-text metadata. They fill safe optional defaults, normalize casing/whitespace, cap bounded recent samples, and remove forbidden transient/ranked summary fields. JSON-safe validation rejects prototype-sensitive keys (`__proto__`, `constructor`, and `prototype`). Normalizers do not rescue fundamentally malformed identity or metric data.

## 19. Migration strategy

**migratePracticeManifest()** and **migratePracticeRecord()** clone inputs, inspect the appropriate version field, reject unsupported future versions, perform sequential steps, normalize, validate, and report from/to versions and steps.

Version 1 uses identity migration. A missing version is treated as synthetic v0 solely to establish the v0-to-v1 framework; the resulting record must still pass current validation. Migration never mutates input and repeated migration is idempotent. Invalid outcomes return a structured migration failure and may be quarantined when discovered through repository reads.

The first concrete record migration is profile v1 to v2. It preserves every valid profile field, retains an existing valid local day key, and adds null only when the field is absent. Repository reads run record migration and write the canonical v2 record back to the Practice store. Manifest and IndexedDB structural versions remain 1.

## 20. Repository contract

**createPracticeRepository()** requires explicit data and manifest stores; it never silently selects memory persistence.

Implemented methods:

- initializePracticeStorage;
- get/save Practice profile and settings;
- get/save/list skill stats;
- save/get/list session summaries;
- save/get/list-due review items;
- save/get/list/delete custom texts;
- save/list/delete presets;
- save/get/clear active checkpoint;
- getStorageHealth;
- runPracticeRetention;
- commitCompletedPracticeSession;
- resetPracticeData.

Initialization explicitly opens the selected backend, creates the canonical profile if absent, and writes structural metadata. Reads validate records; malformed records are copied to bounded quarantine and removed from their source before a structured error is returned.

## 21. Atomic session commit

**commitCompletedPracticeSession()** validates the summary, skill updates, review changes, and optional profile before one read/write transaction across summaries, stats, reviews, profiles, checkpoints, and meta.

The transaction rejects a conflicting session ID and returns idempotent success for the same persisted summary. All completion records must belong to the active profile. It may clear the checkpoint and writes a pending manifest-reconciliation marker. After commit, the lightweight manifest dashboard/timestamp is updated and the marker is resolved. An idempotent retry also performs pending manifest reconciliation rather than claiming success against a stale manifest.

If the IndexedDB transaction fails, no transaction changes are reported as committed. If only the later manifest write fails, IndexedDB remains authoritative and the method returns **recoveryRequired** with the pending reconciliation marker; a later initialization prompt can reconcile the cache.

## 22. Retention limits

**buildPracticeRetentionPlan()** is pure and deterministic.

| Data | Limit/policy |
| --- | --- |
| Session summaries | Soft 1,000; hard 2,000; 730 days; preserve assessments, milestones, references |
| Keys | Never count-pruned |
| Bigrams | 1,500 |
| Trigrams | 2,000 |
| Words | 5,000 |
| Punctuation/number/symbol patterns | 1,000 combined |
| Review items | 5,000; deduplicate, then old mastered/suspended first |
| Custom text | Never automatic |
| Presets | 10; reject new |
| Quarantine | 100; oldest first |
| Checkpoints | One/profile; expired removed |

Skill pruning orders low confidence/sample count, staleness, and low priority before stronger recent evidence. A preservation-ID hook exists for future progress/review references.

## 23. Quota recovery

Repository writes detect common cross-browser quota errors. Recovery runs once in this order:

1. expired checkpoints;
2. summaries above retention;
3. stale/duplicate review records;
4. low-confidence bounded skill records;
5. old quarantine;
6. one write retry.

Current profile/settings, valid active checkpoint, custom text, and protected assessment/milestone summaries are not candidates. A second quota failure returns **PRACTICE_STORAGE_QUOTA_EXCEEDED**, marks manifest health when possible, and never falls back to localStorage for large records.

## 24. Interruption policy

Checkpoints expire after 24 hours. Incomplete sessions do not update analytics. Explicit abandonment may create a minimal summary after at least 20 accepted characters or 30 seconds active time, as represented by **hasMeaningfulAbandonedActivity()**. Refresh interruption remains a checkpoint until resume, abandonment, incompatibility, or expiry. Session IDs are idempotent and cannot create conflicting completions.

Prompt 3 owns checkpoint cadence and restore behavior; this foundation owns only the contract.

## 25. Privacy boundaries

All Practice data is local by default. Custom text is fixed local-only. No record requires auth or contains tokens. No module imports Supabase, leaderboard, pending-result, current save, or ranked mode storage. No raw trace is persisted. No cloud-sync placeholder is active.

## 26. Reset boundaries

**resetPracticeData()** clears only the nine Practice data stores and the three Practice manifest keys. It does not call localStorage.clear, touch **wordstrike_save**, **wordstrike_mode_data_v1**, auth storage, onboarding keys, or pending submissions. **deleteDatabase()** exists as an explicit lower-level IndexedDB operation but is never automatic.

## 27. Export/import boundary for future work

No export/import feature is implemented. A future exporter should operate through validated repository DTOs, omit raw events and internal health journals, include schema/version metadata, and require explicit custom-text consent. Import must stage, migrate, validate, detect profile/ID conflicts, estimate quota, and commit atomically. It must never import ranked or auth payloads.

## 28. IndexedDB-unavailable behavior

**createPracticeIndexedDbStore().open()** returns **PRACTICE_STORAGE_UNAVAILABLE** when IndexedDB is absent. The manifest can remain available to communicate degraded health, but large records are not silently moved into localStorage. **createPracticeMemoryStore()** is available only through explicit dependency injection for tests and future explicitly selected ephemeral operation.

## 29. Testing strategy

Focused Node tests cover:

- valid independent defaults and injected IDs/clocks;
- structured invalid-field and impossible-relationship failures;
- normalization and idempotent/future-safe migrations;
- manifest create/round-trip/backup/corruption/size/reset;
- IndexedDB descriptors and deterministic upgrade mocks;
- memory CRUD, uniqueness, checkpoint replacement, session idempotence, atomic commit, and scoped reset;
- retention order/caps and one-retry quota handling;
- static privacy and production-import boundaries.

Prompt 3 should build on the memory repository with a deterministic monotonic clock and normalized-input trace harness.

## 30. Prompt 3 integration contract

The session engine receives explicit:

- profile ID and generated session ID;
- experiment, configuration, generator, and content versions;
- UTC/timezone snapshot plus monotonic clock;
- optional valid checkpoint;
- repository interface.

During typing, raw normalized events and latency arrays stay in engine memory. Checkpoint writes contain only bounded cursor/content/metric snapshots. At completion, the engine produces a valid session summary plus analyzer-produced aggregate/review/profile updates and calls **commitCompletedPracticeSession()** once. It never calls existing mode storage or submission services.

Prompt 3 prerequisites now supplied: stable IDs, UTC/local time helpers, settings/profile contracts, summary/checkpoint validators and factories, explicit memory backend, lazy IndexedDB backend, atomic repository transaction, idempotence, structured errors, retention/quota behavior, and privacy invariants.

## 31. Open questions

1. Should Prompt 3 automatically pause or checkpoint on visibility change, and at what write cadence?
2. Should interrupted checkpoints be resumed automatically or require explicit confirmation?
3. Which keyboard layouts and IME policies enter the first session engine?
4. Should manifest reconciliation occur during every initialization or through an explicit repair call?
5. Will future export encrypt custom text, omit it by default, or request per-text consent?
6. Which assessment/milestone references populate the retention preservation hook?
7. Should a future IndexedDB version permit historical suspended review duplicates, or retain one canonical item/entity?

## Canonical record table

| Record | Store | Key | Version | Size/count limit | Retention | Privacy |
| --- | --- | --- | ---: | --- | --- | --- |
| Manifest | localStorage | wordstrike.practice.manifest.v1 | 1 | 64 KiB | Current + backup | Local |
| Profile | profiles | profileId | 2 | Small aggregate | One/profile | Local |
| Skill stat | skillStats | statId | 1 | Type caps; 64 recent timings | Confidence/staleness pruning | Local aggregate |
| Session summary | sessionSummaries | sessionId | 1 | 128 KiB; 1,000/2,000 | 730 days with preservation | Local, unranked |
| Review item | reviewItems | reviewItemId | 1 | 5,000 | Duplicate/stale mastered pruning | Local |
| Custom text | customTexts | customTextId | 1 | 20; 250k each; 1m total | User deletion only | Local-only |
| Preset | presets | presetId | 1 | 10; 60-char name | Explicit replace/delete | Local |
| Checkpoint | activeSessionCheckpoints | profileId | 1 | 512 KiB; one/profile | 24 hours | Local transient |
| Quarantine | quarantine | quarantineId | 1 | 100 | Oldest first | Local recovery |
