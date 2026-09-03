import assert from "node:assert/strict";
import { createDefaultModeData } from "../js/modeStorage.js";
import { getAllModes } from "../js/modes.js";
import { getStatisticsSnapshot } from "../js/statistics.js";
import { getSpeedTestConfig } from "../js/speedTestConfig.js";

const nodeStub = {
  dataset: {},
  classList: { add() {}, remove() {}, toggle() {} },
  addEventListener() {},
  blur() {},
  focus() {},
  scrollIntoView() {},
};

const app = {
  html: "",
  set innerHTML(value) { this.html = value; },
  querySelector() { return { ...nodeStub }; },
  querySelectorAll() { return []; },
};

globalThis.document = {
  querySelector(selector) { return selector === "#app" ? app : null; },
};

const {
  renderBossShell,
  renderEndlessReady,
  renderEndlessShell,
  renderGameplayShell,
  renderLevelSelect,
  renderModeSelect,
  renderResults,
  renderSettings,
  renderSpeedTestRun,
} = await import("../js/ui.js");
const { renderLeaderboards } = await import("../js/leaderboardUi.js");
const { onboardingMarkup } = await import("../js/onboardingView.js");
const { renderProfileStatistics } = await import("../js/statisticsUi.js");

function buttonsFrom(html) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)].map((match) => ({
    attributes: match[1],
    textContent: match[2].replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " "),
  }));
}

function assertBackButtons(screen, html, matchesBackButton) {
  const buttons = buttonsFrom(html).filter(matchesBackButton);
  assert.ok(buttons.length > 0, `${screen} must render a Back button`);
  for (const button of buttons) {
    assert.equal(button.textContent.trim(), "BACK", `${screen} Back label must be exact ASCII`);
    assert.doesNotMatch(
      button.textContent,
      /\u00e2|\ufffd|\u25a1|\u2190/u,
      `${screen} Back label contains a corrupt glyph`,
    );
  }
}

const byAttribute = (pattern) => (button) => pattern.test(button.attributes);
const screenBack = byAttribute(/class="[^"]*screen-back-button/);
const gameplayBack = byAttribute(/class="[^"]*gameplay-pause-button/);
const actionBack = byAttribute(/data-action="back"/);

renderModeSelect(getAllModes(), 0, {});
assertBackButtons("Mode Select", app.html, screenBack);

renderLevelSelect({ currentFurthestLevel: 1, levels: {} }, 1, false, {}, null, {});
assertBackButtons("Level Select", app.html, actionBack);

renderGameplayShell(1, 3, {}, false, {}, {});
assertBackButtons("Campaign gameplay", app.html, gameplayBack);

renderBossShell(10, {
  bossIndex: 1,
  segmentCount: 1,
  totalWordCount: 8,
  timeLimitSec: 10,
}, false, {}, {});
assertBackButtons("Boss gameplay", app.html, gameplayBack);

const typingState = {
  config: getSpeedTestConfig("time-60"),
  words: ["word", "strike"],
  currentWordIndex: 0,
  typedBuffer: "",
};
renderSpeedTestRun({ ...typingState, phase: "PREPARING" }, false, {});
assertBackButtons("Typing configuration", app.html, gameplayBack);
renderSpeedTestRun({ ...typingState, phase: "ACTIVE" }, false, {});
assertBackButtons("Typing gameplay", app.html, gameplayBack);

renderEndlessReady({});
assertBackButtons("Endless ready", app.html, screenBack);
renderEndlessShell({ stage: 1, stageWordsCompleted: 0, integrity: 3 }, false, {});
assertBackButtons("Endless gameplay", app.html, gameplayBack);

renderLeaderboards({
  status: "empty",
  entries: [],
  selectedBoard: "campaign",
}, { status: "signed-out" }, {});
assertBackButtons("Leaderboards", app.html, screenBack);

renderSettings({
  settings: { strictMode: false, particles: true, screenShake: true },
}, 0, {});
assertBackButtons("Settings", app.html, (button) => screenBack(button) || actionBack(button));

const storage = createDefaultModeData();
storage.profile = {
  playerId: `ws_${"a".repeat(80)}`,
  displayName: "Player",
  createdAt: 1000,
  updatedAt: 1000,
  profileVersion: 1,
};
const snapshot = getStatisticsSnapshot(storage, {
  currentFurthestLevel: 1,
  levels: {},
});
renderProfileStatistics({ snapshot, storage }, {});
assertBackButtons("Profile & Stats", app.html, screenBack);

renderResults({
  grade: "A",
  wpm: 40,
  accuracy: 100,
  maxCombo: 8,
  score: 1000,
  levelNumber: 1,
  isBoss: false,
  livesRemaining: 3,
  startingLives: 3,
}, 0, {});
assertBackButtons("Results", app.html, screenBack);

const onboarding = onboardingMarkup({
  title: "HOW TO PLAY",
  currentStep: 1,
  steps: [
    { title: "First", body: "First step", primaryLabel: "NEXT" },
    { title: "Second", body: "Second step", primaryLabel: "DONE" },
  ],
});
assertBackButtons("Onboarding/help overlay", onboarding, byAttribute(/data-onboarding-action="previous"/));

console.log("All current rendered Back-button variants use the exact ASCII label BACK.");
