# AR13 — Arcade Rush Shadow Certification

AR13 adds an explicit pre-cutover path for exercising Arcade Rush with the same local-record and leaderboard eligibility semantics that production will use, while keeping Arcade Rush hidden from ordinary users and leaving Daily Strike public.

## Ranked shadow route

Use the exact query:

```text
?dev=1&mode=arcade-rush&rushShadow=v1
```

All three components are required. Ordinary `?dev=1&mode=arcade-rush` remains the developer preview and does not become ranked.

### Developer preview vs ranked shadow

| Property | Ordinary developer preview | Ranked shadow |
| --- | --- | --- |
| Public mode selector | Hidden | Hidden |
| `developerMode` in Rush result | `true` | `false` |
| Local Rush records | Excluded | Enabled |
| Global submission eligibility | Excluded | Enabled for canonical success |
| Debug `rushSeed` | Allowed | Ignored |
| Retry seed | Normal attempt seed unless debug override | Fresh normal attempt seed |
| Rush leaderboard | Shadow/dev UI available | Shadow/dev UI available |

The ranked shadow path deliberately uses a fresh normal attempt seed even if `rushSeed` is present. A chosen debug seed must never become a ranked certification result.

## Certification gates

`createArcadeRushShadowCertificationSnapshot()` evaluates the following gates:

1. **Explicit shadow route** — the exact ranked-shadow query is active.
2. **Production isolation** — Daily Strike remains in the public mode list and Arcade Rush remains hidden.
3. **Canonical ranked result** — rules/contract v1, successful six-wave run, Core Breaker defeated, non-developer result, `recordEligible: true`.
4. **Run-start persistence** — Arcade Rush `runsStarted` was successfully persisted.
5. **Result persistence** — the terminal SessionResult was successfully persisted through mode-data schema v2.
6. **Server submission** — `arcade-rush-v1` submission returned `submitted` or `already-submitted` for the exact session.
7. **Leaderboard readback** — the date-free rules-v1 Rush board loaded successfully and returned a viewer rank.

Only when every gate is true is the status `certified`.

Other diagnostic states include `awaiting-result`, `run-failed`, `awaiting-submission`, `awaiting-readback`, `blocked`, and `failed`.

## Browser diagnostic

The diagnostic API exists only on the explicit ranked-shadow route:

```js
wordstrikeArcadeRushShadow.inspect()
```

After a successful run, it returns the current certification snapshot.

To force a new leaderboard readback after the backend has been deployed:

```js
await wordstrikeArcadeRushShadow.verifyLeaderboard()
```

A successful live gate ends with:

```text
status: "certified"
```

and every value in `gates` equal to `true`.

## Live shadow procedure

Before using this as an AR14 cutover signal, the target Supabase project must have the AR12 backend deployed:

- migration `20260902170000_add_arcade_rush_leaderboard_v1.sql` applied;
- current `submit-score` Edge Function deployed;
- current `get-leaderboard` Edge Function deployed.

Then:

1. Open WORDSTRIKE with `?dev=1&mode=arcade-rush&rushShadow=v1`.
2. Be online and signed into the leaderboard account with a valid public username.
3. Complete all six waves and defeat Core Breaker.
4. Inspect `wordstrikeArcadeRushShadow.inspect()`.
5. If submission has completed but readback has not refreshed, run `await wordstrikeArcadeRushShadow.verifyLeaderboard()`.
6. Require `status: "certified"` before treating the live backend path as proven.

A failed gameplay run is intentionally not globally submitted because the Arcade Rush board ranks completed boss clears only.

## CI certification vs live certification

Repository CI certifies the complete contract without contacting the live Supabase project:

- ranked-shadow query gating;
- debug-seed suppression;
- production mode isolation;
- AR8 local run/result persistence and duplicate protection;
- AR11 payload construction;
- AR12 server validation/recomputation;
- date-free Rush request validation;
- best-per-player Rush ranking and viewer readback shape;
- final AR13 certification-state evaluation.

CI therefore proves that the checked-in components agree with one another. It does **not** prove that a particular Supabase project has had the migration and Edge Functions deployed, nor does it manufacture an authenticated end-user browser session.

## Cutover boundary

AR13 does not:

- expose Arcade Rush in the public mode selector;
- remove Daily Strike;
- remove Daily storage compatibility;
- disable the Daily backend;
- change rules v1;
- add gameplay attestation.

Those production changes remain outside this phase. AR14 should proceed only after the repository gate is green and the live ranked-shadow diagnostic has been observed as `certified` in the target environment.
