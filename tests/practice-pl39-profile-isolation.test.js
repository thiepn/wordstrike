import test from "node:test";
import assert from "node:assert/strict";

import { createPracticeCoachPlanRecord } from "../js/practiceLab/practiceCoachPlan.js";
import { createPracticeCustomTextRepository } from "../js/practiceLab/practiceCustomTextRepository.js";
import { createScopedPracticePhysicalTelemetryRepository } from "../js/practiceLab/practicePhysicalTelemetryScopedRepository.js";
import { mergePracticePhysicalTelemetryStat } from "../js/practiceLab/practicePhysicalTelemetryStat.js";
import { createPracticeResearchAssignmentRecord } from "../js/practiceLab/practiceResearchAssignment.js";
import { createPracticeResearchEnrollment } from "../js/practiceLab/practiceResearchEnrollment.js";
import { createPracticeResearchRepository } from "../js/practiceLab/practiceResearchRepository.js";
import { PRACTICE_RESEARCH_STUDY_ID } from "../js/practiceLab/practiceResearchConstants.js";
import { practiceResearchStudyRegistry } from "../js/practiceLab/practiceResearchStudyRegistry.js";
import { buildPracticeTargetBaseline } from "../js/practiceLab/practiceTreatmentBaseline.js";
import { createPracticeTreatmentEpisode } from "../js/practiceLab/practiceTreatmentEpisode.js";
import { resolvePracticeTreatmentIdentity } from "../js/practiceLab/practiceTreatmentRegistry.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

const FOREIGN_PROFILE = "practice-profile_pl39-foreign-profile-12345678";
const FOREIGN_CONTEXT = "practice-context_pl39-foreign-context-12345678";
const fixedNow = () => new Date("2026-09-14T12:00:00.000Z");
const fixedNowIso = "2026-09-14T12:00:00.000Z";

function foreignTreatmentEpisode() {
  const identity = resolvePracticeTreatmentIdentity({
    experiment: { id: "weak-keys", version: 1 },
    configuration: { policyVersion: 1, generatorVersion: 1 },
    contentPlan: { targetEntities: [{ entityType: "key", entityKey: "e", directTarget: true }] },
  });
  return createPracticeTreatmentEpisode({
    profileId: FOREIGN_PROFILE,
    contextId: FOREIGN_CONTEXT,
    treatmentSessionId: "practice-session_pl39-foreign-treatment-12345678",
    identity,
    plannedAt: fixedNowIso,
    baseline: buildPracticeTargetBaseline({
      observedAt: fixedNowIso,
      metrics: { quality: 70, qualityCoverage: 0.8, opportunityCount: 8, firstPassAccuracy: 0.94 },
      probeIdentity: { protocolFingerprint: identity.protocolFingerprint, familyIds: ["probe-pl39"], probeHash: "hash-pl39" },
    }),
  });
}

const researchTarget = {
  entityType: "key",
  statId: "stat:pl39-foreign-k",
  entityKey: "k",
  weaknessStatus: "confirmed",
  hierarchyStatus: "independent",
  stableAnchor: false,
  saturationStatus: "possible",
  learningHeadroom: 10,
  bossTargetUtility: 80,
  bossContentReady: true,
  focusedContentReady: true,
  canonicalTreatment: "weak-keys",
  retentionReviewState: "inactive",
  coachConflict: false,
  lastDirectPractisedAt: null,
  lastResearchAssignedAt: null,
};

