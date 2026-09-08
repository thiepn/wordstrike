import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildPracticeCoachViewModel, createDefaultPracticeCoachUiState } from "../js/practiceLab/practiceCoachUi.js";
import { buildPracticeCoachDailyPlan } from "../js/practiceLab/practiceCoachPlanner.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createPracticeLabRoute, normalizePracticeLabRoute, PRACTICE_LAB_PUBLIC_ROUTES, PRACTICE_LAB_ROUTES } from "../js/practiceLab/practiceLabRoutes.js";

const profileId = createPracticeId("profile", { uuid: () => "pl25-ui-profile-12345678" });
const contextId = createPracticeId("context", { uuid: () => "pl25-ui-context-12345678" });

function plan15() {
  return buildPracticeCoachDailyPlan({
    profileId,
    contextId,
    localDayKey: "2026-09-08",
    requestedMinutes: 15,
    inputFingerprint: "ui-fixture",
    targetCandidates: [
      { statId: "stat-r", entityType: "key", entityKey: "r", experimentId: "weak-keys", utilityScore: 88, availabilityStatus: "ready", hierarchy: { status: "independent", explainedBy: [] }, reasonCodes: ["key-foundation"] },
      { statId: "stat-speed", entityType: "word", entityKey: "speed", experimentId: "problem-words", utilityScore: 72, availabilityStatus: "ready", hierarchy: { status: "independent", explainedBy: [] }, reasonCodes: ["word-limiter"] },
    ],
    realTextSupportedMinutes: [10, 5, 3],
    now: () => new Date("2026-09-08T10:00:00.000Z"),
  });
}

test("PL25 Daily Training is a developer-gated Practice Lab public route", () => {
  assert.equal(PRACTICE_LAB_ROUTES.DAILY_TRAINING, "daily-training");
  assert.ok(PRACTICE_LAB_PUBLIC_ROUTES.includes(PRACTICE_LAB_ROUTES.DAILY_TRAINING));
  const gate = { canAccess: () => true };
  assert.deepEqual(normalizePracticeLabRoute(createPracticeLabRoute(PRACTICE_LAB_ROUTES.DAILY_TRAINING), { featureGate: gate }), createPracticeLabRoute(PRACTICE_LAB_ROUTES.DAILY_TRAINING));
  const blocked = normalizePracticeLabRoute(createPracticeLabRoute(PRACTICE_LAB_ROUTES.DAILY_TRAINING), { featureGate: { canAccess: () => false } });
  assert.equal(blocked.name, "unavailable");
});

test("PL25 Daily Training setup exposes only 5/8/12/15 minute budgets with 12 minutes selected by default", () => {
  const view = buildPracticeCoachViewModel({ state: createDefaultPracticeCoachUiState(), preview: true });
  assert.equal(view.kind, "daily-training");
  assert.deepEqual(view.durationChoices.map((choice) => choice.minutes), [5, 8, 12, 15]);
  assert.equal(view.durationChoices.find((choice) => choice.selected)?.minutes, 12);
  assert.equal(view.canCreate, true);
  assert.equal(view.plan, null);
});

test("PL25 frozen Daily Training view allows start/skip only for the first pending block", () => {
  const plan = plan15();
  const view = buildPracticeCoachViewModel({ state: { status: "ready", requestedMinutes: 15, plan, errorCode: null, startingBlockId: null } });
  assert.equal(view.plan.canStartNext, true);
  assert.equal(view.plan.blocks.filter((block) => block.canSkip).length, 1);
  assert.equal(view.plan.blocks.find((block) => block.canSkip)?.blockId, view.plan.nextBlockId);
  assert.equal(view.plan.blocks[1].canSkip, false);
  assert.equal(view.plan.blocks[2].canSkip, false);
});

test("PL25 starting state disables duplicate Daily Training start/skip actions", () => {
  const plan = plan15();
  const first = plan.blocks.find((block) => block.status === "pending");
  const view = buildPracticeCoachViewModel({ state: { status: "starting", requestedMinutes: 15, plan, errorCode: null, startingBlockId: first.blockId } });
  assert.equal(view.plan.canStartNext, false);
  assert.equal(view.plan.canEndToday, false);
  assert.equal(view.plan.blocks.some((block) => block.canSkip), false);
  assert.equal(view.plan.blocks[0].statusLabel, "Starting");
});

test("PL25 renderer/controller expose Daily Training without auto-running optional assessment or Cold Transfer measurements", async () => {
  const renderer = await readFile(new URL("../js/practiceLab/practiceLabRendererV25.js", import.meta.url), "utf8");
  const controller = await readFile(new URL("../js/practiceLab/practiceLabControllerRuntimeV25.js", import.meta.url), "utf8");
  assert.match(renderer, /OPEN DAILY TRAINING/);
  assert.match(renderer, /Optional suggestions/);
  assert.match(renderer, /outside today's training block count and never start automatically/i);
  assert.match(controller, /open-coach-assessment/);
  assert.match(controller, /open-coach-cold-transfer/);
  assert.doesNotMatch(controller, /startColdTransfer|autoStartCold|autoStartAssessment/);
});

test("PL25 Daily Coach styling retains mobile and reduced-motion handling", async () => {
  const css = await readFile(new URL("../practiceLabV25.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /practice-coach-block/);
  assert.match(css, /practice-coach-duration/);
});

test("PL25 Coach UI copy avoids mastery, retention-success, transfer-success and causal-improvement claims", async () => {
  const ui = await readFile(new URL("../js/practiceLab/practiceCoachUi.js", import.meta.url), "utf8");
  const renderer = await readFile(new URL("../js/practiceLab/practiceLabRendererV25.js", import.meta.url), "utf8");
  const combined = `${ui}\n${renderer}`.toLowerCase();
  for (const forbidden of ["you mastered", "you retained", "you transferred", "this caused improvement", "proves improvement", "learning gain caused"]) {
    assert.equal(combined.includes(forbidden), false, forbidden);
  }
});
