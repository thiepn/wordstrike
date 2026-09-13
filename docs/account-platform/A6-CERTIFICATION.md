# A6 — Production Certification & Legacy Removal

**Consumer:** WORDSTRIKE  
**Date:** 2026-09-13  
**Branch:** `a6-production-certification`  
**Implementation state:** Implemented; certification validation in progress

## Final account contract

WORDSTRIKE uses the shared THIEPN Account Supabase project and canonical browser auth key:

`sb-hycegznamzjhwinegaai-auth-token`

The retired WORDSTRIKE auth prefix is:

`wordstrike_supabase_auth_v1`

A6 ends the migration period: WORDSTRIKE never copies the retired session, code verifier or user artifact into shared THIEPN Account storage. It performs targeted deletion of the retired auth artifacts only.

## A6 legacy inventory and disposition

| Legacy artifact | A6 disposition |
| --- | --- |
| `wordstrike_supabase_auth_v1` | Deleted; never promoted |
| `wordstrike_supabase_auth_v1-code-verifier` | Deleted; never promoted |
| `wordstrike_supabase_auth_v1-user` | Deleted; never promoted |
| `prepareSharedAuthStorage()` migration promotion | Removed |
| Shared THIEPN Account storage | Retained as the only persisted session authority |
| WORDSTRIKE game/progress data | Untouched |

No broad browser-storage wipe is used.

## Automated gates

`tests/thiepn-account-storage.test.js` verifies:

- Exact shared THIEPN Account storage-key contract.
- Exact retired WORDSTRIKE key contract.
- Targeted cleanup deletes all known retired auth artifacts.
- Existing canonical THIEPN Account state is preserved.
- Unrelated WORDSTRIKE application data is preserved.
- A retired WORDSTRIKE session by itself never creates a shared THIEPN Account session.

The existing Google auth diagnostic continues to verify the configured Supabase project/provider path and known redirect origins in CI.

## Production/manual certification matrix

These checks require a deployed production origin, real authentication provider, multiple browser contexts/devices, or destructive account operations and therefore are not marked passed by repository tests.

| Check | Status |
| --- | --- |
| Existing shared THIEPN Account restores in WORDSTRIKE | PENDING MANUAL |
| Existing pre-A6 player retains game/progress data | PENDING MANUAL |
| Google sign-in and callback | PENDING MANUAL |
| Email/password sign-in if exposed by the account UX | PENDING MANUAL |
| Sign-out propagates as expected across supported THIEPN apps/tabs | PENDING MANUAL |
| Expired/revoked session recovery | PENDING MANUAL |
| Offline vs signed-out state remains distinguishable | PENDING MANUAL |
| Multi-device password/security change behavior | PENDING MANUAL |
| Account deletion invalidates access and follows deletion policy | PENDING MANUAL |
| Chromium production smoke test | PENDING MANUAL |
| Firefox production smoke test | PENDING MANUAL |
| Safari/WebKit production smoke test | PENDING MANUAL |

## Security findings

### Resolved in A6

WORDSTRIKE previously promoted its retired app-specific Supabase session artifacts into the shared THIEPN Account key when the shared key was absent. That migration behavior created a second possible source of authentication truth after cutover. A6 removes promotion and retains only targeted legacy cleanup.

### Remaining validation

Real provider callbacks, revocation, account deletion and multi-device behavior require live production validation.

## Consumer rules

WORDSTRIKE may consume THIEPN Account identity and use the authenticated UUID for account-bound features. It must not reconstruct the central session from retired game-specific auth state, generate a canonical user ID, own passwords, or maintain a second canonical account/session.

## Verdict

**NOT CERTIFIED — automated CI and manual production validation must both complete.**

Do not change this verdict to `CERTIFIED` until every required automated gate is green and the applicable production/manual matrix has been executed with no unresolved critical/high finding.
