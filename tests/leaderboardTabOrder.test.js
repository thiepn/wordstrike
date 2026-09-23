import assert from "node:assert/strict";
import { createLeaderboardService, LEADERBOARD_BOARDS } from "../js/leaderboardService.js";

const app = { html: "", set innerHTML(value) { this.html = value; } };
globalThis.document = { querySelector: () => app };
const { renderLeaderboards } = await import("../js/leaderboardUi.js");
renderLeaderboards({ status: "loading", selectedCategory: "campaign", selectedTypingDuration: 60, selectedBoardKey: LEADERBOARD_BOARDS.CAMPAIGN, entries: [] }, { status: "signed-out" }, {});
const labels = [...app.html.matchAll(/data-action="leaderboard-select-[^"]+"[^>]*>([^<]+)/g)].map((match) => match[1]);
assert.deepEqual(labels, ["CAMPAIGN", "TYPING TEST", "ENDLESS", "FLOW"]);

const calls = [];
const client = { functions: { invoke(_name, { body }) { calls.push(body); return Promise.resolve({ data: { ok: true, data: { board: {}, entries: [] } } }); } } };
const service = createLeaderboardService({ getClient: () => client });
await service.initializeLeaderboards();
assert.equal(calls[0].boardKey, LEADERBOARD_BOARDS.CAMPAIGN);
await service.selectLeaderboardCategory("typing");
assert.equal(calls[1].boardKey, LEADERBOARD_BOARDS.TYPING_60);
await service.selectTypingDuration(15);
assert.equal(calls[2].boardKey, LEADERBOARD_BOARDS.TYPING_15);
assert.equal(service.getLeaderboardState().selectedTypingDuration, 15);
await service.selectLeaderboardCategory("flow");
assert.equal(calls[3].boardKey, LEADERBOARD_BOARDS.FLOW_STANDARD);
await service.selectFlowLength("quick");
assert.equal(calls[4].boardKey, LEADERBOARD_BOARDS.FLOW_QUICK);
assert.equal(service.getLeaderboardState().selectedFlowLength, "quick");

console.log("Public leaderboard tabs use the Campaign/Typing/Endless order after Rush retirement, with Campaign default and independent Typing durations.");
