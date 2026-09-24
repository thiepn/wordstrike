import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [
  main,
  pending,
  leaderboard,
  profile,
  outbox,
  index,
  serviceWorker,
] = await Promise.all([
  read("../js/main.js"),
  read("../js/pendingResultCoordinator.js"),
  read("../js/leaderboardService.js"),
  read("../js/leaderboardProfileService.js"),
  read("../js/submissionOutboxCoordinator.js"),
  read("../index.html"),
  read("../sw.js"),
]);

// Durable pending-result work must have an explicit lifecycle generation.
// Reset/discard detach the old promise, and old continuations are inert.
assert.match(pending, /let lifecycleGeneration = 0/);
assert.match(pending, /const generation = lifecycleGeneration/);
assert.match(pending, /if \(generation !== lifecycleGeneration\) return state/);
assert.match(pending, /if \(activePromise === request\) activePromise = null/);
assert.match(pending, /discard\(\) \{[\s\S]*?lifecycleGeneration \+= 1[\s\S]*?activePromise = null/);
assert.match(pending, /resetLifecycle\(\) \{[\s\S]*?lifecycleGeneration \+= 1[\s\S]*?activePromise = null/);

// Leaderboard selection owns request freshness. A stale A request must not be
// reused after A -> B -> A or delete the replacement A request in finally.
assert.match(leaderboard, /activeRequest\?\.requestId === requestSequence/);
assert.match(leaderboard, /inFlight\.set\(key, \{ requestId, promise \}\)/);
assert.match(leaderboard, /if \(inFlight\.get\(key\)\?\.promise === promise\) inFlight\.delete\(key\)/);
assert.match(leaderboard, /inFlight\.get\(requestKey\(boardKey\)\)\?\.promise/);

// Public username operations are owned by both account and request sequence.
assert.match(profile, /let requestSequence = 0/);
assert.match(profile, /activeUserId !== userId \|\| requestId !== requestSequence/);
assert.match(profile, /resetLeaderboardProfile\(\) \{[\s\S]*?requestSequence \+= 1/);
assert.match(profile, /const checking = state\.status === "checking"/);
assert.match(profile, /status: checking \? \(state\.profile \? "ready" : "needs-username"\)/);

// Outbox drains are account-owned. Account switches/sign-out invalidate old
// drains, and stale finalizers cannot clear a replacement drain.
assert.match(outbox, /let activeUserId = null/);
assert.match(outbox, /let generation = 0/);
assert.match(outbox, /if \(userId && activeUserId === userId\) return activePromise/);
assert.match(outbox, /generation \+= 1;[\s\S]*?activePromise = null;[\s\S]*?activeUserId = null/);
assert.match(outbox, /const isCurrent = \(\) => generation === runGeneration && activeUserId === userId/);
assert.match(outbox, /if \(activePromise === request\) \{[\s\S]*?activePromise = null;[\s\S]*?activeUserId = null/);

// Background durable-submission callbacks may only own navigation on explicit
// result/account surfaces, never active gameplay or Flow.
assert.match(main, /const PENDING_RESULT_PROMPT_SCREENS = new Set\(\[/);
assert.match(main, /wordstrikeFlowPhase1\?\.isActive\?\.\(\) !== true/);
assert.match(main, /appState\.screen === Screens\.SETTINGS\)[\s\S]*?openLeaderboardBoard\(intent\.boardKey/);
assert.doesNotMatch(
  main.slice(
    main.indexOf("const pendingResultCoordinator"),
    main.indexOf("async function resumeDurableSubmissions"),
  ),
  /onSuccess:[\s\S]*?if \(bootstrapReady\) openLeaderboardBoard/,
);

// An await between account snapshots and outbox drain must be followed by a
// fresh auth/profile read.
assert.match(main, /await pendingResultCoordinator\.evaluate\(authState, profileState\);[\s\S]*?const latestAuthState = getAuthState\(\);[\s\S]*?const latestProfileState = getLeaderboardProfileState\(\);/);
assert.match(main, /submissionOutboxCoordinator\.drain\(latestAuthState, latestProfileState/);

// Late runtime callbacks cannot reopen a previous run's results.
assert.match(main, /state !== getCurrentSpeedTest\(\)[\s\S]*?appState\.screen !== Screens\.SPEED_TEST_RUN/);
assert.match(main, /game !== appState\.game[\s\S]*?appState\.screen !== Screens\.PLAYING/);
assert.match(main, /session\?\.id !== result\.sessionId/);
assert.match(main, /function finishLevel\(game, success\) \{[\s\S]*?game !== appState\.game \|\| appState\.screen !== Screens\.PLAYING/);

// Flow keyboard activation must enter through the exact same capture-phase
// release button path used by pointer activation.
assert.match(main, /route === "flow-release"/);
assert.match(main, /querySelector\('button\[data-mode-id="flow"\]'\)/);
assert.match(main, /flowEntry\.click\(\)/);

const mainVersion = index.match(/src="js\/main\.js\?v=([^"]+)"/)?.[1];
assert.ok(mainVersion, "index must cache-bust main.js");
assert.ok(
  serviceWorker.includes(`"./js/main.js?v=${mainVersion}"`),
  "service worker must cache the same main.js version delivered by index.html",
);
assert.match(serviceWorker, /v81-state-consistency-pass5/);

console.log("Pass 5 state-consistency certification passed: async generations, account ownership, stale-result rejection, safe durable navigation, unified Flow entry, and cache alignment.");
