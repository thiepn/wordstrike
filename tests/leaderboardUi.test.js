import assert from "node:assert/strict";

const app = {
  html: "",
  set innerHTML(value) { this.html = value; },
};
globalThis.document = { querySelector: (selector) => selector === "#app" ? app : null };
const { renderLeaderboards } = await import("../js/leaderboardUi.js");
const authOut = { status: "signed-out" };
const profileNone = { status: "idle", profile: null };

// A raw pre-cutover Daily return state must never recreate retired public tabs.
// Normal application state resolves legacy Daily through the service before rendering.
renderLeaderboards({ status: "loading", selectedBoard: "daily-strike-v1", entries: [] }, authOut, profileNone);
assert.match(app.html, /GLOBAL LEADERBOARDS/);
assert.doesNotMatch(app.html, /leaderboard-select-arcade-rush/);
assert.doesNotMatch(app.html, />ARCADE RUSH</);
assert.doesNotMatch(app.html, />DAILY STRIKE</);
assert.match(app.html, /ENDLESS/);
assert.match(app.html, /Loading global rankings/);

// Direct historical Rush board reads remain renderable without restoring a public Rush tab.
renderLeaderboards({
  status: "empty",
  selectedBoard: "arcade-rush-v1",
  selectedCategory: "arcade-rush",
  board: { boardKey: "arcade-rush-v1", rulesVersion: 1 },
  entries: [], viewer: null,
}, authOut, profileNone);
assert.match(app.html, /LEGACY BOARD \/\/ RETIRED MODE \/\/ ALL-TIME/);
assert.match(app.html, /No ranked Arcade Rush results yet/);
assert.match(app.html, /SIGN IN FOR GLOBAL RANKS/);
assert.match(app.html, /CONTINUE WITH GOOGLE/);
assert.doesNotMatch(app.html, /leaderboard-select-arcade-rush/);
assert.doesNotMatch(app.html, />ARCADE RUSH</);
assert.doesNotMatch(app.html, /Daily Strike|UTC CHALLENGE/i);

renderLeaderboards({
  status: "empty", selectedBoard: "endless-v1", entries: [], viewer: null,
}, authOut, profileNone);
assert.match(app.html, /No ranked Endless results yet/);
assert.match(app.html, /STANDARD ENDLESS/);
assert.doesNotMatch(app.html, /RULES VERSION|SEASON|PREVIOUS RULES/);

renderLeaderboards({ status: "offline", selectedBoard: "arcade-rush-v1", selectedCategory: "arcade-rush", entries: [] }, authOut, profileNone);
assert.match(app.html, /unavailable while offline/);
assert.match(app.html, /Local gameplay and records are unaffected/);
renderLeaderboards({ status: "error", selectedBoard: "arcade-rush-v1", selectedCategory: "arcade-rush", entries: [] }, authOut, profileNone);
assert.match(app.html, /Unable to load global rankings/);
assert.match(app.html, /leaderboard-refresh[^>]*>RETRY/);

const authIn = {
  status: "signed-in",
  user: { email: "private@example.com", user_metadata: { full_name: "Private Name" } },
  session: { access_token: "private-token" },
};
const profileReady = { status: "ready", profile: { username: "ViewerName" } };
renderLeaderboards({
  status: "ready",
  selectedBoard: "endless-v1",
  entries: [
    { rank: 1, username: "<script>alert(1)</script>", stage: 20, score: 50000, accuracy: 97, durationMs: 1000 },
    { rank: 2, username: "ViewerName", stage: 18, score: 42500, accuracy: 96.4, durationMs: 2000 },
  ],
  viewer: { rank: 2, entry: { username: "ViewerName", stage: 18, score: 42500, accuracy: 96.4 } },
}, authIn, profileReady);
assert.doesNotMatch(app.html, /<script>alert/);
assert.match(app.html, /&lt;script&gt;/);
assert.match(app.html, /viewer-row/);
assert.match(app.html, /aria-label="Your leaderboard rank"/);
assert.match(app.html, />YOU</);
assert.doesNotMatch(app.html, /private@example\.com|Private Name|private-token/);

renderLeaderboards({
  status: "ready", selectedBoard: "endless-v1", entries: [],
  viewer: { rank: 284, entry: { username: "ViewerName", stage: 18, score: 42500, accuracy: 96.4 } },
}, authIn, profileReady);
assert.match(app.html, /YOUR RANK/);
assert.match(app.html, /#284/);

renderLeaderboards(
  { status: "empty", selectedBoard: "endless-v1", entries: [], viewer: null },
  authIn,
  { status: "needs-username", profile: null },
);
assert.match(app.html, /Choose a public username to submit scores/);
assert.match(app.html, /SET USERNAME/);

console.log("Leaderboards screen keeps only Campaign/Typing/Endless public tabs while retaining direct legacy Rush board rendering, loading, empty, offline, error, safe rows, and viewer rank.");
