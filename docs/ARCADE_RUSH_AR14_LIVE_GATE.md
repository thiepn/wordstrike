# AR14 Live Gate

This file records the only blocker preventing the prepared AR14 cutover PR from being merged.

## Required evidence

On the deployed WORDSTRIKE site, while signed in with a valid public leaderboard username, complete a successful run from:

```text
?dev=1&mode=arcade-rush&rushShadow=v1
```

Then inspect:

```js
wordstrikeArcadeRushShadow.inspect()
```

The merge gate is satisfied only if the returned snapshot has:

```js
status === "certified"
```

and the individual gates for canonical result, local persistence, server submission, and leaderboard readback are all `true`.

## Why CI is insufficient

Repository CI verifies client/server contract compatibility but cannot authenticate as a real end user or prove that the target Supabase project currently has the checked-in AR12 migration and Edge Functions deployed.

## Current repository state

AR13 repository certification and Pages deployment passed before this AR14 branch was created. AR14 remains intentionally unmerged until the live signal above is independently observed.
