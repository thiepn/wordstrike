import assert from "node:assert/strict";
import { test } from "node:test";
import { createPracticeLearningService } from "../js/practiceLab/practiceLearningService.js";

test("PL16 cached learning evaluation recomputes the rolling 14-day dose window as time advances", async () => {
  const profileId = "practice-profile_pl16-time-profile-12345678";
  const contextId = "practice-context_pl16-time-context-12345678";
  const learningStates = [{
    learningStateId: "practice-learning_pl16-time-learning-12345678",
    statId: "practice-stat_pl16-time-stat-12345678",
    profileId,
    contextId,
    updatedAt: "2026-09-01T10:00:00.000Z",
    acquisition: {
      observations: [{
        sessionId: "practice-session_pl16-time-session-12345678",
        completedAtUtc: "2026-09-01T10:00:00.000Z",
        localDayKey: "2026-09-01",
        doseUnits: 6,
      }],
    },
  }];
  const repository = {
    async getPracticeContext(requestedContextId) {
      return requestedContextId === contextId ? { profileId, contextId } : null;
    },
    async listLearningStates(requestedProfileId, requestedContextId) {
      return requestedProfileId === profileId && requestedContextId === contextId ? learningStates : [];
    },
    async listSkillStats() { return []; },
    async getAbilityState() { return null; },
  };
  let current = new Date("2026-09-05T10:00:00.000Z");
  const service = createPracticeLearningService({ repository, now: () => new Date(current) });

  const first = await service.buildContextLearningSnapshot({ profileId, contextId });
  assert.equal(first.diagnostics.recentDose.recentDoseUnits, 6);
  assert.equal(first.diagnostics.recentDose.recentTrainingDays, 1);
  assert.equal(service.getCacheSize(), 1);

  current = new Date("2026-09-20T10:00:00.000Z");
  const second = await service.buildContextLearningSnapshot({ profileId, contextId });
  assert.equal(second.diagnostics.recentDose.recentDoseUnits, 0);
  assert.equal(second.diagnostics.recentDose.recentTrainingDays, 0);
  assert.equal(service.getCacheSize(), 1);
});
