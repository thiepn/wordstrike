import test from "node:test";
import assert from "node:assert/strict";
import { buildAccuracyRecoveryCandidates, buildAccuracyRecoveryManualWarnings } from "../js/practiceLab/practiceAccuracyRecoverySelection.js";

const profileId = "practice-profile_pl23";
const contextId = "practice-context_pl23";
const stat = (statId, entityType, entityKey) => ({ statId, profileId, contextId, entityType, entityKey });
const limiter = (statId, { phenotype = "inaccurate", inaccurate = 0, recovery = 0, status = "likely", priorityScore = 50, hierarchy = null } = {}) => ({ statId, status, primaryPhenotype: phenotype, priorityScore, evidenceConfidenceScore: 80, dimensions: { inaccurate: { severity: inaccurate, status, confidenceScore: 80 }, "recovery-heavy": { severity: recovery, status, confidenceScore: 75 } }, hierarchy });
const mastery = (statId, stage = "learning") => ({ statId, stage });
function saturatedState(statId) { return { statId, profileId, contextId, entityType: "key", entityKey: "r", acquisition: { observationCount: 6, observations: Array.from({ length: 3 }, () => ({ entryQuality: 60, exitQuality: 62 })), curve: { status: "flat", pointCount: 6, dayCount: 3, doseSpan: 3, confidence: "medium", recentSlopePointsPerDose: 0, medianSlopePointsPerDose: 0, recentQuality: 70, medianPracticeGain: 1 } }, transfer: { observationCount: 0, curve: null } }; }

test("PL23 recommends inaccurate and recovery-heavy entities but not slow-only evidence", () => {
  const skillStats = [stat("s-key", "key", "r"), stat("s-bi", "bigram", "th"), stat("s-slow", "key", "q")];
  const limiterSnapshot = { profileId, contextId, candidates: [limiter("s-key", { inaccurate: 65 }), limiter("s-bi", { phenotype: "recovery-heavy", recovery: 70 }), limiter("s-slow", { phenotype: "slow", inaccurate: 0, recovery: 0 })] };
  const masterySnapshot = { profileId, contextId, entities: [mastery("s-key"), mastery("s-bi"), mastery("s-slow")] };
  const result = buildAccuracyRecoveryCandidates({ profileId, contextId, skillStats, limiterSnapshot, masterySnapshot });
  assert.deepEqual(result.map((item) => item.statId).sort(), ["s-bi", "s-key"]);
  assert.equal(result.find((item) => item.statId === "s-key").inaccurateSeverity, 65);
  assert.equal(result.find((item) => item.statId === "s-bi").recoveryHeavySeverity, 70);
});

test("PL23 mixed candidate requires material control severity and hierarchy only de-emphasizes", () => {
  const skillStats = [stat("mixed-good", "word", "because"), stat("mixed-low", "word", "different")];
  const limiterSnapshot = { profileId, contextId, candidates: [limiter("mixed-good", { phenotype: "mixed", inaccurate: 40, hierarchy: { stronglyExplained: true } }), limiter("mixed-low", { phenotype: "mixed", inaccurate: 20, recovery: 10 })] };
  const masterySnapshot = { profileId, contextId, entities: [mastery("mixed-good"), mastery("mixed-low")] };
  const result = buildAccuracyRecoveryCandidates({ profileId, contextId, skillStats, limiterSnapshot, masterySnapshot });
  assert.equal(result.length, 1);
  assert.equal(result[0].statId, "mixed-good");
  assert.equal(result[0].hierarchyDeemphasized, true);
});

test("PL23 likely saturation de-emphasizes recommendation and manual practice receives warning", () => {
  const skillStats = [stat("sat", "key", "r")];
  const limiterSnapshot = { profileId, contextId, candidates: [limiter("sat", { inaccurate: 60 })] };
  const masterySnapshot = { profileId, contextId, entities: [mastery("sat", "learning")] };
  const learningStates = [saturatedState("sat")];
  const result = buildAccuracyRecoveryCandidates({ profileId, contextId, skillStats, limiterSnapshot, masterySnapshot, learningStates });
  assert.equal(result.length, 1);
  assert.equal(result[0].saturationStatus, "likely");
  assert.equal(result[0].saturationDeemphasized, true);
  const warnings = buildAccuracyRecoveryManualWarnings({ statId: "sat", limiterSnapshot, masterySnapshot, learningStates });
  assert.equal(warnings.some((warning) => warning.kind === "saturation"), true);
  assert.match(warnings.find((warning) => warning.kind === "saturation").message, /low marginal gain/i);
});
