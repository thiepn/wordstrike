# WORDSTRIKE — THIEPN Account Platform Cutover

## Scope

A5 migrates WORDSTRIKE's account boundary onto the shared THIEPN Account SDK/platform contract without changing gameplay, leaderboard ownership, realtime behavior, or local player data.

Pinned contract:

- Account SDK: `1.2.0`
- Platform: `1.0.0`
- source SHA: `124221f39a932d50f9a86ad5c3da2d8fd1fe50af`
- app id: `wordstrike`
- canonical session key: `sb-hycegznamzjhwinegaai-auth-token`

The SDK is vendored locally at `js/vendor/thiepnAccountSdk.js`; WORDSTRIKE never runtime-loads mutable account code from another site.

## Architecture

`supabase-js` remains WORDSTRIKE's OAuth, session-refresh, leaderboard, RPC, and realtime client. This preserves the existing browser-native implicit OAuth callback behavior and the data APIs already certified by the game.

The shared account-platform layer owns the cross-app contract:

- canonical shared session storage
- legacy same-project session migration
- session mirroring after Supabase restores or changes auth state
- A4 app-activity metadata
- A3 AAL/MFA handoff state
- ecosystem/platform version pins

The integration seam is `js/thiepnAccount.js`. Gameplay and leaderboard modules do not import the vendored SDK directly.

## Startup and session restoration

Before the Supabase client restores a session, the adapter promotes the old WORDSTRIKE same-project key into the canonical shared key when needed.

After Supabase returns a valid session, `authService` mirrors it through the account adapter. If a deliberately minimal test/mock session cannot satisfy the full shared SDK schema, WORDSTRIKE still treats Supabase as the authority for the local auth state and simply skips platform metadata work.

A transient `null` auth event does not erase the canonical session. The shared session is cleared only when:

- Supabase reports an actual `SIGNED_OUT` event; or
- the authoritative initialization `getSession()` result is empty; or
- local sign-out succeeds.

This avoids creating an OAuth callback race.

## Platform activity

After a real authenticated session is adopted, WORDSTRIKE calls:

```js
recordAppActivity({ appId: "wordstrike" })
```

The marker is best-effort and once-per-user per page lifetime. Failure to update ecosystem metadata never blocks gameplay, local records, leaderboards, or sign-in.

The live A4 database RLS remains authoritative: the activity row must belong to `auth.uid()`, the target app must be active, and it must have a versioned platform manifest.

## MFA handoff

WORDSTRIKE exposes account handoff state through `getAuthAccountHandoffState()`.

For a signed-in account with a verified second factor but an `aal1` session, the handoff state reports `requiresAdditionalVerification: true`. WORDSTRIKE does not pretend to upgrade the session itself and does not weaken the account's MFA policy.

A5 does **not** yet require AAL2 for WORDSTRIKE leaderboard/data rows. That remains deferred until the ecosystem intentionally adopts restrictive app-data AAL2 policies. Current gameplay and leaderboard behavior therefore remains compatible with A3's staged rollout.

## Data boundary

Shared THIEPN Account identity does not make WORDSTRIKE data globally readable.

WORDSTRIKE keeps ownership of:

- leaderboard profile rows
- submissions/scores
- game-specific online state
- local save/statistics data

The A4 platform receives only account/app connection metadata. It does not receive WORDSTRIKE scores, local statistics, gameplay history, or leaderboard records.

## Sign-out

WORDSTRIKE keeps local-browser sign-out semantics:

```text
scope = local
```

On successful sign-out, the account-platform session mirror is cleared as well. Local gameplay saves and statistics are not deleted.

## Release contract

Permanent A5 checks:

```bash
npm run check:account-platform
npm run audit:account-platform
```

The normal `npm test` runner automatically includes `tests/thiepn-account-platform.test.js`.

The cutover is not release-ready unless the repository's existing full validation/CI suite also passes on the exact candidate SHA. An inherited pre-existing visual baseline failure must be reported as inherited rather than silently reclassified as an A5 success or an A5 regression.
