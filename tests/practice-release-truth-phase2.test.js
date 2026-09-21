import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PRACTICE_DAILY_TRAINING, PRACTICE_EXPERIMENT_CATALOG } from "../js/practiceLab/practiceExperimentCatalog.js";
import { createPracticeFeatureGate } from "../js/practiceLab/practiceFeatureGate.js";
import {
  buildPracticeUnavailableViewModel,
  buildSkillMapEmptyViewModel,
  buildReviewQueueEmptyViewModel,
  buildProgressEmptyViewModel,
} from "../js/practiceLab/practiceLabViewModel.js";
import { renderPracticeWeaknessBossDetail } from "../js/practiceLab/practiceWeaknessBossUi.js";

test("Phase 2 release truth remains intact after Phase 6 maturity closure", () => {
  assert.equal(PRACTICE_EXPERIMENT_CATALOG.length, 17);
  assert.ok(PRACTICE_EXPERIMENT_CATALOG.every((entry) => entry.status === "available"));
  assert.equal(PRACTICE_DAILY_TRAINING.status, "available");
  for (const id of ["read-ahead", "metronome-typing", "weakness-boss"]) {
    const entry = PRACTICE_EXPERIMENT_CATALOG.find((item) => item.id === id);
    assert.ok(entry);
    assert.equal(entry.tags.includes("experimental"), false, id);
    assert.equal(entry.capabilities.includes("experimental"), false, id);
  }
  const publicCopy = PRACTICE_EXPERIMENT_CATALOG.map((entry) => `${entry.description} ${entry.longDescription}`).join("\n");
  assert.doesNotMatch(publicCopy, /\bPL\d+\b|coming soon|future local-only editor|will support|will let you/i);
});

test("Phase 2 feature gate reports public release truth in both normal and developer mode", () => {
  assert.equal(createPracticeFeatureGate().resolveModeDefinitions([{ id: "practice", enabled: true }])[0].status, "available");
  assert.equal(createPracticeFeatureGate({ developerMode: true }).resolveModeDefinitions([{ id: "practice", enabled: true }])[0].status, "available");
  assert.equal(createPracticeFeatureGate({ publicEnabled: false }).resolveModeDefinitions([{ id: "practice", enabled: true }])[0].status, "unavailable");
});

test("Phase 2 fallback analysis and unavailable views use current product language", () => {
  const views = [buildSkillMapEmptyViewModel(), buildReviewQueueEmptyViewModel(), buildProgressEmptyViewModel()];
  for (const view of views) {
    const copy = [view.description, view.emptyDescription, ...(view.futureItems ?? [])].join(" ");
    assert.doesNotMatch(copy, /\bfuture\b|eventually|coming soon/i);
  }
  assert.match(buildPracticeUnavailableViewModel().description, /unavailable in this build/i);
  assert.doesNotMatch(buildPracticeUnavailableViewModel().description, /coming soon/i);
});

test("Phase 2 public Practice UI contains no implementation-phase labels", async () => {
  const files = [
    "practiceLabRenderer.js", "practiceLabRendererV21.js", "practiceLabRendererV22.js", "practiceLabRendererV24.js",
    "practiceLabRendererV26.js", "practiceLabRendererV27.js", "practiceLabRendererV29.js",
    "practiceBurstSprintsSessionHost.js", "practicePaceLadderSessionHost.js",
  ];
  const sources = await Promise.all(files.map((name) => readFile(new URL(`../js/practiceLab/${name}`, import.meta.url), "utf8")));
  const combined = sources.join("\n");
  assert.doesNotMatch(combined, /\bPL(?:10|11|12|13|14|15|16|18|19)\b|DEVELOPER PREVIEW|future training|current development build|coming soon/i);
});

test("Phase 6 graduates Weakness Boss without weakening its evidence boundary", () => {
  const root = { innerHTML: "", querySelector() { return null; } };
  renderPracticeWeaknessBossDetail(root, { status: "ready", candidates: [], recommendedCandidate: null, errorCode: null });
  assert.match(root.innerHTML, />ADVANCED CHALLENGE</);
  assert.doesNotMatch(root.innerHTML, />EXPERIMENTAL</);
  assert.match(root.innerHTML, /Challenge progress, not a skill score/);
});


test("Phase 6 graduated drill maturity never alters availability", async () => {
  const { buildExperimentDetailViewModel } = await import("../js/practiceLab/practiceLabViewModel.js");
  const entry = PRACTICE_EXPERIMENT_CATALOG.find((item) => item.id === "read-ahead");
  const registry = { getResolvedExperiment() { return { catalogEntry: entry, runnable: true, availability: "available" }; } };
  const view = buildExperimentDetailViewModel({ route: { params: { experimentId: "read-ahead" } }, registry });
  assert.equal(view.status, "available");
  assert.equal(view.statusLabel, "Available");
  assert.equal(view.maturityLabel, null);
});


test("Phase 2 feature-gate reasons use release truth rather than roadmap language", () => {
  assert.equal(createPracticeFeatureGate({ developerMode: true }).getSnapshot().reason, "developer");
  assert.equal(createPracticeFeatureGate().getSnapshot().reason, "public");
  assert.equal(createPracticeFeatureGate({ publicEnabled: false }).getSnapshot().reason, "disabled");
});
