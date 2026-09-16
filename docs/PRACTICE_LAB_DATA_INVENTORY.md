# Practice Lab Data Inventory — PL39

Status: certification inventory for the `pl39-privacy-security-integrity` branch.

## Version state

PL39 intentionally adds no Practice database or record-version bump. The verified current envelope is:

- IndexedDB schema: **DB 12**
- Session Summary: **v14**
- Foundation analysis: **v10**
- Coach Plan: **v2**
- Treatment Episode / Treatment Response State: **v1**
- Physical Telemetry Stat / Session Marker: **v1**
- Research Enrollment / Assignment / Analysis State: **v1**
- Canonical Practice stores: **23**

The source of truth for this inventory is `js/practiceLab/practiceDataInventory.js`, combined with `practiceConstants.js` / `practiceConstantsV31.js` / `practiceConstantsV30.js` for keys and indexes.

## Sensitivity classes

| Class | Meaning |
|---|---|
| A | User-authored private content |
| B | High-sensitivity local telemetry |
| C | Protected measurement content |
| D | Derived/model data |
| E | Orchestration and study data |
| F | Session/recovery metadata |
| G | Static public or structural data |

Only `customTexts.sourceText` is authorized to persist raw user-authored text. No Practice store is authorized for external network upload.

## Store inventory

| Store | Owner / purpose | Key | Important indexes | Scope | Ver. | Sens. | Raw content | Network | Prunable | Reset | Explicit delete |
|---|---|---|---|---|---:|---|---|---|---|---|---|
| `meta` | storage-foundation | `key` | none | global | — | G | no | no | no | reinitialize | database reset |
| `profiles` | profile-context | `profileId` | `updatedAt` | profile | 3 | E | no | no | no | reinitialize | profile delete or full wipe |
| `contexts` | profile-context | `contextId` | `profileId`, `updatedAt`, `lastUsedAt`, unique `profileFingerprint` | profile + context | 1 | E | no | no | no | reinitialize | context/profile delete |
| `skillStats` | skill-evidence | `statId` | profile/context/entity/priority/confidence/mastery; unique `profileContextEntity` | profile + context | 3 | D | no | no | yes | clear | subsystem |
| `abilityStates` | ability | `abilityStateId` | profile/context/channel/updated; unique `profileContextChannel` | profile + context | 1 | D | no | no | no | clear | subsystem |
| `performanceStates` | performance | `performanceStateId` | profile/context/updated; unique `profileContext` | profile + context | 1 | D | no | no | no | clear | subsystem |
| `learningStates` | learning | `learningStateId` | profile/context/entity/updated; unique `statId`, `profileContextEntity` | profile + context | 1 | D | no | no | yes | clear | subsystem |
| `evaluationStates` | protected-evaluation | `evaluationStateId` | unique `profileId`, `updatedAt` | profile | 1 | E | no | no | no | clear with conservative history marker | reset/profile delete |
| `assessmentRuns` | assessment | `assessmentRunId` | profile/context/status/depth/start/completion/`profileStatus` | profile + context | 1 | E | no | no | yes | clear | subsystem |
| `coachPlans` | daily-coach | `coachPlanId` | profile/context/day/status/updated; unique `profileContextDay` | profile + context | 2 | E | no | no | yes | clear | subsystem |
| `sessionSummaries` | session-engine | `sessionId` | profile/context/experiment/start/completion/status/day/Coach; `profileContextCompletedAt`; Research assignment | profile + context | 14 | F | no | no | yes | clear | subsystem |
| `reviewItems` | retention-review | `reviewItemId` | profile/context/due/state/entity; unique `profileContextEntity` | profile + context | 3 | D | no | no | yes | clear | subsystem |
| `customTexts` | custom-text | `customTextId` | `profileId`, `updatedAt`, `createdAt` | profile | 1 | A | **yes, only `sourceText`** | no | no | **preserve** | explicit Custom Text delete or full wipe |
| `presets` | practice-presets | `presetId` | profile/experiment/updated | profile | 1 | E | no | no | no | clear | subsystem |
| `activeSessionCheckpoints` | session-engine | `profileId` | unique `sessionId`, `expiresAt` | profile + context | 3 | F | no | no | yes | clear | subsystem |
| `quarantine` | storage-recovery | `quarantineId` | `sourceStore`, `detectedAt` | recovery metadata | 1 | F | no | no | yes | clear | retention/full wipe |
| `treatmentEpisodes` | treatment-response | `treatmentEpisodeId` | unique treatment session; profile/context/status/family/target/outcome/completion | profile + context | 1 | E | no | no | yes | clear | subsystem |
| `treatmentResponseStates` | treatment-response | `treatmentResponseStateId` | profile/context/family/outcome/delay/updated | profile + context | 1 | D | no | no | yes | clear | subsystem |
| `physicalTelemetryStats` | physical-telemetry | `physicalTelemetryStatId` | profile/context/entity/updated/`profileContextEntityType` | profile + context | 1 | B | no | no | yes | clear | telemetry clear/reset/profile delete |
| `physicalTelemetrySessions` | physical-telemetry | `sessionId` | profile/context/status/completion/applied/`profileCompletedAt` | profile + context | 1 | B | no | no | yes | clear | telemetry clear/reset/profile delete |
| `researchEnrollments` | research | `researchEnrollmentId` | profile/context/status/study/updated; unique `profileContextStudyVersion` | profile + context | 1 | E | no | no | no | clear | research delete/reset/profile delete |
| `researchAssignments` | research | `researchAssignmentId` | enrollment/profile/context/status/target/day/created; unique `enrollmentSequence` | profile + context | 1 | E | no | no | yes | clear | research delete/reset/profile delete |
| `researchAnalysisStates` | research | `researchAnalysisStateId` | unique enrollment; profile/context/study/updated | profile + context | 1 | E | no | no | yes | clear | research delete/reset/profile delete |

## Privacy boundary

Practice storage is local browser storage. The certified Practice modules do not import Supabase or leaderboard modules and do not transmit Practice records to external services. The repository as a whole still contains non-Practice networking code for other WordStrike features; PL39 does not claim the entire WordStrike origin is network-free.

Reviewed Practice `fetch()` usage is limited to same-origin static asset loaders. Runtime browser tests additionally intercept requests and verify that Custom Text sentinels, protected-content sentinels, and XSS payloads do not appear in URLs, request bodies, or request headers.

## Reset semantics

A normal Practice reset is **active-profile scoped**. It clears active-profile derived/session/orchestration data while preserving saved `customTexts` and leaving other profiles untouched. Because a reset destroys the evidence needed to prove prior protected-content exposure history, the active profile receives an `evaluationStates` marker with `historyStatus: "partial"`; reset must never recreate a falsely cold/complete exposure history.

An explicit full user-content wipe remains globally destructive across all 23 Practice stores, including Custom Text.

## Raw-content rule

Persisted raw text is limited to `customTexts.sourceText`. Session summaries, skill evidence, Coach plans, treatment records, telemetry records, Research records, protected evaluation state, checkpoints, and derived models must not contain raw passage text, raw key sequences, wrong-text captures, event traces, or similar raw-content fields.

The PL39 integrity auditor and browser sentinel tests enforce this boundary.
