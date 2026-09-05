# Practice Lab Data Architecture

Status: current through PL13 ability estimation and measurement uncertainty

Database structural version: **3**

## 1. Canonical identity boundaries

Durable entity evidence remains scoped by:

```text
PROFILE
  ↓
CONTEXT
  ↓
ENTITY EVIDENCE
```

Canonical skill identity is:

```text
profileId + contextId + entityType + entityKey
```

PL13 introduces a separate higher-level ability identity:

```text
profileId + contextId + abilityChannel
```

Skill evidence and general ability are therefore not stored in the same record type.

Current profile preferences such as locale or layout never retroactively relabel historical evidence or ability. Session/checkpoint/stat/ability records carry immutable context identity.

## 2. Protected storage boundary

Practice persistence remains isolated from `wordstrike_save`, Campaign, Endless, Arcade Rush, ranked Typing Test records, leaderboard submissions, authentication, Supabase, and cloud state. Practice reset operates only on namespaced Practice storage.

Raw per-input traces and high-frequency transition details remain bounded in session memory. Durable storage contains compact summaries/aggregates, not continuous keyboard telemetry.

## 3. Storage tiers

| Tier | Owns | Does not own |
| --- | --- | --- |
| Session memory | normalized input, typing state, bounded event/error state, PL10 transient normalized transitions, PL11 uncommitted entity deltas, PL13 transient ability observation assessment | durable history |
| localStorage manifest | settings/defaults, profile/database pointer, dashboard/onboarding/health cache | context identity, skill maps, ability states, histories, raw text |
| IndexedDB | profile/context records, skillStats, **abilityStates**, session summaries, reviews, custom texts, presets, one checkpoint/profile, quarantine, metadata | ranked/auth/cloud state |
| PL12 derived memory | context limiter snapshots, peer references, prevalence lookup cache | persistent skill truth, ability truth, review state, session state |

The manifest remains `wordstrike.practice.manifest.v1`. Canonical `activeContextId` lives on the profile record in IndexedDB.

## 4. IndexedDB structural version 3

Database: `wordstrike-practice-lab`

PL13 is the first structural Practice upgrade since PL5. The exact v2→v3 migration adds only `abilityStates`; existing stores and indexes are not recreated or deleted.

| Store | Key path | Important indexes |
| --- | --- | --- |
| `meta` | `key` | none |
| `profiles` | `profileId` | `updatedAt` |
| `contexts` | `contextId` | `profileId`, `updatedAt`, `lastUsedAt`, unique `[profileId, fingerprint]` |
| `skillStats` | `statId` | `profileId`, `contextId`, `entityType`, `updatedAt`, legacy `priority`, `confidenceLevel`, `masteryState`, unique `[profileId, contextId, entityType, entityKey]` |
| `abilityStates` | `abilityStateId` | `profileId`, `contextId`, `channel`, `updatedAt`, unique `[profileId, contextId, channel]` |
| `sessionSummaries` | `sessionId` | `profileId`, `contextId`, `experimentId`, `startedAtUtc`, `completedAtUtc`, `status`, `localDayKey` |
| `reviewItems` | `reviewItemId` | `profileId`, `contextId`, `dueAtUtc`, `localDueDayKey`, `state`, `entityType`, `entityKey`, unique `[profileId, contextId, entityType, entityKey]` |
| `customTexts` | `customTextId` | `profileId`, `updatedAt`, `lastUsedAt`, `normalizedTitle` |
| `presets` | `presetId` | `profileId`, `experimentId`, `updatedAt` |
| `activeSessionCheckpoints` | `profileId` | unique `sessionId`, `expiresAt` |
| `quarantine` | `quarantineId` | `sourceStore`, `detectedAt` |

The PL5 v1→v2 migration created the context-aware skill/review topology. PL13 v2→v3 preserves that topology and adds the one independent ability store.

The physical `skillStats.priority` index remains for schema compatibility; PL12's derived `priorityScore` is not written there.

## 5. Current record versions

| Record | Version |
| --- | ---: |
| context | 1 |
| profile | 3 |
| skillStat | 3 |
| **abilityState** | **1** |
| **sessionSummary** | **7** |
| reviewItem | 2 |
| checkpoint | 3 |
| customText | 1 |
| preset | 1 |
| quarantine | 1 |

Related transient/derived contracts:

