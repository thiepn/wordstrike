# Practice Lab PL39 — Privacy, Security & Data Integrity Certification

**Branch:** `pl39-privacy-security-integrity`  
**Certification status:** **PASS**  
**Public release state:** Practice remains disabled by default (`PRACTICE_LAB_PUBLIC_ENABLED = false`).

## Scope

PL39 is an adversarial certification phase. It introduces no public Practice feature and no database/record-version bump. Its purpose is to verify and harden the existing Practice system across local privacy, persistence integrity, authority boundaries, cross-profile isolation, migrations, concurrency, failure recovery, protected content, physical telemetry, Research, and browser behavior.

Verified version envelope:

- Practice IndexedDB schema: DB 12
- Session Summary: v14
- Foundation analysis: v10
- Coach Plan: v2
- Treatment records: v1
- Physical telemetry records: v1
- Research records: v1
- Canonical Practice stores: 23

The complete store-by-store contract is documented in `PRACTICE_LAB_DATA_INVENTORY.md`.

## Certification methodology

PL39 combines five independent evidence layers:

1. **Static source/security audit** — scans every `js/practiceLab/**/*.js` file for forbidden execution APIs, unexpected networking, external subsystem imports, console sinks, dangerous DOM sinks, and privacy-language overclaims. Reviewed `innerHTML` sites are pinned by exact file/count so a new sink cannot inherit approval silently.
2. **Migration harness** — constructs every supported IndexedDB starting version from DB1 through DB12 and verifies the resulting current stores, keys, indexes, obsolete-index removal, and retained representative data. Session Summary migrations are exercised from every version 1–13 through v14.
3. **Focused adversarial unit/integration tests** — serializer failures, private/protected sentinels, reset semantics, trusted-authority forgery, cross-profile direct-ID attacks, telemetry lifecycle/privacy, Research timing/deletion/randomization, failure injection, and genuine overlapping async operations.
4. **Browser E2E privacy/security harness** — real Chromium execution with XSS payloads, Custom Text sentinels, request interception, URL/history checks, Cache Storage/service-worker checks, console capture, and persisted-store inspection.
5. **Regression certification** — sensitive PL31–PL38 subsystem suites followed by the complete WordStrike test suite.

A PL39 PASS requires all five layers to be green on the certification branch. That condition was met by workflow run `34842413372`.

## Privacy and network boundary

Practice data is stored in browser-local Practice storage. The certified Practice modules do not import Supabase or leaderboard modules and do not authorize external upload for any of the 23 Practice stores. Reviewed `fetch()` use is restricted to same-origin static Practice asset loaders.

This statement is intentionally bounded: WordStrike contains non-Practice features that can use networking. PL39 does not claim that the entire WordStrike origin or browser is network-free, anonymous, unhackable, or incapable of disclosure under a compromised same-origin environment.

Only `customTexts.sourceText` is permitted to persist raw user-authored content. Derived Practice stores reject raw passage text, wrong-text captures, event traces, raw keystrokes, ordered physical events, and equivalent raw-content fields. Protected evaluation/research material is represented by bounded identifiers, hashes, roles, outcomes, and aggregate evidence rather than persisted passage text.

The browser harness additionally verifies that private/XSS sentinels do not appear in request URLs, bodies, headers, browser history, caches, service-worker registrations, or console output.

## DOM/XSS review

The source audit blocks dynamic evaluation (`eval`, `new Function`, string timers), `document.write`, `srcdoc`, unreviewed HTML sinks, XHR, beacon/WebSocket/EventSource, background clipboard read, WebHID, and WebUSB inside Practice modules.

All existing Practice `innerHTML` assignments are individually reviewed and pinned by expected occurrence count. Custom Text graphemes use safe text assignment; protected/Real Text rendering paths escape controlled content before reviewed markup composition. Browser E2E exercises script, image-event, SVG-event, `javascript:` URL, textarea-breakout/script, and style payloads as literal content and verifies no execution.

## Persistence serializer

Every canonical Practice write passes `assertPracticeSerializable`. The contract rejects:

- `undefined`
- `NaN`, positive/negative infinity
- functions, symbols, bigint
- cyclic references
- non-plain/DOM-like objects
- excessive nesting

