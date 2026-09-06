import assert from "node:assert/strict";
import { test } from "node:test";
import { createPracticeSessionEngine } from "../js/practiceLab/practiceSessionEngine.js";
import { createPracticeContextFingerprint, createPracticeContextRecord } from "../js/practiceLab/practiceContext.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function engineFor(harness) {
  return createPracticeSessionEngine({
    repository: harness.repository,
    sessionId: harness.sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
}

async function typeCorrect(engine, harness, count, latencyMs = 100) {
  for (let index = 0; index < count; index += 1) {
    if (index > 0) await harness.time.advance(latencyMs, { runTimers: false });
    const outcome = engine.handleInput(harness.input("character", "a"));
    assert.equal(outcome.accepted, true);
  }
}

test("PL10 generic normalization remains canonical inside the current PL18 session envelope", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl10-generic", text: "a".repeat(40) });
  const engine = engineFor(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  await typeCorrect(engine, harness, 26);
  const metrics = engine.getMetricsSnapshot();
  const result = await engine.complete("manual-stop");
  assert.equal(result.summary.recordVersion, 11);
  assert.equal(result.summary.retentionReviewSummary, null);
  assert.equal(result.summary.evaluationSummary, null);
  assert.equal(result.summary.wpm, metrics.wpm);
  assert.equal(result.summary.rawWpm, metrics.rawWpm);
  assert.equal(result.summary.accuracy, metrics.accuracy);
  assert.equal(result.summary.normalizationSummary.analysisVersion, 1);
  assert.equal(result.summary.normalizationSummary.textDifficulty.status, "partial");
  assert.equal(result.summary.normalizationSummary.textDifficulty.availableModelWeight, 0.62);
  assert.equal(result.summary.normalizationSummary.transitionNormalization.status, "normalized");
  assert.equal(Object.hasOwn(result.summary.normalizationSummary, "normalizedTransitions"), false);
  assert.equal(Object.hasOwn(result.summary.normalizationSummary, "features"), false);
  assert.ok(result.summary.skillEvidenceSummary);
  assert.equal(Object.hasOwn(result.summary.skillEvidenceSummary, "deltas"), false);
});

test("PL10 experiment analyzers receive frozen PL18 foundationAnalysis v9 and cannot own normalization or canonical skill evidence", async () => {
  let received = null;
  let mutationThrew = false;
  const harness = await createPracticeSessionHarness({
    suffix: "pl10-analyzer",
    text: "a".repeat(40),
    experimentOverrides: {
      async analyzeResult(input) {
        received = input;
        try { input.foundationAnalysis.normalization.sessionSummary.textDifficulty.difficultyIndex = 999; } catch { mutationThrew = true; }
        return {
          normalizationSummary: { fake: true },
          skillEvidenceSummary: { fake: true },
          updatedSkillStats: [{ fake: true }],
          beforeMetrics: { analyzerWorked: true },
        };
      },
    },
  });
  const engine = engineFor(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  await typeCorrect(engine, harness, 26);
  const result = await engine.complete("manual-stop");
  assert.equal(received.foundationAnalysis.version, 9);
  assert.ok(received.foundationAnalysis.latency);
  assert.ok(received.foundationAnalysis.errors);
  assert.ok(received.foundationAnalysis.normalization);
  assert.ok(received.foundationAnalysis.skills);
  assert.equal(received.foundationAnalysis.retention.status, "not-requested");
  assert.equal(received.foundationAnalysis.evaluation.status, "not-requested");
  assert.equal(Object.isFrozen(received.foundationAnalysis.normalization), true);
  assert.equal(Object.isFrozen(received.foundationAnalysis.skills), true);
  assert.equal(mutationThrew, true);
  assert.equal(result.summary.beforeMetrics.analyzerWorked, true);
  assert.equal(result.summary.normalizationSummary.fake, undefined);
  assert.equal(result.summary.skillEvidenceSummary.fake, undefined);
});

test("PL10 freezes exact PL5 context identity at prepare even if profile active context later changes", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl10-context-freeze", text: "aaaaaa" });
  const originalContext = await harness.repository.getPracticeContext(harness.contextId);
  const engine = engineFor(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });

  const secondContext = createPracticeContextRecord({
    contextId: createPracticeId("context", { uuid: () => "pl10-second-context-12345678" }),
    profileId: harness.profileId,
    dataLocale: "en",
    keyboardLayout: "qwertz",
    inputMethod: "unknown",
    now: harness.time.wallClock,
  });
  await harness.repository.savePracticeContext(secondContext);
  const profile = await harness.repository.getPracticeProfile();
  await harness.repository.savePracticeProfile({ ...profile, activeContextId: secondContext.contextId, updatedAt: harness.time.wallIso });

  await engine.start();
  engine.handleInput(harness.input("character", "a"));
  const result = await engine.complete("manual-stop");
  assert.equal(result.summary.contextId, harness.contextId);
  assert.equal(result.summary.normalizationSummary.context.contextFingerprint, originalContext.fingerprint);
  assert.equal(result.summary.normalizationSummary.context.keyboardLayout, originalContext.keyboardLayout);
  assert.notEqual(result.summary.normalizationSummary.context.contextFingerprint, secondContext.fingerprint);
});

test("PL10 relies on PL5 context immutability: identity fields cannot be relabeled but lastUsedAt may change", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl10-context-immutable" });
  const context = await harness.repository.getPracticeContext(harness.contextId);
  const relabeled = {
    ...context,
    keyboardLayout: "qwertz",
    fingerprint: createPracticeContextFingerprint({
      dataLocale: context.dataLocale,
      keyboardLayout: "qwertz",
      inputMethod: context.inputMethod,
      hardwareProfileId: context.hardwareProfileId,
    }),
  };
  await assert.rejects(() => harness.repository.savePracticeContext(relabeled), /identity is immutable/i);
  const nextLastUsedAt = "2026-07-05T18:43:13.000Z";
  await harness.repository.savePracticeContext({ ...context, lastUsedAt: nextLastUsedAt, updatedAt: nextLastUsedAt });
  assert.equal((await harness.repository.getPracticeContext(context.contextId)).lastUsedAt, nextLastUsedAt);
});
