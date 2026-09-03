import assert from "node:assert/strict";
import {
  createLeaderboardService,
  EXPECTED_LEADERBOARD_RULES_VERSIONS,
  getLeaderboardKeyboardTarget,
  isLeaderboardCacheStateCurrent,
  LEADERBOARD_BOARDS,
} from "../js/leaderboardService.js";

const LEGACY_DAILY_BOARD_KEY = "daily-strike-v1";
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const calls = [];
const pending = [];
const client = { functions: { invoke(name, options) {
  calls.push({ name, options });
  const request = deferred();
  pending.push(request);
  return request.promise;
} } };
const service = createLeaderboardService({
  getClient: () => client,
  getDateKey: () => "2026-06-27",
  now: (() => { let value = 1000; return () => ++value; })(),
});
assert.equal(service.getLeaderboardState().status, "idle");
assert.equal(calls.length, 0);
const campaignRequest = service.initializeLeaderboards();
assert.equal(service.getLeaderboardState().selectedBoard, LEADERBOARD_BOARDS.CAMPAIGN);
assert.deepEqual(calls[0], {
  name: "get-leaderboard",
  options: { body: { boardKey: "campaign-highest-level-v1" } },
});
assert.equal(service.initializeLeaderboards(), campaignRequest);
const endlessRequest = service.selectLeaderboardBoard(LEADERBOARD_BOARDS.ENDLESS);
assert.deepEqual(calls[1].options.body, { boardKey: "endless-v1" });
pending[0].resolve({ data: { ok: true, data: { board: {}, entries: [{ rank: 1, username: "Stale" }], viewer: null } } });
await campaignRequest;
assert.equal(service.getLeaderboardState().selectedBoard, LEADERBOARD_BOARDS.ENDLESS);
assert.equal(service.getLeaderboardState().entries.some(({ username }) => username === "Stale"), false);
pending[1].resolve({ data: { ok: true, data: {
  board: { boardKey: "endless-v1", displayName: "Endless", rulesVersion: 1 },
  entries: [{ rank: 1, username: "Winner", stage: 20, score: 50000, accuracy: 96 }],
  viewer: { rank: 284, entry: { username: "Viewer", stage: 18, score: 42500, accuracy: 96.4 } },
} } });
await endlessRequest;
assert.equal(service.getLeaderboardState().status, "ready");
assert.equal(service.getLeaderboardState().viewer.rank, 284);
const refresh = service.refreshLeaderboard();
assert.equal(calls.length, 3);
assert.equal(service.refreshLeaderboard(), refresh);
assert.equal(calls.length, 3);
pending[2].resolve({ data: { ok: true, data: { board: {}, entries: [], viewer: null } } });
await refresh;
assert.equal(service.getLeaderboardState().status, "empty");

const offline = createLeaderboardService({ getClient: () => null });
assert.equal((await offline.initializeLeaderboards()).status, "offline");
const localData = { bestScore: 123 };
offline.resetLeaderboardState();
assert.deepEqual(localData, { bestScore: 123 });

assert.deepEqual(EXPECTED_LEADERBOARD_RULES_VERSIONS, {
  "campaign-highest-level-v1": 1,
  "typing-60s-english200-v1": 1,
  "typing-15s-english200-v1": 1,
  "endless-v1": 1,
  "arcade-rush-v1": 1,
});

for (const requestedBoardKey of [
  LEADERBOARD_BOARDS.CAMPAIGN,
  LEADERBOARD_BOARDS.ENDLESS,
  LEGACY_DAILY_BOARD_KEY,
  LEADERBOARD_BOARDS.ARCADE_RUSH,
]) {
  const effectiveBoardKey = requestedBoardKey === LEGACY_DAILY_BOARD_KEY
    ? LEADERBOARD_BOARDS.ARCADE_RUSH
    : requestedBoardKey;
  assert.equal(isLeaderboardCacheStateCurrent(effectiveBoardKey, {
    board: { boardKey: effectiveBoardKey, rulesVersion: 2 },
  }), false);
  let fetches = 0;
  const rollbackService = createLeaderboardService({
    getDateKey: () => "2026-06-27",
    getClient: () => ({ functions: { invoke: async () => {
      fetches += 1;
      return { data: { ok: true, data: {
        board: { boardKey: effectiveBoardKey, displayName: "Board", rulesVersion: fetches === 1 ? 2 : 1 },
        entries: fetches === 1 ? [] : [{ rank: 1, username: "Restored", score: 1 }],
        viewer: null,
      } } };
    } } }),
  });
  assert.equal((await rollbackService.initializeLeaderboards(requestedBoardKey)).status, "empty");
  assert.equal((await rollbackService.initializeLeaderboards(requestedBoardKey)).status, "ready");
  assert.equal(fetches, 2, `${requestedBoardKey} must refetch a cached version-2 response`);
}

let typingFetches = 0;
const typingCacheService = createLeaderboardService({
  getClient: () => ({ functions: { invoke: async () => {
    typingFetches += 1;
    return { data: { ok: true, data: {
      board: { boardKey: LEADERBOARD_BOARDS.TYPING_60, displayName: "Typing", rulesVersion: 1 },
      entries: [], viewer: null,
    } } };
  } } }),
});
await typingCacheService.initializeLeaderboards(LEADERBOARD_BOARDS.TYPING_60);
await typingCacheService.initializeLeaderboards(LEADERBOARD_BOARDS.TYPING_60);
assert.equal(typingFetches, 1, "valid Typing version-1 cache remains reusable");

const rushCalls = [];
const rushService = createLeaderboardService({
  getDateKey: () => {
    throw new Error("Arcade Rush must not request a Daily date");
  },
  getClient: () => ({ functions: { invoke: async (_name, { body }) => {
    rushCalls.push(body);
    return { data: { ok: true, data: {
      board: { boardKey: LEADERBOARD_BOARDS.ARCADE_RUSH, displayName: "Arcade Rush", rulesVersion: 1 },
      entries: [{ rank: 1, username: "Rusher", score: 90000, accuracy: 99, durationMs: 250000, completed: true }],
      viewer: null,
    } } };
  } } }),
});
// Legacy pre-cutover Daily selections still redirect safely to the public Rush board.
await rushService.selectLeaderboardBoard(LEGACY_DAILY_BOARD_KEY);
assert.deepEqual(rushCalls, [{ boardKey: LEADERBOARD_BOARDS.ARCADE_RUSH }]);
assert.equal(rushService.getLeaderboardState().selectedBoardKey, LEADERBOARD_BOARDS.ARCADE_RUSH);
assert.equal(rushService.getLeaderboardState().selectedCategory, "arcade-rush");
assert.equal(rushService.getLeaderboardState().entries[0].durationMs, 250000);
assert.equal(
  getLeaderboardKeyboardTarget({ selectedBoardKey: LEADERBOARD_BOARDS.ENDLESS }, "ArrowRight"),
  LEADERBOARD_BOARDS.ARCADE_RUSH,
);
assert.equal(
  getLeaderboardKeyboardTarget({ selectedBoardKey: LEADERBOARD_BOARDS.CAMPAIGN }, "End"),
  LEADERBOARD_BOARDS.ARCADE_RUSH,
);

console.log("Leaderboard service is lazy, stale-safe, rules-versioned, and redirects legacy Daily selections to Arcade Rush without a current Daily board.");