Both memory and IndexedDB store write paths enforce the contract. Historical/corrupt records remain readable enough for audit/recovery rather than being silently deleted.

A PL39 concurrency test exposed one real Research defect: assignment `eligibilitySnapshot` explicitly stored `assignedArm: undefined`. The Research assignment builder was corrected to omit undefined/authority-only fields before persistence.

## Profile/context isolation

Direct-ID ownership is enforced at the active Practice profile/context boundary. Adversarial A-vs-B tests inject otherwise-valid foreign records directly into storage and then attempt access through public repository surfaces.

The minimum PL39 isolation matrix covers:

- `customTexts` — foreign raw ID read/delete denied
- `coachPlans` — foreign raw ID read/delete denied
- `treatmentEpisodes` — foreign raw ID read denied and writes scope-checked
- `physicalTelemetryStats` — production scoped facade denies foreign raw stat ID
- `researchEnrollments` — foreign raw ID denied
- `researchAssignments` — foreign raw ID denied

Foreign records are verified unchanged after the attempted access.

Physical telemetry is scope-bound in both production construction paths: live session persistence and the diagnostics/view runtime. Research repository operations use an active scope provider in production.

## Reset and deletion semantics

A normal Practice reset is active-profile scoped. It:

- clears the active profile's derived/session/orchestration records,
- preserves saved Custom Text,
- preserves other profiles and their contexts/evidence,
- clears reconciliation markers,
- recreates protected evaluation state conservatively with `historyStatus: "partial"`.

The partial-history marker is security-critical: after destructive history loss the system cannot claim a protected passage is known to be cold/unseen. Strict cold verification therefore remains ineligible after reset.

An explicit full user-content wipe remains destructive across all 23 Practice stores, including Custom Text.

## Trusted authority boundary

Normal user-supplied session configuration cannot create or forge measurement/research/orchestration authority. The central trusted guard rejects fields controlling ability, performance, evaluation, retention, Assessment, Coach, Research, protected evaluation, and Treatment bindings, as well as Research-plan target authority.

Rejection occurs before public session preparation mutates lifecycle state, using bounded error code `PRACTICE_SESSION_TRUSTED_CONFIGURATION_REJECTED`.

## Physical keyboard telemetry

PL39 verifies that physical telemetry is:

- disabled by default,
- eligible only for physical keyboard contexts,
- excluded from Custom Text and protected/Research roles,
- aggregate-only in persistence,
- free of `event.key`, raw ordered key sequences, and raw event timestamps,
- listener-safe across 100 repeated start/stop cycles.

The telemetry scoped repository prevents active profile/context callers from resolving foreign telemetry session/stat IDs.

## Research integrity

Research certification covers explicit consent, deterministic cryptographic randomization, target selection before arm allocation, protected diagnostic probes, follow-up timing, conservative clock rollback handling, expiry on large forward jumps, contamination classification, deletion/cleanup behavior, and local persistence boundaries.

Assignment persistence is profile/context scoped. Simultaneous creation of the same assignment is transactionally idempotent; simultaneous reservation of the same probe phase allows only one session binding and rejects the competing reservation with `PRACTICE_RESEARCH_SESSION_CONFLICT`.

## Concurrency and atomicity

PL39 adds genuine overlapping async tests rather than sequential simulations:

- two simultaneous `complete()` calls for one Practice session leave exactly one canonical Session Summary and one completed-session profile side effect,
- two simultaneous Daily Coach plan creations for the same profile/context/day leave one canonical plan,
- two simultaneous Research assignment writes consume the assignment slot once and two competing probe reservations produce one winner,
- two simultaneous Custom Text updates at the same expected revision produce one successful revision and one conflict without text loss.

During this work the in-memory Practice store was found to allow overlapping transactions to clone the same snapshot and overwrite one another. Its transaction execution is now serialized, matching IndexedDB's atomic same-store transaction semantics closely enough for deterministic concurrency certification and preventing lost-update behavior in the test/runtime memory store.

## Failure injection and recovery

Focused failure tests cover:

