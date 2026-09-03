# Practice Lab Context Identity — PL5

## Canonical boundary

PL5 changes the identity hierarchy for adaptive Practice evidence from **profile → entity** to **profile → context → evidence**. Fine-grained skill, review, session, and checkpoint evidence is never aggregated across contexts by default.

## Context schema

A context is a local-only IndexedDB record with: `contextId`, `profileId`, `recordVersion`, timestamps, `dataLocale`, `keyboardLayout`, `inputMethod`, nullable `hardwareProfileId`, and deterministic `fingerprint`.

`inputMethod` is limited to `unknown`, `physical`, or `software`. Historical data is always migrated as `unknown`; PL5 does not infer input method from user agent, touch support, screen dimensions, or any other heuristic.

## Fingerprint

Fingerprint semantics are explicitly versioned by `PRACTICE_CONTEXT_FINGERPRINT_VERSION = 1`. Components are conservatively normalized and encoded into a deterministic versioned fingerprint. Mutable display labels are not identity.

A profile owns at most one context for each `profileId + fingerprint` pair through the unique `contexts.profileFingerprint` index.

## Default context

Every profile has a deterministic default context ID derived only from its `profileId`. The default context uses the profile's existing `dataLocale` and `keyboardLayout` preferences, plus `inputMethod: unknown` and `hardwareProfileId: null`. It does not depend on the clock or browser locale.

`profile.dataLocale`, `profile.keyboardLayout`, and `settings.keyboardLayout` remain defaults/preferences. They are **not** the identity of persisted evidence. Persisted context-sensitive evidence uses `contextId`.

## Versions

- IndexedDB structural version: 2
- context: 1
- profile: 3
- skillStat: 2
- sessionSummary: 2
- reviewItem: 2
- checkpoint: 2
- customText, preset, quarantine: unchanged

## Database v2

The new `contexts` store is keyed by `contextId` and indexed by `profileId`, `updatedAt`, `lastUsedAt`, and unique `[profileId, fingerprint]`.

The obsolete unique `profileEntity` indexes are removed from `skillStats` and `reviewItems`. They are replaced by non-unique `contextId` and unique `profileContextEntity = [profileId, contextId, entityType, entityKey]`. `sessionSummaries` gains a `contextId` index. Unknown stores are not removed during version upgrade.

## Migration and backfill

Record migration is sequential and validation-backed. Profile v2 receives its deterministic `activeContextId`. Contextless skill, session, review, and checkpoint records receive that default context. Skill-stat primary keys are recomputed from `profileId + contextId + entityType + entityKey`.

Storage initialization performs a bounded PL5 reconciliation before declaring migration complete. It ensures every profile has a valid active context, creates a missing deterministic default context from profile defaults, migrates bounded context-sensitive stores, verifies ownership, replaces old skill-stat keys, and writes the completion marker only after successful reconciliation.

If both a legacy skill record and a canonical v2 record resolve to the same new key, equivalent duplicates collapse to the canonical record. If they contain independent evidence that PL5 cannot safely combine, the legacy record is quarantined and the canonical record is preserved. PL5 does not invent timing/counter merge formulas.

## Ownership and session propagation

A context belongs to exactly one profile. Repository writes reject profile/context mismatches. Active-context switching changes only future selection and never rewrites historical records or a resumable checkpoint.

A Practice session receives a resolved `profileId` and `contextId` at construction. Both are immutable session identity. The context is propagated to checkpoints, summaries, analyzer skill updates, and review updates. Atomic completion rejects mixed-context writes and verifies the checkpoint context before clearing it.

Checkpoint restore uses the checkpoint's historical context. Missing/corrupt context identity produces a recoverable restore failure; restore never substitutes today's active context.

## Privacy and isolation

Contexts and all Practice evidence remain local-only. PL5 does not connect Practice to `wordstrike_save`, ranked Typing Test, Campaign, Endless, Daily Strike, leaderboards, authentication, access tokens, Supabase, or cloud sync.

## Future context creation

PL5 exposes internal repository APIs for deliberate context creation and active-context switching. Equivalent normalized context definitions reuse one canonical record. PL5 never creates contexts per page load, browser session, keyboard event, locale event, or user-agent change.

A future setup/input adapter may deliberately create `physical` or `software` contexts and may later introduce explicit hardware profiles. Those features must use the existing `contextId` boundary rather than changing historical identity.

## Explicit non-goals

PL5 does not implement physical/software auto-detection, a context selector, hardware keyboard profiles, multilingual corpora, weakness/ability models, Coach logic, adaptive experiments, assessment UI, advanced telemetry, leaderboards, or cloud sync.
