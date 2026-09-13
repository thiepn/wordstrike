import test from "node:test";
import assert from "node:assert/strict";
import { deletePracticeResearchEnrollmentRecords } from "../js/practiceLab/practiceResearchDeletion.js";
import { createPracticeTreatmentResponseState, mergePracticeTreatmentResponseSample } from "../js/practiceLab/practiceTreatmentResponseState.js";

function sample(treatmentEpisodeId, assignmentKind, responseValue) {
  return Object.freeze({
    treatmentEpisodeId,
    candidateId: `candidate-${treatmentEpisodeId}`,
    observedAt: "2026-09-14T18:00:00.000Z",
    localDayKey: "2026-09-14",
    assignmentKind,
    targetStatId: "stat:k",
    measurementGrade: "independent",
    primaryEligible: true,
    aggregateEligible: true,
    contaminated: false,
    evidenceGrade: "prospective-recorded-clean",
    responseValue,
    responseUnit: "quality-points",
    tradeoff: false,
    classification: "higher",
  });
}

test("PL38 research cleanup preserves session history and unrelated treatment evidence", async () => {
  const enrollment = { researchEnrollmentId: "enrollment-1", profileId: "profile-1", contextId: "context-1" };
  const researchBinding = { researchEnrollmentId: "enrollment-1", researchAssignmentId: "assignment-1", phase: "treatment" };
  const assignment = { researchAssignmentId: "assignment-1", treatment: { sessionId: "session-research" } };
  const randomizedEpisode = { treatmentEpisodeId: "episode-randomized", profileId: "profile-1", contextId: "context-1", assignmentKind: "randomized", treatment: { treatmentSessionId: "session-research" } };
  const manualEpisode = { treatmentEpisodeId: "episode-manual", profileId: "profile-1", contextId: "context-1", assignmentKind: "manual", treatment: { treatmentSessionId: "session-research" } };

  let responseState = createPracticeTreatmentResponseState({
    profileId: "profile-1",
    contextId: "context-1",
    treatmentFamilyKey: "one-boss-dose-v1",
    targetEntityType: "key",
    outcomeKey: "same-protocol-retest",
    delayBucket: "next-day",
    responseUnit: "quality-points",
    now: "2026-09-14T18:00:00.000Z",
  });
  responseState = mergePracticeTreatmentResponseSample(responseState, sample("episode-randomized", "randomized", 8));
  responseState = mergePracticeTreatmentResponseSample(responseState, sample("episode-manual", "manual", 3));

  const puts = [];
  const removes = [];
  const transaction = {
    async query(storeName, indexName, key) {
      if (storeName === "researchAssignments") return [assignment];
      if (storeName === "sessionSummaries") return [
        { sessionId: "session-research", profileId: "profile-1", contextId: "context-1", wpm: 91, researchBinding },
        { sessionId: "session-unrelated", profileId: "profile-1", contextId: "context-1", wpm: 84, researchBinding: null },
      ];
      if (storeName === "treatmentEpisodes" && indexName === "treatmentSessionId" && key === "session-research") return [randomizedEpisode, manualEpisode];
      if (storeName === "treatmentResponseStates") return [responseState];
      if (storeName === "researchAnalysisStates") return [{ researchAnalysisStateId: "analysis-1" }];
      return [];
    },
    async put(storeName, value) { puts.push([storeName, value]); },
    async delete(storeName, key) { removes.push([storeName, key]); },
  };

  const result = await deletePracticeResearchEnrollmentRecords({
    transaction,
    enrollment,
    researchEnrollmentId: "enrollment-1",
    updatedAt: "2026-09-15T18:00:00.000Z",
  });

  assert.deepEqual(result.sessionIds, ["session-research"]);
  assert.deepEqual(result.treatmentEpisodeIds, ["episode-randomized"]);
  const preservedSummary = puts.find(([storeName]) => storeName === "sessionSummaries")?.[1];
  assert.equal(preservedSummary.sessionId, "session-research");
  assert.equal(preservedSummary.wpm, 91);
  assert.equal(preservedSummary.researchBinding, null);

  assert.equal(removes.some(([storeName, key]) => storeName === "sessionSummaries" && key === "session-research"), false);
  assert.equal(removes.some(([storeName, key]) => storeName === "treatmentEpisodes" && key === "episode-randomized"), true);
  assert.equal(removes.some(([storeName, key]) => storeName === "treatmentEpisodes" && key === "episode-manual"), false);

  const rebuiltResponse = puts.find(([storeName]) => storeName === "treatmentResponseStates")?.[1];
  assert.equal(rebuiltResponse.samples.length, 1);
  assert.equal(rebuiltResponse.samples[0].treatmentEpisodeId, "episode-manual");
  assert.equal(rebuiltResponse.summary.count, 1);
  assert.equal(rebuiltResponse.summary.median, 3);

  assert.equal(removes.some(([storeName, key]) => storeName === "researchAssignments" && key === "assignment-1"), true);
  assert.equal(removes.some(([storeName, key]) => storeName === "researchAnalysisStates" && key === "analysis-1"), true);
  assert.equal(removes.some(([storeName, key]) => storeName === "researchEnrollments" && key === "enrollment-1"), true);
});