- IndexedDB unavailable,
- transaction rollback,
- quota/write failure while preserving previously saved Custom Text,
- corrupt Custom Text degradation without silent auto-deletion,
- clock rollback and large forward jumps for Research timing.

Failures are explicit and bounded; persistence is not reported as successful when the underlying operation fails.

## Migration evidence

The migration harness verifies every supported database starting version **1 through 12** against DB12. It checks current store/key/index structure, creates the later Custom Text/Treatment/Telemetry/Research stores at the appropriate upgrade boundaries, removes obsolete indexes, and confirms no unexpected representative-record loss.

Session Summary record migration is tested from versions **1 through 13** to v14 without mutating source fixtures.

Migration gate: **PASS** in workflow run `34842413372`, certification job `103970205823`.

## Browser evidence

Browser privacy/XSS/network/cache certification: **PASS** in workflow run `34842413372`, browser job `103970205478`.

The real Chromium harness verified Custom Text/private sentinel containment, protected-content containment, XSS literal rendering/non-execution, no Practice mutation requests, no sentinel leakage in requests or navigation state, no cache/service-worker leakage, and no console leak.

## Defects found and repaired

| Severity | Defect | Resolution |
|---|---|---|
| Critical | Normal reset could erase protected exposure history and allow recreated state to appear fully fresh/cold. | Reset now persists conservative `historyStatus: "partial"`; strict cold verification fails closed. |
| High | Normal reset was globally destructive across profiles and saved user content. | Reset is active-profile scoped and preserves Custom Text plus foreign profiles. |
| High | User configuration could reach trusted measurement/orchestration authority surfaces. | Central trusted-configuration guard rejects authority fields before lifecycle mutation. |
| High | Several raw-ID repository paths could return Treatment/Research/Coach/telemetry records without active ownership enforcement. | Active profile/context scope guards added and adversarial A/B tests introduced. |
| High | Memory-store overlapping transactions could commit stale snapshots/lost updates. | Transactions serialized through a queue; race tests cover canonical winners. |
| Medium | Research assignment snapshot wrote an explicit `undefined` field incompatible with the canonical serializer. | Undefined/authority-only snapshot fields are omitted before persistence. |
| Medium | Routine fallback logging could create a data sink. | Production Practice is silent unless an explicit bounded logger is injected. |
| Medium | Research privacy UI wording could overstate device guarantees. | Copy is bounded to what WordStrike Practice itself does; static scan rejects known overclaims. |
| Medium | Persistence previously lacked a centralized canonical-serializability guard. | Memory/IndexedDB writes enforce the strict serializer. |

## Residual risks and limits

PL39 does not attempt to defend against a fully compromised browser, malicious extension with sufficient privileges, compromised same-origin script, operating-system compromise, or direct user modification of browser storage. IndexedDB durability/quota behavior remains browser-controlled. Local data can also be lost through browser/site-data clearing.

Static sink auditing reduces accidental expansion of attack surface but does not replace future review when new rendering/network code is introduced. Any new Practice HTML sink or network path must be explicitly reviewed rather than inheriting this certification.

Non-Practice WordStrike modules have separate networking responsibilities; PL39 only certifies the Practice subsystem boundary.

## Final gate evidence

Workflow run **`34842413372`** validated commit `81b8e86d0511778aaa702bc87e4f85ea7e5286ae` with both jobs green:

- Certification job **`103970205823`** — PASS
  - static privacy/security + DOM/network/privacy-wording audit
  - DB1–DB12 and record migration harness
  - focused PL39 integrity suite
  - PL31–PL38 sensitive subsystem regressions
  - full WordStrike regression suite
  - final source-audit enforcement
- Browser privacy job **`103970205478`** — PASS
  - real Chromium privacy, XSS, network, URL, history, cache, service-worker, console, and storage checks

The immediately preceding post-fix code run `34842322928` was also fully green (`certify` job `103969916024`; `browser-privacy` job `103969916278`).

Public Practice feature gate: **OFF**.

### Final decision

**PL39 — PASS.** The Privacy, Security & Data Integrity certification matrix is green on the PL39 branch. This certification does not enable Practice publicly and does not merge the branch into `main`.
