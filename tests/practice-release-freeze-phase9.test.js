import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PRACTICE_DAILY_TRAINING,
  PRACTICE_EXPERIMENT_CATALOG,
  PRACTICE_EXPERIMENT_IDS,
} from "../js/practiceLab/practiceExperimentCatalog.js";
import { createPracticeFeatureGate } from "../js/practiceLab/practiceFeatureGate.js";
import {
  PRACTICE_LAB_DEVELOPER_ROUTES,
  PRACTICE_LAB_PUBLIC_ROUTES,
  PRACTICE_LAB_ROUTES,
  createPracticeLabRoute,
  normalizePracticeLabRoute,
} from "../js/practiceLab/practiceLabRoutes.js";

const RELEASE_EXPERIMENT_IDS = Object.freeze([
  "full-assessment",
  "weak-keys",
  "combination-repair",
  "problem-words",
  "accuracy-control",
  "burst-sprints",
  "pace-ladder",
  "common-words",
  "real-text",
  "consistency-trainer",
  "metronome-typing",
  "read-ahead",
  "endurance",
  "punctuation-capitals",
  "numbers-symbols",
  "custom-text",
  "weakness-boss",
]);

const RELEASE_PUBLIC_ROUTES = Object.freeze([
  "home",
  "daily-training",
  "experiment-detail",
  "skill-map",
  "review-queue",
  "progress",
  "physical-keyboard",
]);

test("Phase 9 freezes the public Practice experiment surface", () => {
  assert.deepEqual([...PRACTICE_EXPERIMENT_IDS], RELEASE_EXPERIMENT_IDS);
  assert.deepEqual(PRACTICE_EXPERIMENT_CATALOG.map((entry) => entry.id), RELEASE_EXPERIMENT_IDS);
  assert.equal(PRACTICE_EXPERIMENT_CATALOG.length, 17);
  assert.equal(PRACTICE_DAILY_TRAINING.status, "available");
  for (const entry of PRACTICE_EXPERIMENT_CATALOG) {
    assert.equal(entry.status, "available", entry.id);
    assert.equal(entry.supportsMobile, true, entry.id);
    assert.equal(entry.supportsPhysicalKeyboard, true, entry.id);
    assert.equal(entry.supportsSoftwareKeyboard, true, entry.id);
    assert.equal(entry.tags?.includes("experimental"), false, entry.id);
    assert.equal(entry.capabilities?.includes("experimental"), false, entry.id);
    assert.doesNotMatch(`${entry.description} ${entry.longDescription}`, /\b(?:preview|planned|coming soon|experimental)\b/i, entry.id);
  }
});

test("Phase 9 freezes public and developer route ownership", () => {
  assert.deepEqual([...PRACTICE_LAB_PUBLIC_ROUTES], RELEASE_PUBLIC_ROUTES);
  assert.deepEqual([...PRACTICE_LAB_DEVELOPER_ROUTES], [PRACTICE_LAB_ROUTES.RESEARCH]);
  const publicGate = createPracticeFeatureGate();
  const developerGate = createPracticeFeatureGate({ developerMode: true });
  const research = createPracticeLabRoute(PRACTICE_LAB_ROUTES.RESEARCH);
  assert.equal(normalizePracticeLabRoute(research, { featureGate: publicGate }).name, PRACTICE_LAB_ROUTES.HOME);
  assert.equal(normalizePracticeLabRoute(research, { featureGate: developerGate }).name, PRACTICE_LAB_ROUTES.RESEARCH);
});

test("Phase 9 keeps canonical architecture and route-lazy heavy runtimes", async () => {
  const [facade, controller, renderer] = await Promise.all([
    readFile(new URL("../js/practiceLab/practiceLabController.js", import.meta.url), "utf8"),
    readFile(new URL("../js/practiceLab/practiceLabControllerCurrent.js", import.meta.url), "utf8"),
    readFile(new URL("../js/practiceLab/practiceLabRendererCurrent.js", import.meta.url), "utf8"),
  ]);
  assert.match(facade, /import\("\.\/practiceLabControllerCurrent\.js"\)/);
  assert.doesNotMatch(facade, /practiceLabControllerRuntimeV\d+/);
  assert.doesNotMatch(controller, /from\s+["'][^"']*practiceLabControllerRuntime(?:V\d+)?\.js/);
  assert.doesNotMatch(controller, /from\s+["'][^"']*practiceLabRenderer(?:V\d+)?\.js/);
  assert.doesNotMatch(renderer, /from\s+["'][^"']*practiceLabRenderer(?:V\d+)?\.js/);
  for (const runtime of [
    "practiceResearchRuntime.js",
    "practicePhysicalTelemetryViewRuntime.js",
    "practiceTreatmentResponseRuntime.js",
    "practiceCustomTextSessionHost.js",
    "practiceAssessmentSessionHost.js",
  ]) {
    assert.ok(controller.includes(`import("./${runtime}")`) || controller.includes(`import(\'./${runtime}\')`), runtime);
  }
});

test("Phase 9 release notes preserve the physical-device certification boundary", async () => {
  const document = await readFile(new URL("../docs/PRACTICE_LAB_RELEASE_FREEZE.md", import.meta.url), "utf8");
  assert.match(document, /physical-device sign-off pending/i);
  assert.match(document, /Samsung Internet/i);
  assert.match(document, /iOS Safari/i);
  assert.match(document, /installed Android PWA/i);
  assert.match(document, /installed iOS Home Screen PWA/i);
});

test("Phase 9 release-contract CI permanently includes Phases 8 and 9", async () => {
  const workflow = await readFile(new URL("../.github/workflows/practice-certification.yml", import.meta.url), "utf8");
  assert.match(workflow, /tests\/practice-architecture-consolidation-phase8\.test\.js/);
  assert.match(workflow, /tests\/practice-release-freeze-phase9\.test\.js/);
});
