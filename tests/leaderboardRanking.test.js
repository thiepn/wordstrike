import assert from "node:assert/strict";
import {
  compareArcadeRushLeaderboardRows,
  compareEndlessLeaderboardRows,
  rankLeaderboardRows,
} from "../supabase/functions/_shared/leaderboardRead.js";

const row = (userId, overrides = {}) => ({
  id: `${userId}-1`, userId, username: `Player_${userId}`,
  boardKey: "endless-v1", rulesVersion: 1, moderationStatus: "accepted",
  stage: 10, score: 1000, wordsCompleted: 40, accuracy: 90,
  submittedAt: "2026-06-27T00:00:00.000Z",
  ...overrides,
});
const rows = [
  row("a", { stage: 12, id: "a-low" }),
  row("a", { stage: 18, id: "a-best" }),
  row("a", { stage: 15, id: "a-mid" }),
  row("b", { stage: 18, score: 900, username: "CasePreserved" }),
  row("c", { stage: 99, moderationStatus: "flagged" }),
  row("d", { stage: 98, moderationStatus: "removed" }),
  row("e", { stage: 97, username: null }),
  row("f", { stage: 96, rulesVersion: 2 }),
];
const endless = rankLeaderboardRows(rows, { boardKey: "endless-v1", viewerUserId: "b" });
assert.equal(endless.entries.length, 2);
assert.equal(endless.entries[0].stage, 18);
assert.equal(endless.entries[0].score, 1000);
assert.equal(endless.entries[1].username, "CasePreserved");
assert.equal(endless.viewer.rank, 2);
assert.equal("userId" in endless.entries[0], false);
assert.equal("userId" in endless.viewer.entry, false);
assert.ok(compareEndlessLeaderboardRows(row("a", { stage: 11 }), row("b", { stage: 10 })) < 0);

const rushBase = row("rush", {
  boardKey: "arcade-rush-v1", completed: true, score: 80_000,
  accuracy: 98, durationMs: 260_000, stage: null,
});
assert.ok(compareArcadeRushLeaderboardRows({ ...rushBase, score: 81_000 }, rushBase) < 0);
assert.ok(compareArcadeRushLeaderboardRows({ ...rushBase, accuracy: 99 }, rushBase) < 0);
assert.ok(compareArcadeRushLeaderboardRows({ ...rushBase, durationMs: 250_000 }, rushBase) < 0);
assert.ok(compareArcadeRushLeaderboardRows(rushBase, { ...rushBase, completed: false, score: 999_999 }) < 0);
const rush = rankLeaderboardRows([
  rushBase,
  { ...rushBase, id: "rush-better", userId: "rush", score: 90_000 },
  { ...rushBase, id: "rush-failed", userId: "failed", completed: false, score: 999_999 },
], { boardKey: "arcade-rush-v1", viewerUserId: "rush" });
assert.equal(rush.entries.length, 1);
assert.equal(rush.entries[0].score, 90_000);
assert.equal(rush.viewer.rank, 1);
assert.deepEqual(rankLeaderboardRows([rushBase], { boardKey: "daily-strike-v1" }), {
  entries: [], viewer: null,
});

const tied = [
  row("late", { id: "z", submittedAt: "2026-06-28T00:00:00.000Z" }),
  row("early-b", { id: "b" }),
  row("early-a", { id: "a" }),
];
assert.deepEqual(
  rankLeaderboardRows(tied, { boardKey: "endless-v1" }).entries.map(({ username }) => username),
  ["Player_early-a", "Player_early-b", "Player_late"],
);

const many = Array.from({ length: 130 }, (_, index) => row(`u${index}`, { stage: 130 - index }));
const limited = rankLeaderboardRows(many, { boardKey: "endless-v1", viewerUserId: "u120" });
assert.equal(limited.entries.length, 100);
assert.equal(limited.viewer.rank, 121);

console.log("Active Endless/Arcade Rush ranking preserves best-per-player, moderation, completion, top-100, viewer rank, and stable ties; retired Daily has no rank surface.");
