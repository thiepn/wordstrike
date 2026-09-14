import test from "node:test";
import assert from "node:assert/strict";
import { advancePracticeResearchEnrollmentForAssignment, createPracticeResearchAssignmentRecord } from "../js/practiceLab/practiceResearchAssignment.js";
import { PRACTICE_RESEARCH_STUDY_ID } from "../js/practiceLab/practiceResearchConstants.js";
import { createPracticeResearchEnrollment } from "../js/practiceLab/practiceResearchEnrollment.js";
import { createPracticeResearchRepository } from "../js/practiceLab/practiceResearchRepository.js";
import { practiceResearchStudyRegistry } from "../js/practiceLab/practiceResearchStudyRegistry.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

const now = () => new Date("2026-09-14T13:00:00.000Z");
const target = { entityType:"key", statId:"stat:pl39-race-k", entityKey:"k", weaknessStatus:"confirmed", hierarchyStatus:"independent", stableAnchor:false, saturationStatus:"possible", learningHeadroom:10, bossTargetUtility:80, bossContentReady:true, focusedContentReady:true, canonicalTreatment:"weak-keys", retentionReviewState:"inactive", coachConflict:false, lastDirectPractisedAt:null, lastResearchAssignedAt:null };

test("PL39 concurrent Research assignment and reservation consume each slot once", async () => {
  const h = await createPracticeSessionHarness({ suffix: "pl39-research-concurrent" });
  const study = await practiceResearchStudyRegistry.getBound(PRACTICE_RESEARCH_STUDY_ID, 1, globalThis.crypto);
  const enrollment = createPracticeResearchEnrollment({ profileId:h.profileId, contextId:h.contextId, study, consented:true, now:now(), cryptoImpl:globalThis.crypto });
  await h.dataStore.put("researchEnrollments", enrollment);
  const assignment = await createPracticeResearchAssignmentRecord({ enrollment, study, target, now:now(), cryptoImpl:globalThis.crypto });
  const updatedEnrollment = advancePracticeResearchEnrollmentForAssignment(enrollment, assignment);
  const repository = createPracticeResearchRepository({ dataStore:h.dataStore, now, scopeProvider:() => ({ profileId:h.profileId, contextId:h.contextId }) });
  const created = await Promise.all([
    repository.persistNewAssignment({ enrollment, assignment, updatedEnrollment }),
    repository.persistNewAssignment({ enrollment, assignment, updatedEnrollment }),
  ]);
  assert.equal(created.filter((entry) => entry.created === true).length, 1);
  assert.equal(created.filter((entry) => entry.created === false).length, 1);
  assert.equal((await repository.listAssignments(enrollment.researchEnrollmentId)).length, 1);
  assert.equal((await repository.getEnrollment(enrollment.researchEnrollmentId)).assignmentsCreated, 1);

  const reserved = await Promise.allSettled([
    repository.reserveProbeSession(assignment.researchAssignmentId, "baseline", "practice-session_probe-a-12345678"),
    repository.reserveProbeSession(assignment.researchAssignmentId, "baseline", "practice-session_probe-b-12345678"),
  ]);
  assert.equal(reserved.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(reserved.filter((entry) => entry.status === "rejected").length, 1);
  const failure = reserved.find((entry) => entry.status === "rejected");
  assert.equal(failure.reason?.code, "PRACTICE_RESEARCH_SESSION_CONFLICT");
});
