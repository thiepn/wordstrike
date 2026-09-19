# Practice storage integrity repair

## Reproduced failure

The public Daily Coach journey failed with `PRACTICE_STORAGE_QUOTA_EXCEEDED`, `stage=create-plan`, `operation=manifest-write`. The earlier localStorage patch allowed reads of an existing manifest but still required a localStorage write for a first or missing manifest. Tests of fabricated IndexedDB records did not cover this dependency.

The regression at commit `e68c8de25ebdb28cad9df171a4b8ce15a16e19fd` (Actions run `35468497712`) fills native browser localStorage, enters the real public UI, creates a five-minute plan, types the child session, completes it and reloads the same profile. Before this repair, the fresh-full case reproduces the reported quota error; the existing-full case passes. The filler keys simulate other applications sharing the origin and must remain untouched.

## Storage contract

Practice now uses a validated manifest record in its existing IndexedDB `meta` store:

```js
{ key: 'practiceManifest', formatVersion: 1, manifest: { /* existing manifest schema */ } }
```

No database version bump, database deletion or profile reset is used. Startup atomically imports a valid legacy primary/backup manifest, recovers a single existing valid profile when no active manifest survives, or creates one stable fresh identity. Multiple unselected profiles are an explicit recovery error, not permission to choose one arbitrarily or erase data.

After initialization, IndexedDB metadata is authoritative. `load()` reads its hydrated copy; `saveDurable()` commits an asynchronous, validated update before reporting success. localStorage is a best-effort compatibility mirror only. Its quota cannot stop canonical Practice initialization, preference writes, privacy toggles, plan creation or session completion. New callers must initialize the repository and await metadata mutations; they must not directly write legacy localStorage manifests.

The metadata writer merges changed settings against the latest stored record, preserving independent edits from another tab. Repository metadata reads are refreshed from the hydrated manifest, avoiding stale cached settings being resurrected during session completion.

## Related corrections

- Daily Coach uses normal canonical initialization; the speculative legacy-reconciliation bypass has been removed.
- The initial Coach-plan read and write remain in a single transaction. A failed transaction is not followed by an unconditional put that could overwrite another tab's frozen plan.
- IndexedDB request and transaction-completion rejections are both observed, avoiding a second unhandled promise rejection on genuine database failures.
- Quota detection follows nested causes with a cycle/depth bound and preserves meaningful errors.
- Physical-key telemetry opt-in and opt-out await durable metadata saves; a later session commit does not resurrect a stale preference.
- The offline shell includes the new module (service-worker cache v21). No user records or another application's localStorage entries are removed to create space.

## Verification

`tests/practice-durable-manifest.test.js` exercises fresh initialization at zero writable localStorage, primary/backup import, existing-profile recovery, ambiguous identity handling, durable settings and telemetry preferences, session completion, simultaneous initializers, immutable daily plans, multi-writer preference merging, and real save-failure reporting.

`tests/browser/practice_quota_journey.mjs` uses the actual public UI at saturated native localStorage for fresh and existing profiles, including typing, successful completion, parent-plan reconciliation and persistence after reload.

`tests/browser/storage_native.mjs` uses two real browser pages and the real IndexedDB implementation for simultaneous initialization/plan creation, unique-index violations, atomic rollback, independent settings updates and absence of unhandled rejections.

Existing all-drill and assessment/protocol browser tests support `PRACTICE_FULL_STORAGE=1`. Storage Integrity CI runs these checks in Chromium, Firefox and WebKit, alongside the complete repository unit suite and content/privacy/migration checks. The production job compares the deployed storage assets byte-for-byte before repeating the full-quota Coach journey against the live URL.

The checks use isolated browser contexts; they do not access a user's existing browser profile. Phone-sized WebKit is browser emulation, not physical-device or assistive-technology certification. Actual failure of IndexedDB or the device's storage must still produce an explicit failure rather than a false saved state.

## Compatibility and recovery

Existing manifests and IndexedDB progress are retained. Cached tabs should be closed/reopened to load the new module set. Do not clear site data as an update step. Reverting to a pre-repair application would remove durable-metadata support; a rollback must preserve/read the `meta.practiceManifest` record rather than assume the legacy localStorage mirror is current.

This repair addresses Practice's dependence on localStorage, not the ability of every other application on the shared origin to store unlimited data. It introduces no account synchronization or network upload of Practice data.
