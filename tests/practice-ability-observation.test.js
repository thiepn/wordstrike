import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRACTICE_ABILITY_CHANNELS,
  PRACTICE_ABILITY_OBSERVATION_VERSION,
} from "../js/practiceLab/practiceAbilityConstants.js";
import { PRACTICE_ABILITY_POLICY_V1 } from "../js/practiceLab/practiceAbilityPolicy.js";
import { buildPracticeAbilityObservation } from "../js/practiceLab/practiceAbilityObservation.js";
import {
  createGenericPracticeExperimentDescriptor,
  validatePracticeExperimentDescriptor,
  validatePracticeSessionConfiguration,
} from "../js/practiceLab/practiceSessionContract.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";

const profileId = createPracticeId("profile", { uuid: () => "pl13-observation-profile-12345678" });
const contextId = createPracticeId("context", { uuid: () => "pl13-observation-context-12345678" });
const sessionId = createPracticeId("session", { uuid: () => "pl13-observation-session-12345678" });
const completedAtUtc = "2026-09-05T10:00:00.000Z";

function foundation({ difficultyIndex = 0, difficultyStatus = "full", coverage = 1, fluentMedianMs = 100, fluentMadMs = 0, interruptionRate = 0, traceScope = "complete-session" } = {}) {
  return {
    normalization: {
      context: { contextId },
      sessionSummary: { textDifficulty: { status: difficultyStatus, difficultyIndex, availableModelWeight: coverage } },
    },
    latency: {
      sessionSummary: {
        fluentMedianMs,
        fluentMadMs,
        interruptionRate,
        coverage: { scope: traceScope },
      },
    },
  };
}

function input({
  channel = "controlled-speed",
  role = "benchmark",
  status = "completed",
  completionReason = "time-complete",
  duration = 60_000,
  chars = 200,
  accuracy = 99,
  wpm = 100,
  rawWpm = 105,
  correctionBehavior = "allow",
  targets = [],
  foundationAnalysis = foundation(),
} = {}) {
  return {
    session: {
      sessionId,
      profileId,
      contextId,
      status,
      completionReason,
      completedAtUtc,
      localDayKey: "2026-09-05",
      wpm,
      rawWpm,
      accuracy,
      activeDurationMs: duration,
      typedCharacterCount: chars,
      configuration: { correctionBehavior },
    },
    experiment: { abilityChannel: channel },
    foundationAnalysis,
    contentPlan: { targetEntities: targets },
    evidenceRole: role,
  };
}

function build(overrides = {}) {
  return buildPracticeAbilityObservation({ ...input(overrides), policy: PRACTICE_ABILITY_POLICY_V1 });
}

const approx = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(actual), Math.abs(expected)), `${actual} != ${expected}`);

test("PL13 canonical channels and trusted experiment declaration are fixed", () => {
  assert.deepEqual(PRACTICE_ABILITY_CHANNELS, [
    "cold-natural-text", "controlled-speed", "common-words", "burst", "endurance", "punctuation", "numbers-symbols",
  ]);
  assert.equal(PRACTICE_ABILITY_CHANNELS.includes("overall"), false);
  const declared = createGenericPracticeExperimentDescriptor({ abilityChannel: "cold-natural-text" });
  assert.equal(validatePracticeExperimentDescriptor(declared).valid, true);
  assert.equal(validatePracticeExperimentDescriptor({ ...declared, abilityChannel: "overall" }).valid, false);
  assert.equal(validatePracticeSessionConfiguration({ abilityChannel: "cold-natural-text" }).valid, false);
});

test("PL13 channel policies lock exact v1 roles, duration, volume and protocol floors", () => {
  const channels = PRACTICE_ABILITY_POLICY_V1.channels;
  assert.deepEqual(channels["cold-natural-text"].allowedEvidenceRoles, ["transfer", "benchmark"]);
  assert.deepEqual([channels["cold-natural-text"].minimumDurationMs, channels["cold-natural-text"].maximumDurationMs, channels["cold-natural-text"].minimumTypedCharacters], [30_000, 600_000, 100]);
  assert.deepEqual(channels["controlled-speed"].allowedEvidenceRoles, ["benchmark", "diagnostic"]);
  assert.deepEqual([channels["controlled-speed"].minimumDurationMs, channels["controlled-speed"].maximumDurationMs, channels["controlled-speed"].minimumTypedCharacters], [20_000, 300_000, 75]);
  assert.deepEqual([channels["common-words"].minimumDurationMs, channels["common-words"].maximumDurationMs, channels["common-words"].minimumTypedCharacters], [15_000, 180_000, 50]);
  assert.deepEqual([channels.burst.minimumDurationMs, channels.burst.maximumDurationMs, channels.burst.minimumTypedCharacters, channels.burst.durationReferenceFloorSeconds], [5_000, 15_000, 25, 5]);
  assert.deepEqual([channels.endurance.minimumDurationMs, channels.endurance.maximumDurationMs, channels.endurance.minimumTypedCharacters], [180_000, 1_800_000, 500]);
  for (const name of ["punctuation", "numbers-symbols"]) assert.deepEqual([channels[name].minimumDurationMs, channels[name].maximumDurationMs, channels[name].minimumTypedCharacters], [30_000, 300_000, 100]);
  for (const channel of Object.values(channels)) {
    assert.equal(channel.minimumAccuracy, 70);
    assert.equal(channel.requiresUntargetedContent, true);
    assert.equal(channel.requiresCorrectionAllowed, true);
  }
});