test("PL39 direct-ID surfaces reject valid records owned by another Practice profile/context", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl39-isolation" });

  // Custom Text: inject a valid foreign row through the low-level store-facing repository,
  // then attack through the active-profile repository wrapper.
  const rawCustom = createPracticeCustomTextRepository({ dataStore: harness.dataStore, now: fixedNow });
  const foreignCustom = await rawCustom.createCustomText({
    profileId: FOREIGN_PROFILE,
    title: "Foreign private text",
    sourceText: "foreign profile sentinel content",
    dataLocale: "en",
  });
  assert.equal(await harness.repository.getCustomText(foreignCustom.customTextId), null);
  assert.equal(await harness.repository.deleteCustomText(foreignCustom.customTextId), false);
  assert.equal((await harness.dataStore.get("customTexts", foreignCustom.customTextId)).sourceText, foreignCustom.sourceText);

  // Coach plan: a raw foreign plan ID cannot be resolved or deleted through the active profile.
  const foreignCoach = createPracticeCoachPlanRecord({
    profileId: FOREIGN_PROFILE,
    contextId: FOREIGN_CONTEXT,
    localDayKey: "2026-09-14",
    requestedMinutes: 5,
    inputFingerprint: "pl39-foreign-plan",
    blocks: [],
    now: fixedNow,
  });
  await harness.dataStore.put("coachPlans", foreignCoach);
  assert.equal(await harness.repository.getCoachPlan(foreignCoach.coachPlanId), null);
  assert.equal(await harness.repository.deleteCoachPlan(foreignCoach.coachPlanId), false);
  assert.deepEqual(await harness.dataStore.get("coachPlans", foreignCoach.coachPlanId), foreignCoach);

  // Treatment episode: direct ID is active-profile/context scoped.
  const foreignTreatment = foreignTreatmentEpisode();
  await harness.dataStore.put("treatmentEpisodes", foreignTreatment);
  assert.equal(await harness.repository.getTreatmentEpisode(foreignTreatment.treatmentEpisodeId), null);
  assert.deepEqual(await harness.dataStore.get("treatmentEpisodes", foreignTreatment.treatmentEpisodeId), foreignTreatment);

  // Physical telemetry stat: the production scoped facade refuses a foreign raw stat ID.
  const foreignPhysical = mergePracticePhysicalTelemetryStat(null, {
    profileId: FOREIGN_PROFILE,
    contextId: FOREIGN_CONTEXT,
    entityType: "physical-key",
    entityKey: "KeyK",
    delta: {
      activationCount: 2,
      firstPassActivationCount: 2,
      firstPassCorrectActivationCount: 2,
      firstPassErrorOriginCount: 0,
      timingEligibleCount: 1,
      fluentCount: 1,
      disfluentCount: 0,
      residualSamples: [4],
      fluentLatencySamples: [90],
    },
    nowUtc: fixedNowIso,
  });
  await harness.dataStore.put("physicalTelemetryStats", foreignPhysical);
  const scopedPhysical = createScopedPracticePhysicalTelemetryRepository({
    dataStore: harness.dataStore,
    now: fixedNow,
    scopeProvider: () => ({ profileId: harness.profileId, contextId: harness.contextId }),
  });
  assert.equal(await scopedPhysical.getPhysicalTelemetryStat(foreignPhysical.physicalTelemetryStatId), null);
  assert.deepEqual(await harness.dataStore.get("physicalTelemetryStats", foreignPhysical.physicalTelemetryStatId), foreignPhysical);

  // Research enrollment + assignment: direct IDs cannot cross the active scope.
  const study = await practiceResearchStudyRegistry.getBound(PRACTICE_RESEARCH_STUDY_ID, 1, globalThis.crypto);
  const foreignEnrollment = createPracticeResearchEnrollment({
    profileId: FOREIGN_PROFILE,
    contextId: FOREIGN_CONTEXT,
    study,
    consented: true,
    cryptoImpl: globalThis.crypto,
    now: fixedNow,
  });
  const foreignAssignment = await createPracticeResearchAssignmentRecord({
    enrollment: foreignEnrollment,
    study,
    target: researchTarget,
    cryptoImpl: globalThis.crypto,
    now: fixedNow,
  });
  await harness.dataStore.put("researchEnrollments", foreignEnrollment);
  await harness.dataStore.put("researchAssignments", foreignAssignment);
  const scopedResearch = createPracticeResearchRepository({
    dataStore: harness.dataStore,
    now: fixedNow,
    scopeProvider: () => ({ profileId: harness.profileId, contextId: harness.contextId }),
  });
  assert.equal(await scopedResearch.getEnrollment(foreignEnrollment.researchEnrollmentId), null);
  assert.equal(await scopedResearch.getAssignment(foreignAssignment.researchAssignmentId), null);
  assert.deepEqual(await harness.dataStore.get("researchEnrollments", foreignEnrollment.researchEnrollmentId), foreignEnrollment);
  assert.deepEqual(await harness.dataStore.get("researchAssignments", foreignAssignment.researchAssignmentId), foreignAssignment);
});
