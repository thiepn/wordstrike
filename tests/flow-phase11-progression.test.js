import assert from "node:assert/strict";
import { MODE_IDS } from "../js/modes.js";
import {
  MODE_DATA_STORAGE_KEY,
  getModeSummary,
  getRecentSessions,
  resetModeData,
} from "../js/modeStorageV2.js";
import {
  FLOW_MILESTONES,
  FLOW_ONBOARDING_STORAGE_KEY,
  FLOW_PROGRESS_STORAGE_KEY,
  createFlowSessionResult,
  getFlowIntegrationSummary,
  hasSeenFlowOnboarding,
  loadFlowProgress,
  markFlowOnboardingSeen,
  recordFlowSession,
  saveFlowLastSetup,
} from "../js/flow/flowProgression.js";
import { applyFlowIntegrationDefaults } from "../js/flow/flowIntegrationBootstrap.js";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

store.clear();
resetModeData();
assert.ok(store.has(MODE_DATA_STORAGE_KEY));

const snapshot = {
  mode: MODE_IDS.FLOW,
  phase: "complete",
  passageId: "flow-standard-test",
  category: "academic",
  difficulty: "advanced",
  sessionLength: "standard",
  passage: "Repeated evidence keeps the progression contract deterministic.",
  currentIndex: 65,
  blockedBackspaces: 0,
  gameplay: {
    score: 12345,
    averageFlow: 93.4,
    averageMomentum: 1.72,
    correctKeystrokes: 64,
    incorrectKeystrokes: 1,
    accuracyPercent: 98.46,
  },
  cadence: {
    cadenceScore: 94,
    finalWpm: 82.5,
    typingDurationMs: 48000,
    sampleCount: 40,
    baselineIntervalMs: 145,
    featureLatencies: [],
  },
  rawKeystrokes: Array.from({ length: 65 }, (_, index) => ({ type: "insert", index })),
  wordTimings: Array.from({ length: 9 }, (_, index) => ({ endIndex: index })),
  errorTimings: [
    { index: 1, expected: "e", actual: "r" },
    { index: 4, expected: "e", actual: "r" },
  ],
};

const plan = {
  id: "flow-standard-progression",
  sessionLength: "standard",
  category: "academic",
  difficulty: "advanced",
  modifiers: ["precision"],
  chapterCount: 6,
  passageCount: 12,
  focusPassageCount: 2,
};

const result = createFlowSessionResult({
  sessionId: "flow-phase11-session-1",
  endedAt: 1700000000000,
  snapshot,
  plan,
});
assert.equal(result.schemaVersion, 1);
assert.equal(result.modeId, MODE_IDS.FLOW);
assert.equal(result.success, true);
assert.equal(result.score, 12345);
assert.equal(result.wpm, 82.5);
assert.equal(result.accuracy, 98.46);
assert.equal(result.activeDurationMs, 48000);
assert.equal(result.characters.totalKeystrokes, 65);
assert.equal(result.words.completed, 9);

const first = recordFlowSession({
  sessionId: "flow-phase11-session-1",
  endedAt: 1700000000000,
  snapshot,
  plan,
});
assert.equal(first.genericRecorded, true);
assert.equal(first.recorded, true);
assert.equal(first.progress.completedRuns, 1);
assert.equal(first.progress.totalCharacters, 65);
assert.equal(first.progress.totalWords, 9);
assert.equal(first.progress.totalActiveMs, 48000);
assert.equal(first.progress.best.score, 12345);
assert.equal(first.progress.best.wpm, 82.5);
assert.equal(first.progress.best.accuracy, 98.46);
assert.equal(first.progress.best.cadence, 94);
assert.equal(first.progress.best.averageFlow, 93.4);
assert.equal(first.progress.counts.length.standard, 1);
assert.equal(first.progress.counts.category.academic, 1);
assert.equal(first.progress.counts.difficulty.advanced, 1);
assert.equal(first.progress.counts.modifierRuns, 1);
assert.equal(first.progress.counts.adaptiveRuns, 1);
assert.equal(first.progress.counts.focusPassages, 2);
assert.equal(first.progress.history.length, 1);
assert.equal(first.progress.lastWeaknessProfile[0].key, "typo-pair");
assert.equal(first.progress.lastWeaknessProfile[0].expected, "e");
assert.equal(first.progress.lastWeaknessProfile[0].actual, "r");

