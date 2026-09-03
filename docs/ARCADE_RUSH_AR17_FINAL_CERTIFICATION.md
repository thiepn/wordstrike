# AR17 — Arcade Rush Final Certification

## Scope

AR17 is the final release-certification phase for the Arcade Rush replacement program. It does not introduce a new game mode, rebalance gameplay, redesign UI, or change leaderboard rules. Its purpose is to verify that the post-AR16 production tree is internally coherent from browser navigation through local persistence and public leaderboard validation.

Release baseline entering AR17:

- Arcade Rush is the permanent short-form score-attack mode.
- Daily Strike has been retired from the active frontend and active public leaderboard contract.
- Arcade Rush rules version 1 is frozen.
- The public application remains local-first; online accounts and leaderboards are optional.

## Frozen Arcade Rush contract

The certified v1 identity is:

- mode ID: `arcade-rush`
- public route: `arcade-rush-ready`
- rules version: `1`
- rules status: `FROZEN_V1`
- generator version: `1`
- generator profile: `FROZEN_V1`
- six normal waves
- 168 planned normal targets
- five persistent Core Integrity
- Core Breaker final boss
- Core Breaker version: `1`
- Core Breaker HP: `8`
- authored target run duration: `300000 ms`
- boss target duration: `45000 ms`
- global board: `arcade-rush-v1`
- global ranking requires a completed run and final-boss defeat
- retries are not calendar-scoped and use a new normal attempt seed

The frozen normal-wave target counts are:

1. Ignition — 23
2. Acceleration — 27
3. Crossfire — 29
4. Heavy Words — 25
5. Overdrive — 31
6. Critical — 33

The AR17 gate cross-checks these frozen values. It deliberately does not duplicate AR2's deterministic 1000-seed generator simulation or AR10's balance simulation; those remain separate, existing certification gates in the full test suite.

## Final public modes

The final registered/public mode order is:

1. Campaign
2. Typing Test
3. Endless
4. Arcade Rush
5. Practice Lab

Practice Lab remains registered but disabled/coming-soon under its existing feature architecture. Daily Strike is no longer a mode ID, mode definition, app screen, state domain, runtime route, renderer, or onboarding flow.

## Local persistence

Mode persistence remains schema version 2 under `wordstrike_mode_data_v2`.

The final schema contains Arcade Rush records and no Daily mode object. Legacy v1 data is normalized into the current schema; legacy Daily mode summaries and Daily recent-session entries are discarded rather than exposed in the active application. The obsolete `wordstrike_daily_legacy_v1` sidecar is removed on mode-data load when storage access permits it.

AR17 certifies:

- Arcade Rush run-start accounting for normal runs;
- developer runs do not alter production records;
- terminal result persistence is deduplicated by session ID;
- completed runs update Arcade Rush records;
- profile/statistics snapshots expose Arcade Rush and no Daily section.

## Final public leaderboard contract

The active server board set is exactly:

1. `campaign-highest-level-v1`
2. `typing-60s-english200-v1`
3. `typing-15s-english200-v1`
4. `endless-v1`
5. `arcade-rush-v1`

`daily-strike-v1` is not a supported public read or submission board.

The client retains narrow compatibility aliases so old stored/navigation state does not strand a user:

- legacy board key `daily-strike-v1` resolves to the Arcade Rush leaderboard;
- legacy return category `daily` resolves to Arcade Rush.

These are redirects only. They do not restore a Daily leaderboard or Daily gameplay surface.

## Backend retirement boundary

AR15 remains the authoritative backend-retirement phase. AR17 verifies that its boundary still holds after frontend deletion:

- the Daily board retirement migration marks the board inactive and invisible;
- the migration does not destructively delete historical board or submission rows;
- current public board allowlists exclude Daily;
- current request validation rejects Daily reads and submissions;
- edge entrypoints import the current shared wrappers, not the historical Daily validator directly;
- historical migrations and `scoreSubmissionLegacyDaily.js` remain in the repository for compatibility/history.

The current `scoreSubmission.js` wrapper still delegates shared non-Daily validation logic through the historical module after hard-rejecting the retired Daily board. AR17 treats that as an implementation-history dependency, not as an active Daily product surface.

## Isolation boundary

The pure `js/arcadeRush/` subsystem remains isolated from application state, persistence, leaderboard services, Supabase, and Daily code. Browser-specific integration continues through `js/arcadeRushAppController.js`.

`main.js` must not directly import pure Arcade Rush implementation modules. This keeps runtime/browser adapters outside the deterministic subsystem and preserves the architecture established in AR1 and AR7.

## Certification gates

AR17 is complete only when all of the following are true:

1. `tests/arcade-rush-final-certification.test.js` passes.
2. The repository's complete `npm test` suite passes on the AR17 pull request.
3. The AR17 pull request is merged into `main` without changing the certified contract after CI.
4. The post-merge `main` Tests workflow succeeds at the merge commit.
5. GitHub Pages successfully deploys the same merge commit.

The permanent AR17 test covers the cross-layer release contract: registry/navigation, frozen Arcade Rush constants, persistence/statistics, client and server leaderboard contracts, Daily retirement, subsystem isolation, and repository deployment wiring.

## Deployment identity

Canonical production URL:

`https://thiepn.dev/wordstrike/`

The repository test workflow continues to run on pull requests and pushes to `main`; Pages deployment after the AR17 merge is the final production deployment gate.

## Explicit non-claims

AR17 certification does not by itself claim:

- a manual interactive browser playthrough was performed;
- every browser/device combination was manually tested;
- a new Supabase migration was deployed during AR17;
- gameplay attestation or anti-cheat was added;
- unrelated architecture debt outside the Arcade Rush replacement program was eliminated.

Those claims require separate evidence. AR17 certifies the repository and deployment contracts described above.
