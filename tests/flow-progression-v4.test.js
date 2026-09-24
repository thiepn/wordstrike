import assert from "node:assert/strict";
import {
  FLOW_PROGRESSION_V4_MILESTONES,
  FLOW_PROGRESSION_V4_STORAGE_KEY,
  bootstrapFlowProgressionV4,
  createDefaultFlowProgressionV4,
  getFlowProgressionSummaryV4,
  loadFlowProgressionV4,
  recordFlowProgressionV4,
  resetFlowProgressionV4,
  sanitizeFlowProgressionV4,
} from "../js/flow/flowProgressionV4.js";
import { FLOW_V3_THEME_IDS } from "../js/flow/flowStreamPlanV3.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const previousStorage = globalThis.localStorage;
globalThis.localStorage = new MemoryStorage();

try {
  const specificThemes = FLOW_V3_THEME_IDS.filter((theme) => theme !== "mixed");
  assert.ok(specificThemes.length >= 3, "Flow 7B theme milestones require at least three specific themes");
  assert.equal(FLOW_PROGRESSION_V4_MILESTONES.length, 25);

  const defaults = createDefaultFlowProgressionV4();
  assert.equal(defaults.totals.runs, 0);
  assert.equal(defaults.recordedSessionIds.length, 0);

  const sourceRecords = {
    completedRuns: 2,
    eligibleRuns: 2,
    recordedSessionIds: ["flow-old-a", "flow-old-b"],
    personalBest: {
      sessionId: "flow-old-b",
      completed: true,
      recordEligible: true,
      endedAt: 2_000,
      score: 40_000,
      wpm: 78,
      accuracy: 99,
      consistency: 89,
      activeDurationMs: 120_000,
      wordsCompleted: 300,
      correctCharacters: 1_500,
      theme: specificThemes[1],
    },
    history: [
      {
        sessionId: "flow-old-b",
        completed: true,
        recordEligible: true,
        endedAt: 2_000,
        score: 40_000,
        wpm: 78,
        accuracy: 99,
        consistency: 89,
        activeDurationMs: 120_000,
        wordsCompleted: 300,
        correctCharacters: 1_500,
        theme: specificThemes[1],
      },
      {
        sessionId: "flow-old-a",
        completed: true,
        recordEligible: true,
        endedAt: 1_000,
        score: 20_000,
        wpm: 60,
        accuracy: 98,
        consistency: 82,
        activeDurationMs: 90_000,
        wordsCompleted: 200,
        correctCharacters: 1_000,
        theme: specificThemes[0],
      },
    ],
  };

  const bootstrapped = bootstrapFlowProgressionV4(sourceRecords);
  assert.equal(bootstrapped.totals.runs, 2);
  assert.equal(bootstrapped.totals.eligibleRuns, 2);
  assert.equal(bootstrapped.totals.words, 500);
  assert.equal(bootstrapped.totals.score, 60_000);
  assert.equal(bootstrapped.streaks.eligibleBest, 2);
  assert.equal(bootstrapped.streaks.precisionBest, 2);
  assert.ok(bootstrapped.milestones["runs-1"]);
  assert.ok(bootstrapped.milestones["words-500"]);
  assert.ok(bootstrapped.milestones["wpm-60"]);
  assert.ok(!bootstrapped.milestones["runs-5"]);

  const loaded = loadFlowProgressionV4({ sourceRecords });
  assert.equal(loaded.totals.runs, 2, "missing V4 storage should seed from retained V3 records");
  assert.equal(globalThis.localStorage.getItem(FLOW_PROGRESSION_V4_STORAGE_KEY), null, "read-only bootstrap must not write storage");

  const currentResult = {
    sessionId: "flow-current",
    completed: true,
    recordEligible: true,
    endedAt: 3_000,
    score: 250_000,
    wpm: 121,
    accuracy: 99.2,
    consistency: 96,
    activeDurationMs: 360_000,
    wordsCompleted: 900,
    correctCharacters: 4_500,
    theme: "mixed",
  };
  const update = recordFlowProgressionV4(currentResult, {
    sourceRecords,
    plan: { corpusThemes: specificThemes },
  });

  assert.equal(update.recorded, true);
  assert.equal(update.progression.totals.runs, 3);
  assert.equal(update.progression.totals.words, 1_400);
  assert.equal(update.progression.totals.score, 310_000);
  assert.equal(update.progression.best.wpm, 121);
  assert.equal(update.progression.best.consistency, 96);
  assert.equal(update.progression.best.activeDurationMs, 360_000);
  assert.equal(update.progression.streaks.eligibleBest, 3);
  assert.equal(update.progression.streaks.precisionBest, 3);
  assert.equal(Object.keys(update.progression.themes).length, specificThemes.length);
  for (const id of ["wpm-120", "consistency-95", "themes-all", "eligible-streak-3", "precision-streak-3", "endurance-5m"]) {
    assert.ok(update.newlyEarned.some((milestone) => milestone.id === id), `expected new milestone ${id}`);
  }

  const duplicate = recordFlowProgressionV4(currentResult, { plan: { corpusThemes: specificThemes } });
  assert.equal(duplicate.recorded, false);
  assert.equal(duplicate.progression.totals.runs, 3, "session ID idempotency must prevent double counting");

  const summary = getFlowProgressionSummaryV4(update.progression);
  assert.equal(summary.earnedCount, Object.keys(update.progression.milestones).length);
  assert.equal(summary.totalMilestones, FLOW_PROGRESSION_V4_MILESTONES.length);
  assert.ok(summary.tier?.name);
  assert.ok(summary.nextMilestone || summary.earnedCount === summary.totalMilestones);
  assert.ok(summary.completionRatio > 0 && summary.completionRatio <= 1);

  globalThis.localStorage.setItem(FLOW_PROGRESSION_V4_STORAGE_KEY, "{broken json");
  const recovered = loadFlowProgressionV4();
  assert.equal(recovered.totals.runs, 0, "corrupt progression storage must fail closed to defaults");

  const sanitized = sanitizeFlowProgressionV4({
    totals: { runs: -4, score: Number.NaN, words: 12.2 },
    best: { wpm: -1, accuracy: 500, consistency: -5 },
    milestones: { "not-real": Date.now(), "runs-1": 123 },
    recordedSessionIds: ["x", "x", "", 42],
  });
  assert.equal(sanitized.totals.runs, 0);
  assert.equal(sanitized.totals.words, 12);
  assert.equal(sanitized.best.wpm, 0);
  assert.equal(sanitized.best.accuracy, 100);
  assert.deepEqual(sanitized.recordedSessionIds, ["x"]);
  assert.deepEqual(Object.keys(sanitized.milestones), ["runs-1"]);

  resetFlowProgressionV4();
  assert.equal(globalThis.localStorage.getItem(FLOW_PROGRESSION_V4_STORAGE_KEY), null);

  const [phase1, loader, sw, css, index] = await Promise.all([
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../js/flow/flowPhase1.js", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../js/flow/flowRuntimeLoader.js", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../sw.js", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../styles/screens/flow-session-v4.css", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../index.html", import.meta.url), "utf8")),
  ]);

  assert.match(phase1, /recordFlowProgressionV4/);
  assert.match(phase1, /loadFlowRecordsV3/);
  assert.match(phase1, /data-flow-progression/);
  assert.match(phase1, /data-flow-milestone-reward/);
  assert.match(phase1, /getPublicProgressionState/);
  assert.match(loader, /flowProgressionV4\.js\?v=20260924a/);
  assert.match(loader, /wordstrike-flow-release-v25/);
  assert.match(sw, /const CACHE_NAME = CACHE_PREFIX \+ "v\d+-[^"]+";/);
  assert.match(sw, /flowProgressionV4\.js\?v=20260924a/);
  assert.match(css, /WORDSTRIKE FLOW — PHASE 7B/);
  assert.match(css, /flow-v4-progression-strip/);
  assert.match(css, /flow-v4-milestone-reward/);
  assert.match(index, /flow-session-v4\.css\?v=20260924c/);
  assert.match(index, /flowRuntimeLoader\.js\?v=20260924m/);

  console.log("Flow Phase 7B contracts passed: V3 bootstrap, passive milestones, streaks, theme breadth, endurance, reward tiers, idempotency, persistence recovery, and offline wiring.");
} finally {
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
}