| Contract | Version |
| --- | ---: |
| **foundationAnalysis** | **5** |
| PL11 skill evidence schema | 1 |
| PL11 evidence policy | 1 |
| PL11 evidence delta | 1 |
| PL11 evidence confidence | 1 |
| PL11 tracker checkpoint snapshot | 1 |
| PL12 limiter snapshot/model/policy | 1 |
| PL12 impact/hierarchy/prevalence models | 1 |
| **PL13 ability estimator** | **1** |
| **PL13 ability policy** | **1** |
| **PL13 ability observation** | **1** |
| **PL13 ability uncertainty** | **1** |

## 6. Context identity

A context contains `contextId`, `profileId`, timestamps, `dataLocale`, `keyboardLayout`, `inputMethod`, nullable `hardwareProfileId`, and a deterministic versioned fingerprint.

`inputMethod` is exactly `unknown`, `physical`, or `software`. Historical/default contexts use `unknown`; the system does not infer physical/software hardware from browser or screen characteristics.

Existing context identity is immutable. A saved `contextId` cannot later change owner or fingerprint. One profile has at most one context for a normalized fingerprint.

PL13 ability never crosses this boundary automatically. A new context begins unmeasured for every ability channel.

## 7. Profile preference semantics

Profile v3 retains `dataLocale` and `keyboardLayout` as defaults/preferences and stores required `activeContextId`. These preference fields are not sufficient identity for historical adaptive evidence or ability.

Switching active context affects future sessions only. It never relabels prior skill stats, summaries, reviews, checkpoints, or ability states.

## 8. skillStat v3

PL11 advanced `skillStat` from v2 to v3. PL12 and PL13 leave v3 unchanged.

A canonical v3 skill stat stores entity evidence only:

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
```

PL12 diagnostic `weaknessScore` / `priorityScore` remain derived in memory. PL13 does not place general typing ability in `skillStats`.

## 9. abilityState v1

PL13 creates one state per:

```text
profileId + contextId + channel
```

Canonical channels are:

```text
cold-natural-text
controlled-speed
common-words
burst
endurance
punctuation
numbers-symbols
```

There is no `overall` channel.

The state contains:

```text
abilityStateId
profileId
contextId
channel
recordVersion
estimatorVersion
estimatorPolicyVersion
createdAt
updatedAt
estimate
evidence
recentObservations
```

The estimate is maintained in log-WPM internally and exposes WPM/model-interval/SRC values externally. The recent-observation audit ring is bounded to 32 entries. The serialized state is bounded to 32 KiB.

The authoritative model definition is `PRACTICE_LAB_ABILITY_ESTIMATION.md`.

## 10. v2→v3 skill migration remains historical

PL13 does not alter PL11 skill migration semantics. Non-empty v2 skill evidence remains under fixed `legacyEvidenceV2`; canonical v3 evidence is not fabricated from old counters.

There is no ability-state backfill from old skill stats or old sessions.

## 11. PL11 evidence semantics remain authoritative

Opportunity, first-pass correctness, fluent/disfluent timing, word launch timing, primary error attribution, role lanes, confidence, and Custom Text privacy remain PL11 definitions.

PL13 uses session-level measurement data; it does not reinterpret PL11 entity evidence into general ability.

## 12. Evidence roles and ability roles

The shared fixed role vocabulary remains:

```text
training
transfer
benchmark
diagnostic
custom
unclassified
```

PL13 channel policy decides which trusted roles can update each ability channel. `custom` and `unclassified` do not update v1 ability.

Trusted experiment `abilityChannel` alone is insufficient; resolved content role must also match channel policy.

## 13. Custom Text privacy

Default PL11 policy still suppresses durable custom-word skill entities. PL12 does not reconstruct them.

PL13 additionally refuses `custom` and `unclassified` ability observations, so ability state cannot become an alternate durable private-text index.

Ability state contains no full text, excerpts, word lists, containing phrases, raw traces, or entity histories.

## 14. Evidence confidence versus ability confidence

PL11 evidence confidence remains entity-evidence confidence.

PL12 reuses dimension-specific PL11 confidence for limiter interpretation.

PL13 introduces separate **ability confidence**, driven by recursive model uncertainty plus repeated observation/session/day evidence. It does not reuse the PL11 confidence formula.

## 15. SessionSummary v7

PL13 advances session summary v6→v7 with nullable:

```text
abilityMeasurementSummary
```

Historical v6 summaries migrate with:

```text
abilityMeasurementSummary: null
```

because old sessions were not governed by PL13 measurement protocols.

An ordinary non-measurement session also persists null.

A requested ability measurement may persist compact assessment metadata:

```text
analysisVersion
observationVersion
channel
status
reasons
sourceRole
adjustedWpm
measurementSigmaLog
reliabilityWeight
difficultyAdjustmentLog
difficultyModelStatus
```

It does **not** persist the resulting latent ability state or `newAbilityEstimate`.

Raw events, normalized transition arrays, PL11 entity deltas, private Custom Text excerpts, leaderboard payloads, and auth state remain forbidden.

## 16. Foundation analysis v5

The current transient wrapper is:

```text
foundationAnalysis v5
  latency          PL8
  errors           PL9
  normalization    PL10
  skills           PL11
  ability          PL13
