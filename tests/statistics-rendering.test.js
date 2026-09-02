import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDefaultModeData } from "../js/modeStorage.js";
import { getStatisticsSnapshot } from "../js/statistics.js";

class Node {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.onclick = null;
  }
  focus() {}
  select() {}
}

const app = {
  html: "",
  nodes: [],
  set innerHTML(value) {
    this.html = value;
    this.nodes = [
      ...[...value.matchAll(/data-stats-tab="(\d+)"/g)].map((match) => new Node({ statsTab: match[1] })),
      ...[...value.matchAll(/data-recent-filter="([^"]+)"/g)].map((match) => new Node({ recentFilter: match[1] })),
      ...[...value.matchAll(/data-stats-action="([^"]+)"/g)].map((match) => new Node({ statsAction: match[1] })),
    ];
  },
  querySelectorAll(selector) {
    if (selector === "[data-stats-tab]") return this.nodes.filter((node) => node.dataset.statsTab);
    if (selector === "[data-recent-filter]") return this.nodes.filter((node) => node.dataset.recentFilter);
    return [];
  },
  querySelector(selector) {
    const action = selector.match(/data-stats-action="([^"]+)"/)?.[1];
    if (action) return this.nodes.find((node) => node.dataset.statsAction === action) || null;
    if (selector === "#profile-name-input") return new Node();
    return null;
  },
};
globalThis.document = {
  querySelector(selector) {
    return selector === "#app" ? app : null;
  },
};

const { renderProfileStatistics, STATISTICS_TABS } = await import("../js/statisticsUi.js");
const storage = createDefaultModeData();
storage.profile = {
  playerId: `ws_${"a".repeat(80)}`,
  displayName: "Player",
  createdAt: 1000,
  updatedAt: 1000,
  profileVersion: 1,
};
let snapshot = getStatisticsSnapshot(storage, {
  currentFurthestLevel: 1,
  levels: {},
});

renderProfileStatistics({ snapshot, storage, activeTab: 0 }, {});
assert.equal((app.html.match(/data-stats-tab=/g) || []).length, 7);
for (const tab of STATISTICS_TABS) assert.match(app.html, new RegExp(tab));
assert.deepEqual(STATISTICS_TABS, [
  "OVERVIEW", "CAMPAIGN", "TYPING TEST", "ENDLESS", "ARCADE RUSH", "RECENT", "PROFILE",
]);
assert.match(app.html, /PLAY A MODE TO BUILD YOUR STATISTICS/);
assert.match(app.html, /ARCADE RUSH BEST/);
assert.doesNotMatch(app.html, /DAILY STREAK|DAILY STRIKE/);
assert.match(app.html, /data-active-tab="OVERVIEW"/);
assert.doesNotMatch(app.html, /NO CAMPAIGN LEVELS COMPLETED/);
assert.doesNotMatch(app.html, /NaN|undefined|Invalid Date/);

renderProfileStatistics({ snapshot, storage, activeTab: 1 }, {});
assert.match(app.html, /NO CAMPAIGN LEVELS COMPLETED/);
assert.match(app.html, /data-active-tab="CAMPAIGN"/);

renderProfileStatistics({ snapshot, storage, activeTab: 2 }, {});
assert.match(app.html, /NO TYPING TEST RECORDS/);
assert.match(app.html, /ENGLISH 200/);
assert.doesNotMatch(app.html, /ENGLISH 199/);

renderProfileStatistics({ snapshot, storage, activeTab: 3 }, {});
assert.match(app.html, /NO ENDLESS RUNS YET/);
assert.doesNotMatch(app.html, /MODIFIER/i);

renderProfileStatistics({ snapshot, storage, activeTab: 4 }, {});
assert.match(app.html, /NO ARCADE RUSH RUNS YET/);
assert.match(app.html, /PERSONAL BEST/);
assert.match(app.html, /RUN HISTORY/);
assert.doesNotMatch(app.html, /DATE|STREAK|ATTEMPT/i);

