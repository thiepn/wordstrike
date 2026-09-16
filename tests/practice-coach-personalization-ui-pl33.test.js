import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildPracticeCoachDailyPlan } from "../js/practiceLab/practiceCoachPlanner.js";
import { buildPracticeCoachViewModel } from "../js/practiceLab/practiceCoachUi.js";
import { createPracticeCoachService } from "../js/practiceLab/practiceCoachService.js";
import { PRACTICE_COACH_PERSONALIZATION_POLICY_VERSION, PRACTICE_COACH_PERSONALIZATION_VERSION } from "../js/practiceLab/practiceCoachPersonalizationConstants.js";
import { PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION } from "../js/practiceLab/practiceTreatmentConstants.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";

const profileId = createPracticeId("profile", { uuid: () => "pl33-ui-profile-12345678" });
const contextId = createPracticeId("context", { uuid: () => "pl33-ui-context-12345678" });
const fixedNow = () => new Date("2026-09-11T12:00:00.000Z");

function personalizedPlan() {
  const stateId = "practice-treatment-response-state_pl33-ui-state-12345678";
  const family = "combination-repair@current";
  const decision = {
    version: PRACTICE_COACH_PERSONALIZATION_VERSION,
    personalizationPolicyVersion: PRACTICE_COACH_PERSONALIZATION_POLICY_VERSION,
    treatmentFamilyKey: family,
    sourceScope: "exact-target",
    outcomeKey: "cold-transfer",
    delayBucket: "long",
    evidenceDepth: "high",
    responsePattern: "positive-signal",
    eligibleSampleCount: 10,
    medianResponse: 8,
    responseUnit: "quality-points",
    freshnessBucket: "0-7d",
    assignmentComposition: { manual: 8, coach: 2, total: 10 },
    measurementGrade: "prospective-recorded-clean",
    responseModifier: 1.1,
    baseInterventionMatch: 1,
    personalizedInterventionMatch: 1.1,
    sourceResponseStateId: stateId,
    sourceResponseStateUpdatedAt: "2026-09-10T12:00:00.000Z",
    responseModelVersion: PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
    comparisonAdjusted: true,
    needUtility: 80,
    evidenceInputs: [{ treatmentFamilyKey: family, treatmentResponseStateId: stateId, updatedAt: "2026-09-10T12:00:00.000Z", sourceScope: "exact-target", responseModifier: 1.1 }],
    optionComparisons: [
      { experimentId: "combination-repair", treatmentFamilyKey: family, baseInterventionMatch: 1, responseModifier: 1.1, personalizedInterventionMatch: 1.1, personalizedOptionUtility: 88, sourceScope: "exact-target", responsePattern: "positive-signal", evidenceDepth: "high" },
      { experimentId: "accuracy-control", treatmentFamilyKey: "accuracy-control@current", baseInterventionMatch: 0.85, responseModifier: 1, personalizedInterventionMatch: 0.85, personalizedOptionUtility: 68, sourceScope: "none", responsePattern: "insufficient", evidenceDepth: "insufficient" },
    ],
  };
  return buildPracticeCoachDailyPlan({
    profileId, contextId, localDayKey: "2026-09-11", requestedMinutes: 8, inputFingerprint: "pl33-ui-personalized",
    targetCandidates: [{
      statId: "stat-th", entityType: "bigram", entityKey: "th", experimentId: "combination-repair", experimentVersion: 1,
      baseUtilityScore: 80, personalizedUtilityScore: 88, utilityScore: 88, availabilityStatus: "ready",
      hierarchy: { status: "independent", explainedBy: [] }, personalizationDecision: decision, responseInformed: true,
      reasonCodes: ["combination-limiter", "response-informed-treatment"],
    }],
    realTextSupportedMinutes: [10, 5, 3], now: fixedNow,
  });
}

test("PL33 Daily Training explains response-informed method selection without weakening current-need doctrine", () => {
  const plan = personalizedPlan();
  const view = buildPracticeCoachViewModel({ state: { status: "ready", requestedMinutes: 8, plan, errorCode: null, startingBlockId: null }, preview: true });
  assert.equal(view.plan.responseInformed, true);
  assert.equal(view.plan.blocks.find((block) => block.kind === "targeted-intervention")?.responseInformed, true);
  assert.ok(view.plan.rationales.some((text) => /current need still determined whether the target was included/i.test(text)));
  assert.equal(view.plan.developerDiagnostics.length, 1);
  assert.equal(view.plan.developerDiagnostics[0].needUtility, 80);
  assert.equal(view.plan.developerDiagnostics[0].responseModifier, 1.1);
  assert.equal(view.plan.developerDiagnostics[0].optionComparisons.length, 2);
});

