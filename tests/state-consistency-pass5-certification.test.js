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
assert.match(pending, /try \{[\s\S]*?submission = submit\(\);[\s\S]*?\} catch \(error\) \{[\s\S]*?submission = Promise\.reject\(error\);/);
assert.match(pending, /if \(generation !== lifecycleGeneration\) return state/);
assert.match(pending, /let activeUserId = null/);
assert.match(pending, /if \(activePromise === request\) \{[\s\S]*?activePromise = null;[\s\S]*?activeUserId = null/);
assert.match(pending, /const accountChanged = Boolean\(requestedUserId && requestedUserId !== activeUserId\)/);
assert.match(pending, /discard\(\) \{[\s\S]*?lifecycleGeneration \+= 1[\s\S]*?activePromise = null/);
assert.match(pending, /resetLifecycle\(\) \{[\s\S]*?lifecycleGeneration \+= 1[\s\S]*?activePromise = null/);

// Leaderboard selection owns request freshness. A stale A request must not be
// reused after A -> B -> A or delete the replacement A request in finally.
assert.match(leaderboard, /activeRequest\?\.requestId === requestSequence/);
assert.doesNotMatch(
  leaderboard.slice(
    leaderboard.indexOf("const activeRequest = inFlight.get(key)"),
    leaderboard.indexOf("const selection = getLeaderboardSelection(boardKey)"),
  ),
  /!force/,
);
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
assert.match(main, /const PENDING_RESULT_PROMPT_SCREENS = new Set\(\[[\s\S]*?Screens\.LEADERBOARDS[\s\S]*?\]\)/);
assert.doesNotMatch(
  main.slice(
    main.indexOf("const PENDING_RESULT_PROMPT_SCREENS"),
    main.indexOf("function pendingResultMayOwnNavigation"),
  ),
  /Screens\.(RESULTS|SPEED_TEST_RESULTS|ENDLESS_RESULTS|ARCADE_RUSH_RESULTS)/,
);
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
assert.match(
  main,
  /if \(authUiChanged\) \{[\s\S]*?clearSubmissionState\(\);[\s\S]*?resetLeaderboardState\(\);/,
);

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

// Async UI completions must remain owned by the surface/request that started them.
assert.match(
  main,
  /async function managePracticeData\(action\) \{[\s\S]*?const ownerScreen = appState\.screen;[\s\S]*?appState\.screen === ownerScreen[\s\S]*?unmountPracticeLab\(\)/,
);
assert.match(main, /let settingsSurfaceGeneration = 0/);
assert.match(
  main,
  /function openSettings\(\) \{[\s\S]*?settingsSurfaceGeneration \+= 1/,
);
assert.match(
  main,
  /surfaceGeneration !== settingsSurfaceGeneration[\s\S]*?querySelector\("#settings-account-management"\)/,
);
assert.match(
  main,
  /surfaceGeneration !== settingsSurfaceGeneration[\s\S]*?querySelector\("\.settings-practice-data"\)/,
);
assert.match(main, /let profileSurfaceGeneration = 0/);
assert.match(main, /let profileCopyRequestSequence = 0/);
assert.match(
  main,
  /surfaceGeneration !== profileSurfaceGeneration[\s\S]*?appState\.screen !== Screens\.PROFILE_STATS/,
);

const mainVersion = index.match(/src="js\/main\.js\?v=([^"]+)"/)?.[1];
assert.ok(mainVersion, "index must cache-bust main.js");
assert.ok(
  serviceWorker.includes(`"./js/main.js?v=${mainVersion}"`),
  "service worker must cache the same main.js version delivered by index.html",
);
assert.match(serviceWorker, /const CACHE_NAME = CACHE_PREFIX \+ "v\d+-[^"]+";/);
const mainAsset = `"./js/main.js?v=${mainVersion}"`;
assert.equal(
  serviceWorker.split(mainAsset).length - 1,
  2,
  "both APP_SHELL and required CORE_SHELL must use the current main.js version",
);

console.log("Pass 5 state-consistency certification passed: async generations, account ownership, forced-refresh single-flight, stale-result rejection, safe durable navigation, UI surface ownership, unified Flow entry, and required-shell cache alignment.");
