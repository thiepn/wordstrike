# Account and progress reliability repair

## Root causes addressed

- Auth listeners invoked profile/network consumers synchronously inside the SDK's auth callback. Consumers now run on a later task; stale session reads cannot override newer auth events, and recoverable errors retain an existing session.
- Browser authentication depended on a third-party script CDN and the SDK's implicit storage fallback. The existing pinned SDK is vendored with npm integrity verification. Shared canonical persistent storage is explicit; there are no copied/backup refresh tokens and no silent in-memory login fallback.
- Campaign, placement and mode statistics had no private cloud-save table. Game writes now go through an account-scoped localStorage/IndexedDB store before a separate retryable cloud loop.
- Results hover handlers rebuilt entire screens. Selection now changes classes in place. Data-only screen refreshes preserve scroll, expanded details, result tabs and text editing state, without repeated scroll timers.
- The moving-word renderer lacked a distinct next-character element. Campaign and Endless now share an explicit typed prefix, inverse next-character highlight, caret and active/candidate outline.

## Storage contract

Canonical local documents are `wordstrike.player-profile.v1:<owner>`, independently mirrored in IndexedDB (`wordstrike-player-profiles`, store `profiles`). Legacy raw saves are preserved and imported once. The old storage APIs project the current document rather than maintaining another mutable source of truth.

Campaign bests and placement use high-water merges. Aggregate counters use per-runtime writer components; retrying the same upload cannot add a run again. Pre-migration totals are conservatively max-merged because the old aggregates do not establish which runs overlap. Detailed recent-session history retains the application's existing bounded history; this is not an unlimited keystroke archive.

Reset epochs prevent old snapshots resurrecting deliberately reset data. Account A is never copied into account B or the signed-out guest. Guest adoption is consumed once, including across stale open tabs. Auth tokens remain only in the SDK's shared canonical storage; IndexedDB progress recovery never restores revoked tokens.

Cloud writes use `wordstrike_player_profiles` and revision compare-and-swap, with owner binding checked after each asynchronous operation. Offline work remains playable and locally saved. A failed upload stays pending; the UI does not falsely report it as cloud-saved.

## Backend

Applied migrations:
- `20260922222007_wordstrike_private_player_profiles.sql`
- `20260922222424_wordstrike_profile_minimal_grants.sql`

The table has RLS on SELECT/INSERT/UPDATE/DELETE and ownership predicates in both UPDATE USING and WITH CHECK. Anonymous/PUBLIC grants are revoked. Authenticated users have only these four table privileges, not TRUNCATE/TRIGGER/REFERENCES. The document is size-limited and schema-tagged. No privileged SECURITY DEFINER function or service key is required.

A rollback-only production RLS verification passed: owner CRUD, cross-account SELECT/UPDATE/DELETE isolation, cross-owner INSERT denial, and ownership-reassignment denial. No test records or users were retained.

## Regression gates

- `tests/account-lifecycle-reliability.test.js`: stale auth reads/events, deferred notifications, transient failures, retryable initialization, quota handling, real logout semantics, public-profile races.
- `tests/player-profile-reliability.test.js`: local reload, account isolation, stale guest tabs, CRDT counter semantics, resets, placement migration, normalization, failed acknowledgements, concurrent devices, writes during upload.
- `tests/browser/account_progress_reliability.py`: real vendored SDK with hermetic HTTP fixtures, OAuth callback, refresh, full browser restart, actual UI completion handlers, IndexedDB quota recovery, cloud retry/restore, typing feedback and scroll preservation.
- Existing Campaign and non-Practice browser suites plus the repository's complete JavaScript test suite remain part of validation.

Browser fixtures never contact Google or live profile endpoints. Interactive Google consent, provider revocation policy and a particular user's browser storage permissions cannot be certified by mocked endpoints. Normal reloads, tab reopening and access-token expiry should not require another Google sign-in. Explicit logout, revoked credentials, clearing site storage, or provider security requirements may legitimately require authentication again.

Do not clear site data to install this repair: doing so would remove unsynced progress and the login session. The bumped service-worker cache updates code without deleting application storage.