const rushMode = storage.modes["arcade-rush"];
rushMode.completedSessions = 3;
rushMode.failedSessions = 1;
rushMode.activePlaytimeMs = 840000;
rushMode.activity = {
  ...rushMode.activity,
  trackedSessions: 3,
  wordsCompleted: 330,
  accuracyNumerator: 1500,
  accuracyDenominator: 1600,
  wpmWeightedTotal: 68040000,
  wpmWeightedDurationMs: 840000,
};
Object.assign(rushMode.records, {
  highestScore: 76972,
  bestCompletedScore: 76972,
  fastestCompletion: 287000,
  highestCombo: 63,
  bestAccuracy: 97.8,
  bestWpm: 84,
  mostPerfectWaves: 3,
  runsStarted: 4,
  runsCompleted: 2,
  bossesDefeated: 2,
});
storage.recentSessions = [{
  sessionId: "rush-recent",
  modeId: "arcade-rush",
  endedAt: 5000,
  success: true,
  score: 76972,
  accuracy: 97.8,
  wpm: 84,
  activeDurationMs: 287000,
  modeData: {
    wavesCompleted: 6,
    bossDefeated: true,
    integrityRemaining: 3,
    maxCombo: 63,
    perfectWaves: 3,
    rulesVersion: 0,
  },
}];
snapshot = getStatisticsSnapshot(storage, { currentFurthestLevel: 1, levels: {} });

renderProfileStatistics({ snapshot, storage, activeTab: 4 }, {});
assert.doesNotMatch(app.html, /NO ARCADE RUSH RUNS YET/);
assert.match(app.html, /76,972/);
assert.match(app.html, /04:47/);
assert.match(app.html, /97\.8%/);
assert.match(app.html, /50\.0%/);
assert.match(app.html, /BOSSES DEFEATED/);
assert.match(app.html, /840|14:00/);
assert.doesNotMatch(app.html, /DATE|STREAK|TODAY|ATTEMPT/i);

renderProfileStatistics({ snapshot, storage, activeTab: 5, recentFilter: "arcade-rush" }, {});
assert.equal((app.html.match(/data-recent-filter=/g) || []).length, 5);
assert.match(app.html, /data-recent-filter="arcade-rush"/);
assert.doesNotMatch(app.html, /data-recent-filter="daily"/);
assert.match(app.html, /ARCADE RUSH/);
assert.match(app.html, /COMPLETE.*76,972/);
assert.match(app.html, /6 WAVES/);
assert.match(app.html, /BOSS DEFEATED/);
assert.match(app.html, /CORE 3\/5/);
assert.match(app.html, /COMBO 63/);
assert.match(app.html, /RULES DRAFT/);

renderProfileStatistics({
  snapshot,
  storage,
  activeTab: 6,
  editing: true,
  draft: "Player",
  copyMessage: "COPY UNAVAILABLE",
  authState: { status: "unavailable" },
}, {});
assert.match(app.html, /EDIT NAME|SAVE/);
assert.match(app.html, /COPY PLAYER ID/);
assert.match(app.html, /STORED LOCALLY ON THIS DEVICE/);
assert.match(app.html, /Online account services are unavailable|Local gameplay and records are unaffected/i);
assert.match(app.html, /not uploaded anywhere/i);
assert.doesNotMatch(app.html, /NaN|undefined|Invalid Date/);

const [css, statisticsSource] = await Promise.all([
  readFile(new URL("../style.css", import.meta.url), "utf8"),
  readFile(new URL("../js/statistics.js", import.meta.url), "utf8"),
]);
assert.match(css, /\.profile-stats-screen[^}]*overflow-y:\s*auto/s);
assert.match(css, /\.profile-tabs[^}]*overflow-x:\s*auto/s);
assert.match(css, /\.profile-details code[^}]*overflow-wrap:\s*anywhere/s);
assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*\.profile-metric-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
assert.match(css, /--text-muted:\s*#[0-9a-f]+/i);
assert.match(css, /\.profile-metric-grid\s*\{[^}]*background:\s*transparent/s);
assert.match(css, /\.profile-stats-screen\s*\{[^}]*--profile-text-secondary:\s*#d2dbe2/s);
assert.match(css, /\.profile-stats-screen\s*\{[^}]*--profile-text-muted:\s*#bac6cf/s);
assert.doesNotMatch(statisticsSource, /dailyDate|getUtcDateKey|dateKey|challengeVersion|streak|attempts/i);
assert.doesNotMatch(statisticsSource, /supabase|authService|leaderboardService/i);

console.log("Statistics UI exposes solo-first Arcade Rush records, detailed recent runs, offline local profile access, and no Daily profile surface.");
