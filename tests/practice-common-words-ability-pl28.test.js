import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { selectPracticeCommonWordCheckForm, createPracticeCommonWordCheckPlan } from "../js/practiceLab/practiceCommonWordCheckPlan.js";
import { createPracticeCommonWordsDescriptor, createPracticeCommonWordCheckDescriptor } from "../js/practiceLab/practiceCommonWordsExperiment.js";
import { buildPracticeAbilityObservation } from "../js/practiceLab/practiceAbilityObservation.js";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

const readFormSet = async () => JSON.parse(await fs.readFile(new URL("../data/practice/common-words/en-v1/WS-COMMON-CHECK-EN-1.manifest.json", import.meta.url), "utf8"));

function foundation(contextId) {
  return {
    normalization: {
      context: { contextId },
      sessionSummary: { textDifficulty: { status: "full", difficultyIndex: 0, availableModelWeight: 1 } },
    },
    latency: {
      sessionSummary: {
        fluentMedianMs: 100,
        fluentMadMs: 10,
        interruptionRate: 0,
        coverage: { scope: "complete-session" },
      },
    },
  };
}

function completedCheckSession({ sessionId, profileId, contextId, completionReason = "word-target-complete" } = {}) {
  return {
    sessionId,
    profileId,
    contextId,
    status: completionReason === "manual-stop" ? "abandoned" : "completed",
    completionReason,
    completedAtUtc: "2026-09-09T12:00:00.000Z",
    localDayKey: "2026-09-09",
    wpm: 82,
    rawWpm: 85,
    accuracy: 97,
    activeDurationMs: 90_000,
    typedCharacterCount: 720,
    configuration: { correctionBehavior: "allow" },
  };
}

test("PL28 Check form selection is deterministic and target-blind for a fixed session/form set", async () => {
  const formSet = await readFormSet();
  const input = { sessionId: "practice-session_pl28-target-blind-12345678", formSet };
  const baseline = selectPracticeCommonWordCheckForm(input);
  const mutatedUserModels = selectPracticeCommonWordCheckForm({
    ...input,
    skillStats: [{ entityKey: baseline.words[0].lexicalKey, weaknessScore: 999, opportunityCount: 0 }],
    weakness: { [baseline.words[1].lexicalKey]: 1 },
    masterySnapshot: { entities: [{ entityType: "word", entityKey: baseline.words[2].lexicalKey, automaticity: { score: 0 } }] },
    saturation: { [baseline.words[3].lexicalKey]: 1 },
    breadthSnapshot: { overall: { observedPercent: 0 } },
    profileState: { preferredWords: baseline.words.slice(0, 20).map((word) => word.lexicalKey) },
  });
  assert.equal(mutatedUserModels.formId, baseline.formId);
  assert.equal(mutatedUserModels.formHash, baseline.formHash);
  assert.deepEqual(mutatedUserModels.words, baseline.words);
});

test("PL28 Check plan is fixed 200-word diagnostic content with no target entities and no resumability", async () => {
  const formSet = await readFormSet();
  const prepared = createPracticeCommonWordCheckPlan({
    sessionId: "practice-session_pl28-plan-12345678",
    profileId: "practice-profile_pl28-profile-12345678",
    contextId: "practice-context_pl28-context-12345678",
    formSet,
  });
  assert.equal(prepared.plan.wordCount, 200);
  assert.deepEqual(prepared.plan.bandCounts, { core: 50, frequent: 50, common: 50, broad: 50 });
  assert.equal(prepared.contentPlan.completion.mode, "word-count");
  assert.equal(prepared.contentPlan.completion.value, 200);
  assert.equal(prepared.contentPlan.metadata.partition, "diagnostic");
  assert.equal(prepared.contentPlan.metadata.evidenceRole, "diagnostic");
  assert.equal(prepared.contentPlan.metadata.commonWords.resumable, false);
  assert.deepEqual(prepared.contentPlan.targetEntities, []);
});

