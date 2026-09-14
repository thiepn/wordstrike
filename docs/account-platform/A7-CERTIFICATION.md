# A7 — Operations, Observability & Recovery

**Consumer:** WORDSTRIKE  
**Operations contract:** A7.1  
**Implementation state:** implemented on `a7-operations-observability-recovery`; certification in progress

## Operational behavior

- Local campaign/test/endless/arcade progress remains independent from THIEPN Account availability.
- Online leaderboard/profile functions return `X-Request-ID` for operator/user correlation.
- Edge Function logs are structured and restricted to service/action/board/status/duration/correlation metadata.
- Logs do not include bearer tokens, user IDs, usernames, score payloads or submitted typing metrics.
- Existing authentication and origin validation remain authoritative.
- Existing score-submission idempotency/session-ID behavior and the 30 submissions/hour backend limit are preserved.

## Live service boundary

`leaderboard_profiles` and leaderboard result tables remain inaccessible for direct anonymous/authenticated mutation. Public/profile/score behavior continues through the reviewed Edge Function + service-role RPC layer.

## Degraded mode

WORDSTRIKE's degraded contract is `local-gameplay`: account/profile/leaderboard failure may disable online features but must not erase or block local gameplay/progress.

## Automated coverage

`tests/operations-a7.test.js` verifies status taxonomy, bounded incoming request-ID acceptance and response correlation headers without credential material. The existing full WORDSTRIKE Node/browser suites remain required.

## Certification matrix

| Check | Status |
| --- | --- |
| Edge correlation IDs | PASS by implementation |
| Structured redacted logs | PASS by implementation |
| Existing backend rate limit preserved | PASS existing contract |
| Direct client database-write path absent | PASS existing A6 audit |
| Operations helper tests | PENDING A7 PR CI |
| Full Node/browser regressions | PENDING A7 PR CI |
| Updated Edge Functions deployed | PENDING after branch CI |
| Production shell synthetic check | PENDING central A7 monitor |
| Real signed-in profile/score smoke | MANUAL REQUIRED |

## Verdict

**NOT CERTIFIED — branch CI, updated Edge Function deployment, central synthetic monitoring and signed-in production smoke must complete.**