```

For experiments without trusted ability intent:

```text
ability.status = not-requested
ability.observation = null
```

PL13 does not alter the internal contracts of PL8–PL11.

## 17. Checkpoint v3

Checkpoint v3 remains unchanged. PL13 adds no checkpoint ability state and no per-keystroke estimator state.

Interrupted sessions produce no ability observation until they are restored and validly completed.

## 18. Atomic session commit

The canonical completion input now contains:

```text
sessionSummary
skillEvidenceDeltas
abilityObservation | null
reviewItemChanges
updatedProfileSummary
clearCheckpoint
```

Before the write transaction, the repository validates the session and any eligible ability observation/identity relationship.

Inside one transaction it:

1. validates context ownership;
2. checks the existing `sessionId` summary boundary;
3. returns idempotent success for an identical already-completed summary;
4. rejects a conflicting duplicate;
5. loads/merges PL11 skill evidence;
6. if present, loads or creates the exact profile/context/channel ability state **inside the transaction**;
7. applies the PL13 recursive observation update;
8. validates and writes the merged ability state;
9. applies review/profile mutations;
10. writes the session summary;
11. clears the checkpoint;
12. updates reconciliation metadata.

Any invalid eligible ability observation or merged state aborts the whole transaction.

Ordinary `not-eligible` assessment has no observation and does not prevent session completion.

## 19. Exactly-once application

`sessionId` remains the commit idempotency boundary for both PL11 evidence and PL13 ability observations.

Duplicate detection occurs before skill or ability application. Therefore retrying an identical completed measurement cannot update ability twice.

PL13 does not add unbounded applied-session-ID history to ability state.

## 20. Retention

Existing bounded skill/review/session/quarantine retention remains.

Ability states are intentionally excluded from ordinary quota-recovery pruning in v1 because they are compact long-term estimates.

The 32-entry recent observation ring bounds ability-state audit history without requiring state deletion.

## 21. Reset and privacy

`resetPracticeData()` clears all Practice stores, now including `abilityStates`, plus the namespaced Practice manifest keys.

It does not call `localStorage.clear()` and does not touch gameplay/ranked/auth/cloud storage.

Durable PL13 state contains only compact measurement data and context/channel identity. It does not expand device/browser fingerprinting.

## 22. PL12 derived diagnostic layer remains separate

PL12 continues to consume canonical context-scoped `skillStats` plus prevalence reference/proxy data.

PL13 ability state does **not** alter PL12 candidates, weakness, impact, hierarchy, or priority in this phase.

No ability value is used to normalize away an entity limiter.

## 23. PL13 measurement chain

The canonical higher-level path is:

```text
session performance
      ↓
trusted channel + valid protocol?
      ↓
PL10 difficulty adjustment
      ↓
observation uncertainty
      ↓
robust recursive log-WPM update
      ↓
context/channel ability state
      ↓
95% model interval + SRC
```

One result is an observation, not the latent state itself.

## 24. Later-phase contract

- PL12 remains limiter phenotype/impact/hierarchy.
- **PL13** provides channel/context latent ability plus measurement uncertainty and neutral comparison primitives.
- PL14 may model control frontier and temporary state/readiness using ability plus innovations/session signals.
- PL15 owns mastery/automaticity.
- PL16 owns long-term learning trajectories and interpretation of ability comparisons.
- PL17 owns review semantics/scheduling value.
- PL18 may replace the PL13 v1 heuristic passage correction with empirical matched/equated form effects.
- PL25 may eventually combine limiter, ability, mastery, learning, review, treatment history, and user goals into Learning Value / Daily Coach.

PL13 does not populate `dashboardSummary.sustainableWpm`, `burstWpm`, or `controlledWpm` and adds no public ability UI.

The dedicated PL11 evidence model remains authoritative for entity measurement; the PL12 limiter model remains authoritative for diagnosis/impact; `PRACTICE_LAB_ABILITY_ESTIMATION.md` is authoritative for PL13 ability measurement, uncertainty, recursive estimation, interval/SRC, storage, and atomicity.
