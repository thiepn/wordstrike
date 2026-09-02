# AR14 — Arcade Rush Production Cutover

## Status

This branch contains the production cutover implementation, but it must not be merged until the live AR13 ranked-shadow gate has been observed as certified in the target deployment.

Required live evidence before merge:

```js
wordstrikeArcadeRushShadow.inspect().status === "certified"
```

The exact pre-cutover shadow URL is:

```text
?dev=1&mode=arcade-rush&rushShadow=v1
```

Repository CI cannot manufacture that signal because it requires a real authenticated browser session and the actually deployed Supabase migration/functions.

## Public mode switch

After this branch is merged, the normal Mode Select order becomes:

1. Campaign
2. Typing Test
3. Endless
4. Arcade Rush
5. Practice Lab

Daily Strike remains registered and enabled temporarily but becomes hidden with status `retired-pending-removal`. Its code is intentionally retained until AR15/AR16 for rollback safety.

Arcade Rush becomes:

- enabled;
- visible;
- `status: available`;
- `route: arcade-rush-ready`;
- `storesProgress: true`.

## Public gameplay routing

The app router accepts the normal Arcade Rush ready route without requiring `dev=1`.

A public run:

- uses a fresh normal attempt seed;
- runs with `developerMode: false`;
- persists `runsStarted` through the AR13 coordinator;
- persists its terminal result through mode-data schema v2;
- shows the local Personal Best;
- uses the frozen rules-v1 result contract;
- prepares automatic global submission after the terminal result;
- submits only when the shared auth/profile eligibility rules permit it.

Developer-mode runs remain developer results and are not submitted by the production automatic-submission path. The explicit AR13 shadow coordinator remains present only as a diagnostic/rollback aid during the cutover window.

## Public leaderboard switch

The public leaderboard order becomes:

1. Campaign
2. Typing Test
3. Endless
4. Arcade Rush

The fourth tab is no longer conditional on a developer query.

Arcade Rush reads remain date-free:

```json
{"boardKey":"arcade-rush-v1"}
```

Ranking remains the AR10/AR12 frozen policy:

1. score descending;
2. accuracy descending;
3. active completion time ascending;
4. submission timestamp ascending.

Daily's board constant and server support are not deleted in AR14. Requests entering the frontend through a legacy Daily leaderboard selection are redirected to Arcade Rush. AR15 retires the Daily backend only after the new public board has operated successfully.

## OAuth return compatibility

A pre-cutover session-storage return target containing category `daily` is normalized to `arcade-rush` after cutover. This prevents a user returning from Google OAuth into a leaderboard tab that no longer exists publicly.

## Rollback boundary

AR14 is intentionally reversible before AR15/AR16:

- Daily gameplay modules remain in the bundle;
- Daily screens remain registered;
- Daily storage sidecar remains available;
- Daily backend remains intact;
- developer direct routing can still reach Daily for diagnostics.

A rollback can therefore restore the public visibility/order without reconstructing deleted systems.

## Certification

`tests/arcade-rush-production-cutover.test.js` certifies:

- exact public Mode Select order;
- Daily hidden / Rush public registry state;
- public leaderboard keyboard order;
- legacy Daily frontend request redirect to the date-free Rush board;
- legacy OAuth return normalization;
- public leaderboard markup contains Arcade Rush and no Daily tab;
- public app routing no longer requires developer mode;
- public Rush results enter the shared automatic submission path;
- the app adapter always enables viewing the Arcade Rush leaderboard.

The existing full repository suite remains mandatory before this PR may be considered merge-ready.

## Not in AR14

AR14 does not:

- delete Daily frontend modules;
- delete the Daily legacy storage sidecar;
- remove Daily Supabase validation/RPC support;
- alter Arcade Rush rules v1;
- claim browser gameplay is cheat-proof;
- bypass the live AR13 certification requirement.

Those retirement/removal steps remain AR15 and AR16.
