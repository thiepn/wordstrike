import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultPracticeAssessmentRun } from "../js/practiceLab/practiceAssessmentRun.js";
import { createDefaultPracticeContext, createDefaultPracticeProfile, createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { getPracticeAssessmentBlocksForDepth } from "../js/practiceLab/practiceAssessmentConstants.js";
import { createPracticeId, hashPracticeContent } from "../js/practiceLab/practiceIds.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function plan(runId) {
  const blocks = getPracticeAssessmentBlocksForDepth("quick").map((block) => ({
    ...block,
    diagnosticFormSetId: block.blockKind === "diagnostic" ? `en:${block.blockId}:v1` : null,
    diagnosticFormId: block.blockKind === "diagnostic" ? `form-${block.blockId}` : null,
    evaluationReservationId: block.blockKind === "benchmark" ? "practice-evaluation-reservation_cross-12345678" : null,
    evaluationArtifactId: block.blockKind === "benchmark" ? "suite-en" : null,
    evaluationArtifactVersion: block.blockKind === "benchmark" ? 1 : null,
    expectedPartition: block.blockKind === "benchmark" ? "benchmark" : "diagnostic",
    expectedExperimentId: block.blockKind === "benchmark" ? "full-assessment-benchmark" : "full-assessment-diagnostic",
    targetEntities: [],
  }));
  const value = { planVersion: 1, assessmentRunId: runId, language: "en", depth: "quick", protocolVersion: 1, createdAt: "2026-09-07T00:00:00.000Z", blocks };
  value.planHash = hashPracticeContent(JSON.stringify({ planVersion: value.planVersion, assessmentRunId: value.assessmentRunId, language: value.language, depth: value.depth, protocolVersion: value.protocolVersion, createdAt: value.createdAt, blocks: value.blocks }));
  return value;
}

test("PL19 assessment history queries never return another profile's run", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl19-cross-profile" });
  const profileB = createPracticeId("profile", { uuid: () => "pl19-profile-b-12345678" });
  const contextB = createPracticeId("context", { uuid: () => "pl19-context-b-12345678" });
  await harness.dataStore.put("profiles", createDefaultPracticeProfile({ profileId: profileB, now: () => new Date("2026-09-07T00:00:00.000Z") }));
  await harness.dataStore.put("contexts", createDefaultPracticeContext({ profileId: profileB, contextId: contextB, now: () => new Date("2026-09-07T00:00:00.000Z") }));

  const runId = "practice-assessment_profile-b-12345678";
  const foreignRun = createDefaultPracticeAssessmentRun({ assessmentRunId: runId, profileId: profileB, contextId: contextB, depth: "quick", plan: plan(runId), now: () => new Date("2026-09-07T00:00:00.000Z") });
  await harness.repository.saveAssessmentRun(foreignRun);

  assert.deepEqual(await harness.repository.listAssessmentRuns(harness.profileId), []);
  assert.equal((await harness.repository.listAssessmentRuns(profileB)).length, 1);
});

test("PL19 atomic child commit rejects a parent run from another profile before any session write", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl19-cross-commit" });
  const profileB = createPracticeId("profile", { uuid: () => "pl19-commit-profile-b-12345678" });
  const contextB = createPracticeId("context", { uuid: () => "pl19-commit-context-b-12345678" });
  await harness.dataStore.put("profiles", createDefaultPracticeProfile({ profileId: profileB, now: () => new Date("2026-09-07T00:00:00.000Z") }));
  await harness.dataStore.put("contexts", createDefaultPracticeContext({ profileId: profileB, contextId: contextB, now: () => new Date("2026-09-07T00:00:00.000Z") }));
  const runId = "practice-assessment_foreign-parent-12345678";
  const base = createDefaultPracticeAssessmentRun({ assessmentRunId: runId, profileId: profileB, contextId: contextB, depth: "quick", plan: plan(runId), now: () => new Date("2026-09-07T00:00:00.000Z") });
  const active = { ...base, status: "active", startedAt: "2026-09-07T00:00:01.000Z", blocks: base.blocks.map((block, i) => i === 0 ? { ...block, status: "active", childSessionId: "practice-session_cross-child-12345678", startedAt: "2026-09-07T00:00:02.000Z" } : block) };
  await harness.repository.saveAssessmentRun(active);

  const sessionId = "practice-session_cross-child-12345678";
  const summary = createDefaultSessionSummary({
    sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    now: () => new Date("2026-09-07T00:01:02.000Z"),
    overrides: {
      status: "completed",
      completionReason: "time-complete",
      startedAtUtc: "2026-09-07T00:00:02.000Z",
      completedAtUtc: "2026-09-07T00:01:02.000Z",
      assessmentBinding: { assessmentRunId: runId, blockId: "benchmark-natural", blockOrdinal: 1, protocolVersion: 1 },
    },
  });
  await assert.rejects(
    () => harness.repository.commitCompletedPracticeSession({
      sessionSummary: summary,
      assessmentBlockDelta: {
        deltaVersion: 1,
        assessmentRunId: runId,
        blockId: "benchmark-natural",
        blockOrdinal: 1,
        sessionId,
        profileId: harness.profileId,
        contextId: harness.contextId,
        completedAtUtc: "2026-09-07T00:01:02.000Z",
        status: "completed",
        blockMetrics: null,
        coverage: null,
        evaluationSummary: null,
        diagnosticFormId: null,
        diagnosticFreshness: null,
      },
    }),
    /parent run is missing or mismatched|profile/i,
  );
  assert.equal(await harness.repository.getSessionSummary(sessionId), null);
});