test("PL33 developer diagnostics are preview-only and neutral plans do not gain response-informed copy", () => {
  const plan = personalizedPlan();
  const productionView = buildPracticeCoachViewModel({ state: { status: "ready", requestedMinutes: 8, plan, errorCode: null, startingBlockId: null }, preview: false });
  assert.deepEqual(productionView.plan.developerDiagnostics, []);
  const neutral = buildPracticeCoachDailyPlan({
    profileId, contextId, localDayKey: "2026-09-11", requestedMinutes: 5, inputFingerprint: "pl33-ui-neutral",
    targetCandidates: [{ statId: "stat-r", entityType: "key", entityKey: "r", experimentId: "weak-keys", baseUtilityScore: 80, personalizedUtilityScore: 80, utilityScore: 80, availabilityStatus: "ready", hierarchy: { status: "independent", explainedBy: [] }, personalizationDecision: null, responseInformed: false, reasonCodes: ["key-foundation"] }],
    realTextSupportedMinutes: [], now: fixedNow,
  });
  const neutralView = buildPracticeCoachViewModel({ state: { status: "ready", requestedMinutes: 5, plan: neutral, errorCode: null, startingBlockId: null }, preview: true });
  assert.equal(neutralView.plan.responseInformed, false);
  assert.deepEqual(neutralView.plan.developerDiagnostics, []);
  assert.equal(neutralView.plan.rationales.some((text) => /response evidence/i.test(text)), false);
});

test("PL33 renderer keeps response diagnostics bounded, developer-only and non-causal", async () => {
  const ui = await readFile(new URL("../js/practiceLab/practiceCoachUi.js", import.meta.url), "utf8");
  const renderer = await readFile(new URL("../js/practiceLab/practiceLabRendererV25.js", import.meta.url), "utf8");
  const combined = `${ui}\n${renderer}`;
  assert.match(renderer, /Response-informed/);
  assert.match(renderer, /Coach v2 diagnostics/);
  assert.match(renderer, /Developer-only bounded audit data/);
  assert.match(ui, /slice\(0, 4\)/);
  const lower = combined.toLowerCase();
  for (const forbidden of ["proves this works", "caused improvement", "best treatment", "most effective treatment", "guaranteed improvement"]) assert.equal(lower.includes(forbidden), false, forbidden);
});

function limiterCandidate({ statId, entityType, entityKey, ar = 22, slow = 65 }) {
  return {
    statId, entityType, entityKey, status: "confirmed", priorityScore: 90, weaknessScore: 85,
    evidenceMetadata: { primaryDimensionConfidenceScore: 90 }, hierarchy: { status: "independent", explainedBy: [] },
    dimensions: { inaccurate: { weightedSeverity: ar }, recoveryHeavy: { weightedSeverity: Math.max(0, ar - 2) }, slow: { weightedSeverity: slow }, hesitant: { weightedSeverity: 10 }, unstable: { weightedSeverity: 5 } },
  };
}

test("PL33 response-state read failure degrades to neutral PL25-compatible selection with one bounded load", async () => {
  let responseLoads = 0;
  let persistedPlan = null;
  const limiterCandidates = [
    limiterCandidate({ statId: "stat-th", entityType: "bigram", entityKey: "th" }),
    limiterCandidate({ statId: "stat-word", entityType: "word", entityKey: "because", ar: 18, slow: 70 }),
  ];
  const repository = {
    async getTodayCoachPlan() { return null; },
    async getPracticeContext() { return { profileId, contextId, updatedAt: "2026-09-11T10:00:00.000Z", dataLocale: "en" }; },
    async listLearningStates() { return []; },
    async getPerformanceState() { return null; },
    async listAssessmentRuns() { return []; },
    async listSkillStats() { return []; },
    async getCurrentPerformanceState() { return { readinessBand: "normal", status: "fresh" }; },
    async listReviewItems() { return []; },
    async listTreatmentResponseStates() { responseLoads += 1; throw new Error("simulated PL32 read failure"); },
    async createCoachPlan(plan) { persistedPlan = plan; return { created: true, raced: false, plan }; },
    getPracticeSettings() { return { dailySessionLengthMinutes: 8 }; },
  };
  const limiterService = { async buildContextLimiterSnapshot() { return { candidates: limiterCandidates }; } };
  const masteryService = { async buildContextMasterySnapshot() { return { entities: limiterCandidates.map((candidate) => ({ statId: candidate.statId, stage: "learning" })), counts: { transferUnverifiedCount: 0 } }; } };
  const reviewService = { async reconcile() { return null; }, async buildPracticeReviewQueue() { return { candidates: [] }; }, async buildPracticeReviewPlan() { return { bindings: [] }; } };
  const readyRuntime = { async inspectTarget() { return { status: "ready", eligible: true }; } };
  const experimentRegistry = {
    getRegistration(id) {
      if (id === "real-text") return { runtime: { async getAvailability() { return { status: "ready", supportedDurationsMs: [180000, 300000, 600000] }; } } };
      if (["weak-keys", "combination-repair", "problem-words", "accuracy-control"].includes(id)) return { runtime: readyRuntime };
      return null;
    },
  };
  const service = createPracticeCoachService({ repository, experimentRegistry, limiterService, masteryService, reviewService, now: fixedNow });
  const result = await service.createTodayPracticeCoachPlan({ profileId, contextId, requestedMinutes: 8 });
  assert.equal(result.created, true);
  assert.equal(responseLoads, 1);
  assert.ok(persistedPlan);
  assert.equal(persistedPlan.plannerVersion, 2);
  const target = persistedPlan.blocks.find((block) => block.kind === "targeted-intervention");
  assert.equal(target.experimentId, "combination-repair");
  assert.equal(target.responseInformed, false);
  assert.equal(target.personalizationDecision, null);
  assert.equal(target.baseUtilityScore, target.personalizedUtilityScore);
});