test("PL28 completed valid Breadth Check yields one eligible canonical PL13 common-words observation while Practice requests none", () => {
  const identity = {
    sessionId: "practice-session_pl28-ability-12345678",
    profileId: "practice-profile_pl28-profile-12345678",
    contextId: "practice-context_pl28-context-12345678",
  };
  const session = completedCheckSession(identity);
  const check = buildPracticeAbilityObservation({
    session,
    experiment: createPracticeCommonWordCheckDescriptor(),
    foundationAnalysis: foundation(identity.contextId),
    contentPlan: { targetEntities: [] },
    evidenceRole: "diagnostic",
  });
  assert.equal(check.status, "eligible");
  assert.equal(check.channel, "common-words");
  assert.equal(check.observation.channel, "common-words");
  assert.equal(check.observation.sessionId, identity.sessionId);
  assert.equal(check.observation.sourceRole, "diagnostic");
  assert.equal(check.observation.wpm, 82);
  assert.equal(check.observation.rawWpm, 85);
  assert.ok(Number.isFinite(check.observation.measurementSigmaLog));

  const practice = buildPracticeAbilityObservation({
    session,
    experiment: createPracticeCommonWordsDescriptor(),
    foundationAnalysis: foundation(identity.contextId),
    contentPlan: { targetEntities: [] },
    evidenceRole: "training",
  });
  assert.equal(practice.status, "not-requested");
  assert.equal(practice.observation, null);
});

test("PL28 manual-stop Check is not PL13-eligible", () => {
  const identity = {
    sessionId: "practice-session_pl28-stop-12345678",
    profileId: "practice-profile_pl28-profile-12345678",
    contextId: "practice-context_pl28-context-12345678",
  };
  const result = buildPracticeAbilityObservation({
    session: completedCheckSession({ ...identity, completionReason: "manual-stop" }),
    experiment: createPracticeCommonWordCheckDescriptor(),
    foundationAnalysis: foundation(identity.contextId),
    contentPlan: { targetEntities: [] },
    evidenceRole: "diagnostic",
  });
  assert.equal(result.status, "not-eligible");
  assert.equal(result.observation, null);
  assert.ok(result.reasons.includes("manual-stop"));
});

test("PL28 duplicate completed Check session is exactly-once in canonical PL13 repository state", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl28-common-words-idempotency" });
  const sessionId = createPracticeId("session", { uuid: () => "pl28-common-words-session-12345678" });
  const session = completedCheckSession({ sessionId, profileId: harness.profileId, contextId: harness.contextId });
  const assessment = buildPracticeAbilityObservation({
    session,
    experiment: createPracticeCommonWordCheckDescriptor(),
    foundationAnalysis: foundation(harness.contextId),
    contentPlan: { targetEntities: [] },
    evidenceRole: "diagnostic",
  });
  assert.equal(assessment.status, "eligible");
  const summary = createDefaultSessionSummary({
    sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    experimentId: "common-words-check",
    now: () => new Date(session.completedAtUtc),
    overrides: {
      status: "completed",
      completionReason: "word-target-complete",
      startedAtUtc: "2026-09-09T11:58:30.000Z",
      completedAtUtc: session.completedAtUtc,
      localDayKey: session.localDayKey,
      plannedDurationMs: 0,
      activeDurationMs: session.activeDurationMs,
      wallDurationMs: session.activeDurationMs,
      configuration: { correctionBehavior: "allow" },
      targetEntities: [],
      typedCharacterCount: session.typedCharacterCount,
      correctCharacterCount: Math.round(session.typedCharacterCount * 0.97),
      wordCount: 200,
      completedWordCount: 200,
      wpm: session.wpm,
      rawWpm: session.rawWpm,
      accuracy: session.accuracy,
      abilityMeasurementSummary: assessment.sessionSummary,
    },
  });
  const first = await harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, abilityObservation: assessment.observation });
  assert.equal(first.committed, true);
  assert.equal(first.abilityUpdated, true);
  const afterFirst = await harness.repository.getAbilityState(harness.profileId, harness.contextId, "common-words");
  assert.equal(afterFirst.evidence.observationCount, 1);
  assert.equal(afterFirst.recentObservations.length, 1);

  const replay = await harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, abilityObservation: assessment.observation });
  assert.equal(replay.idempotent, true);
  const afterReplay = await harness.repository.getAbilityState(harness.profileId, harness.contextId, "common-words");
  assert.equal(afterReplay.evidence.observationCount, 1);
  assert.equal(afterReplay.recentObservations.length, 1);
});
