import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPracticeSessionEngine,
  restorePracticeSessionEngine,
} from "../js/practiceLab/practiceSessionEngine.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function engineFor(harness, sessionId = harness.sessionId) {
  return createPracticeSessionEngine({
    repository: harness.repository,
    sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
}

async function typeText(engine, harness, text, latencyMs = 100) {
  const chars = [...text];
  for (let index = 0; index < chars.length; index += 1) {
    if (index > 0) await harness.time.advance(latencyMs, { runTimers: false });
    const ch = chars[index];
    const outcome = engine.handleInput(harness.input(ch === " " ? "space" : "character", ch));
    assert.equal(outcome.accepted, true, `expected ${JSON.stringify(ch)} at ${index} to be accepted`);
  }
}

test("PL11 canonical deltas remain intact inside PL17 foundation v8/session v10, and experiment full-stat output cannot replace evidence", async () => {
  let foundation = null;
  const harness = await createPracticeSessionHarness({
    suffix: "pl11-session-foundation",
    text: "abcdefghijklmnopqrstuvwxzy",
    experimentOverrides: {
      async analyzeResult(input) {
        foundation = input.foundationAnalysis;
        return {
          updatedSkillStats: [{ statId: "practice-stat_fake", weaknessScore: 999 }],
          skillEvidenceSummary: { fake: true },
          beforeMetrics: { analyzerObservedSkills: Boolean(input.foundationAnalysis.skills) },
        };
      },
    },
  });
  const engine = engineFor(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  await typeText(engine, harness, harness.contentPlan.text);
  const result = await engine.complete("manual-stop");
  assert.equal(foundation.version, 8);
  assert.equal(foundation.retention.status, "not-requested");
  assert.equal(Object.isFrozen(foundation.skills), true);
  assert.ok(foundation.skills.deltas.length > 0);
  assert.equal(result.summary.recordVersion, 10);
  assert.equal(result.summary.retentionReviewSummary, null);
  assert.equal(result.summary.beforeMetrics.analyzerObservedSkills, true);
  assert.equal(result.summary.skillEvidenceSummary.fake, undefined);
  assert.equal(Object.hasOwn(result.summary.skillEvidenceSummary, "deltas"), false);
  assert.equal(JSON.stringify(result.summary.skillEvidenceSummary).includes("entityKey"), false);
  const stats = await harness.repository.listSkillStats(harness.profileId, harness.contextId);
  assert.ok(stats.length > 0);
  assert.ok(stats.every((stat) => stat.recordVersion === 3));
  assert.equal(stats.some((stat) => stat.statId === "practice-stat_fake"), false);
});

test("PL11 session-summary idempotency prevents skill evidence from being applied twice and conflicting duplicate fails", async () => {
  let foundation = null;
  const harness = await createPracticeSessionHarness({
    suffix: "pl11-idempotent",
    text: "abcdef",
    experimentOverrides: {
      async analyzeResult(input) {
        foundation = input.foundationAnalysis;
        return {};
      },
    },
  });
  const engine = engineFor(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  await typeText(engine, harness, "abcdef");
  const result = await engine.complete("manual-stop");
  const before = await harness.repository.getSkillStat(harness.profileId, harness.contextId, "key", "a");
  assert.equal(before.evidence.opportunities.count, 1);
  const replay = await harness.repository.commitCompletedPracticeSession({
    sessionSummary: result.summary,
    skillEvidenceDeltas: foundation.skills.deltas,
  });
  assert.equal(replay.idempotent, true);
  const after = await harness.repository.getSkillStat(harness.profileId, harness.contextId, "key", "a");
  assert.equal(after.evidence.opportunities.count, 1);

  const conflicting = { ...result.summary, recommendationIds: ["conflicting-session-payload"] };
  await assert.rejects(
    () => harness.repository.commitCompletedPracticeSession({ sessionSummary: conflicting, skillEvidenceDeltas: foundation.skills.deltas }),
    /different completed Practice session|duplicate/i,
  );
  const afterConflict = await harness.repository.getSkillStat(harness.profileId, harness.contextId, "key", "a");
  assert.equal(afterConflict.evidence.opportunities.count, 1);
});

test("PL11 rejects arbitrary direct full skill-stat writes even on the canonical commit API", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl11-no-full-stat", text: "abc" });
  const engine = engineFor(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  await typeText(engine, harness, "abc");
  const result = await engine.complete("manual-stop");
  await assert.rejects(
    () => harness.repository.commitCompletedPracticeSession({
      sessionSummary: result.summary,
      updatedSkillStats: [{ statId: "practice-stat_illegal" }],
    }),
    /full skill-stat replacement is disabled/i,
  );
});

test("PL11 invalid evidence batch rolls back before creating a session or any skill stat", async () => {
  let foundation = null;
  const sourceHarness = await createPracticeSessionHarness({
    suffix: "pl11-atomic-source",
    text: "abcdef",
    experimentOverrides: { async analyzeResult(input) { foundation = input.foundationAnalysis; return {}; } },
  });
  const sourceEngine = engineFor(sourceHarness);
  await sourceEngine.prepare({ experiment: sourceHarness.experiment, configuration: {}, contentPlan: sourceHarness.contentPlan });
  await sourceEngine.start();
  await typeText(sourceEngine, sourceHarness, "abcdef");
  const sourceResult = await sourceEngine.complete("manual-stop");

  const nextSessionId = createPracticeId("session", { uuid: () => "pl11-atomic-new-session-123456" });
  const nextSummary = { ...sourceResult.summary, sessionId: nextSessionId, recommendationIds: [] };
  const deltas = foundation.skills.deltas.slice(0, 4).map((delta) => ({ ...delta, sessionId: nextSessionId }));
  assert.ok(deltas.length >= 4);
  deltas[3] = { ...deltas[3], statId: "practice-stat_wrong" };
  const beforeCount = (await sourceHarness.repository.listSessionSummaries()).length;
  await assert.rejects(
    () => sourceHarness.repository.commitCompletedPracticeSession({ sessionSummary: nextSummary, skillEvidenceDeltas: deltas }),
    /skill evidence batch failed validation|statId/i,
  );
  assert.equal((await sourceHarness.repository.listSessionSummaries()).length, beforeCount);
  assert.equal(await sourceHarness.repository.getSessionSummary(nextSessionId), null);
});

test("PL11 checkpoint v3 preserves first-pass tracker state so a corrected retry after restore is not a second opportunity", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl11-restore", text: "abcd" });
  const engine = engineFor(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: { correctionBehavior: "allow" }, contentPlan: harness.contentPlan });
  await engine.start();
  engine.handleInput(harness.input("character", "a"));
  await harness.time.advance(15_000);
  await engine.pause("manual");
  const checkpoint = await harness.repository.getActiveCheckpoint();
  assert.equal(checkpoint.recordVersion, 3);
  assert.ok(checkpoint.metricsSnapshot.skillEvidenceTrackerSnapshot);
  assert.equal(checkpoint.metricsSnapshot.skillEvidenceTrackerSnapshot.opportunityTracker.maxFirstAttemptCursor, 1);

  const restored = await restorePracticeSessionEngine({
    checkpoint,
    experimentDescriptor: harness.experiment,
    repository: harness.repository,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await restored.resume();
  await harness.time.advance(100, { runTimers: false });
  restored.handleInput(harness.input("character", "b"));
  restored.handleInput(harness.input("backspace", ""));
  restored.handleInput(harness.input("character", "b"));
  restored.handleInput(harness.input("character", "c"));
  restored.handleInput(harness.input("character", "d"));
  await restored.complete("manual-stop");
  const b = await harness.repository.getSkillStat(harness.profileId, harness.contextId, "key", "b");
  assert.equal(b.evidence.opportunities.count, 1);
});

test("PL11 historical checkpoint without tracker restores with partial-session accuracy coverage", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl11-legacy-restore", text: "abcd" });
  const engine = engineFor(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: { correctionBehavior: "allow" }, contentPlan: harness.contentPlan });
  await engine.start();
  engine.handleInput(harness.input("character", "a"));
  await harness.time.advance(15_000);
  await engine.pause("manual");
  const checkpoint = await harness.repository.getActiveCheckpoint();
  const legacyLike = {
    ...checkpoint,
    metricsSnapshot: { ...checkpoint.metricsSnapshot, skillEvidenceTrackerSnapshot: null },
  };
  const restored = await restorePracticeSessionEngine({
    checkpoint: legacyLike,
    experimentDescriptor: harness.experiment,
    repository: harness.repository,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await restored.resume();
  restored.handleInput(harness.input("character", "b"));
  restored.handleInput(harness.input("character", "c"));
  restored.handleInput(harness.input("character", "d"));
  const result = await restored.complete("manual-stop");
  assert.equal(result.summary.skillEvidenceSummary.accuracyScope, "partial-session");
});

test("PL11 content append extends entity resolution without resetting first-attempt history", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl11-append", text: "ab" });
  const engine = engineFor(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: { correctionBehavior: "allow" }, contentPlan: harness.contentPlan });
  await engine.start();
  engine.handleInput(harness.input("character", "a"));
  engine.handleInput(harness.input("backspace", ""));
  engine.handleInput(harness.input("character", "a"));
  const appended = engine.appendContent({ text: "cd" });
  assert.equal(appended.content.expectedLength, 4);
  engine.handleInput(harness.input("character", "b"));
  engine.handleInput(harness.input("character", "c"));
  engine.handleInput(harness.input("character", "d"));
  await engine.complete("manual-stop");
  for (const key of ["a", "b", "c", "d"]) {
    const stat = await harness.repository.getSkillStat(harness.profileId, harness.contextId, "key", key);
    assert.ok(stat);
    assert.equal(stat.evidence.opportunities.count, 1);
  }
});

test("PL11 meaningful abandoned sessions contribute observation evidence while tiny abandonment does not persist skills", async () => {
  const meaningful = await createPracticeSessionHarness({ suffix: "pl11-abandoned", text: "a".repeat(30) });
  const engine = engineFor(meaningful);
  await engine.prepare({ experiment: meaningful.experiment, configuration: {}, contentPlan: meaningful.contentPlan });
  await engine.start();
  await typeText(engine, meaningful, "a".repeat(20), 50);
  const abandoned = await engine.abandon("manual-stop");
  assert.equal(abandoned.summary.status, "abandoned");
  const stat = await meaningful.repository.getSkillStat(meaningful.profileId, meaningful.contextId, "key", "a");
  assert.equal(stat.evidence.observation.abandonedSessionCount, 1);

  const tiny = await createPracticeSessionHarness({ suffix: "pl11-tiny-abandoned", text: "abcdef" });
  const tinyEngine = engineFor(tiny);
  await tinyEngine.prepare({ experiment: tiny.experiment, configuration: {}, contentPlan: tiny.contentPlan });
  await tinyEngine.start();
  tinyEngine.handleInput(tiny.input("character", "a"));
  const tinyResult = await tinyEngine.abandon("manual-stop");
  assert.equal(tinyResult.persisted, false);
  assert.equal((await tiny.repository.listSkillStats(tiny.profileId, tiny.contextId)).length, 0);
});