for (const milestone of ["first-flow", "standard-run", "precision-98", "locked-in", "high-flow", "adaptive-run", "modifier-run"]) {
  assert.ok(first.progress.milestones[milestone], `expected ${milestone} milestone`);
}

const generic = getModeSummary(MODE_IDS.FLOW);
assert.equal(generic.completedSessions, 1);
assert.equal(generic.highestScore, 12345);
assert.equal(generic.bestWpm, 82.5);
assert.equal(generic.bestAccuracy, 98.46);
const recent = getRecentSessions();
assert.equal(recent[0].modeId, MODE_IDS.FLOW);
assert.equal(recent[0].score, 12345);

// Recording is idempotent across both storage layers.
const duplicate = recordFlowSession({
  sessionId: "flow-phase11-session-1",
  endedAt: 1700000001000,
  snapshot,
  plan,
});
assert.equal(duplicate.genericRecorded, false);
assert.equal(duplicate.recorded, false);
assert.equal(loadFlowProgress().completedRuns, 1);
assert.equal(getModeSummary(MODE_IDS.FLOW).completedSessions, 1);

// Five-run progression earns In Rhythm without introducing unlock gates.
for (let index = 2; index <= 5; index += 1) {
  recordFlowSession({
    sessionId: `flow-phase11-session-${index}`,
    endedAt: 1700000000000 + index,
    snapshot: { ...snapshot, gameplay: { ...snapshot.gameplay, score: 12000 + index } },
    plan,
  });
}
const five = loadFlowProgress();
assert.equal(five.completedRuns, 5);
assert.ok(five.milestones["five-runs"]);
assert.equal(Object.keys(five.milestones).every((id) => FLOW_MILESTONES.some((item) => item.id === id)), true);

// Preferences are persistent but still subordinate to explicit URL config.
saveFlowLastSetup({
  sessionLength: "quick",
  category: "dialogue",
  difficulty: "expert",
  modifiers: ["sprint", "clean-run"],
});
const saved = loadFlowProgress();
assert.deepEqual(saved.lastSetup, {
  sessionLength: "quick",
  category: "dialogue",
  difficulty: "expert",
  modifiers: ["sprint", "clean-run"],
});

let replacedUrl = null;
globalThis.history = { replaceState: (_state, _title, href) => { replacedUrl = href; } };
applyFlowIntegrationDefaults({
  href: "https://wordstrike.test/?dev=1&mode=flow&flowRun=1&flowIntegration=1&flowModifiers=1",
});
assert.ok(replacedUrl);
const restored = new URL(replacedUrl);
assert.equal(restored.searchParams.get("flowLength"), "quick");
assert.equal(restored.searchParams.get("flowCategory"), "dialogue");
assert.equal(restored.searchParams.get("flowDifficulty"), "expert");
assert.equal(restored.searchParams.get("flowModifierIds"), "sprint,clean-run");

replacedUrl = null;
applyFlowIntegrationDefaults({
  href: "https://wordstrike.test/?dev=1&mode=flow&flowRun=1&flowIntegration=1&flowLength=long&flowCategory=stories&flowDifficulty=smooth",
});
assert.equal(replacedUrl, null, "explicit setup must not be overwritten by stored defaults");

assert.equal(hasSeenFlowOnboarding(), false);
assert.equal(markFlowOnboardingSeen(), true);
assert.equal(hasSeenFlowOnboarding(), true);
assert.equal(store.get(FLOW_ONBOARDING_STORAGE_KEY), "seen");
assert.ok(store.has(FLOW_PROGRESS_STORAGE_KEY));

const integrated = getFlowIntegrationSummary();
assert.equal(integrated.progress.completedRuns, 5);
assert.equal(integrated.generic.completedSessions, 5);
assert.equal(integrated.recent.length, 5);

console.log("Flow Phase 11 progression contracts passed: canonical storage, idempotency, milestones, history, preferences, onboarding, and adaptive context.");