test("PL13 returns not-requested for ordinary experiments and never emits an observation", () => {
  const result = buildPracticeAbilityObservation({ ...input(), experiment: { abilityChannel: null } });
  assert.equal(result.status, "not-requested");
  assert.equal(result.observation, null);
  assert.equal(result.sessionSummary, null);
});

test("PL13 eligible controlled measurement uses canonical WPM and emits one immutable compact observation", () => {
  const result = build();
  assert.equal(result.status, "eligible");
  assert.equal(result.reasons.length, 0);
  assert.equal(result.observation.observationVersion, PRACTICE_ABILITY_OBSERVATION_VERSION);
  assert.equal(result.observation.wpm, 100);
  assert.equal(result.observation.rawWpm, 105);
  approx(result.observation.adjustedLogPerformance, Math.log(100));
  assert.equal(Object.isFrozen(result.observation), true);
  assert.equal(result.sessionSummary.status, "eligible");
});

test("PL13 ordinary protocol ineligibility is bounded and non-throwing", () => {
  const cases = [
    [{ channel: "cold-natural-text", role: "training" }, "role-not-allowed"],
    [{ targets: [{ entityType: "bigram", entityKey: "br" }] }, "targeted-content"],
    [{ completionReason: "manual-stop" }, "manual-stop"],
    [{ status: "abandoned" }, "wrong-session-status"],
    [{ correctionBehavior: "strict" }, "correction-policy"],
    [{ duration: 19_999 }, "duration-too-short"],
    [{ duration: 300_001 }, "duration-too-long"],
    [{ chars: 74 }, "insufficient-characters"],
    [{ accuracy: 69.9 }, "accuracy-too-low"],
    [{ wpm: 0 }, "invalid-wpm"],
  ];
  for (const [overrides, expectedReason] of cases) {
    const result = build(overrides);
    assert.equal(result.status, "not-eligible", expectedReason);
    assert.equal(result.observation, null);
    assert.ok(result.reasons.includes(expectedReason), `${expectedReason}: ${result.reasons}`);
  }
});

test("PL13 valid bad performance remains a measurement rather than being filtered as an outlier", () => {
  const result = build({ wpm: 35, rawWpm: 40, accuracy: 95 });
  assert.equal(result.status, "eligible");
  assert.equal(result.observation.wpm, 35);
});

test("PL13 difficulty adjustment is directional, coverage-aware, capped and absent when unsupported", () => {
  const hard = build({ foundationAnalysis: foundation({ difficultyIndex: 4 }) }).observation;
  const easy = build({ foundationAnalysis: foundation({ difficultyIndex: -4 }) }).observation;
  approx(hard.difficultyAdjustmentLog, 0.12);
  approx(easy.difficultyAdjustmentLog, -0.12);
  assert.ok(hard.adjustedWpm > 100);
  assert.ok(easy.adjustedWpm < 100);
  const partial = build({ foundationAnalysis: foundation({ difficultyIndex: 4, difficultyStatus: "partial", coverage: 0.5 }) }).observation;
  approx(partial.difficultyAdjustmentLog, 0.06);
  const unsupported = build({ foundationAnalysis: foundation({ difficultyIndex: null, difficultyStatus: "unsupported-language", coverage: 0 }) }).observation;
  assert.equal(unsupported.difficultyAdjustmentLog, 0);
  assert.equal(unsupported.difficultyModelStatus, "unsupported-language");
});

test("PL13 clean 60-second uncertainty is 0.08 and reliability uses variance-equivalent weighting", () => {
  const observation = build().observation;
  approx(observation.measurementSigmaLog, 0.08);
  approx(observation.measurementVarianceLog, 0.08 ** 2);
  approx(observation.reliabilityWeight, 1);
});

test("PL13 duration, accuracy, rhythm, difficulty and interruption penalties monotonically increase uncertainty", () => {
  const clean = build().observation.measurementSigmaLog;
  const short = build({ duration: 20_000 }).observation.measurementSigmaLog;
  const lowAccuracy = build({ accuracy: 90 }).observation.measurementSigmaLog;
  const variable = build({ foundationAnalysis: foundation({ fluentMadMs: 30 }) }).observation.measurementSigmaLog;
  const partial = build({ foundationAnalysis: foundation({ difficultyStatus: "partial", coverage: 0.6 }) }).observation.measurementSigmaLog;
  const interrupted = build({ foundationAnalysis: foundation({ interruptionRate: 0.1 }) }).observation.measurementSigmaLog;
  assert.ok(short > clean);
  assert.ok(lowAccuracy > clean);
  assert.ok(variable > clean);
  assert.ok(partial > clean);
  assert.ok(interrupted > clean);
});

test("PL13 uncertainty respects sigma floor, ceiling, burst duration floor and retained-trace inflation", () => {
  const longClean = build({ duration: 300_000 }).observation.measurementSigmaLog;
  assert.ok(longClean >= 0.04);
  const noisy = build({ accuracy: 70, foundationAnalysis: foundation({ difficultyStatus: "unsupported-language", coverage: 0, fluentMedianMs: null, fluentMadMs: null, interruptionRate: 0.5, traceScope: "retained-window" }) }).observation.measurementSigmaLog;
  approx(noisy, 0.30);
  const burst = build({ channel: "burst", role: "training", duration: 5_000, chars: 25 }).observation;
  approx(burst.measurementSigmaLog, 0.08 * Math.sqrt(60 / 5));
  const retained = build({ foundationAnalysis: foundation({ traceScope: "retained-window" }) }).observation.measurementSigmaLog;
  assert.ok(retained > 0.08);
});
