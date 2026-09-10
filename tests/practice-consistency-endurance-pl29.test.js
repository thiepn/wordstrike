import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS } from "../js/practiceLab/practiceConstants.js";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";
import { getPracticeExperiment } from "../js/practiceLab/practiceExperimentCatalog.js";
import { createPracticeExperimentRegistry } from "../js/practiceLab/practiceExperimentRegistryRuntime.js";
import { buildPracticeAbilityObservation } from "../js/practiceLab/practiceAbilityObservation.js";
import { getPracticeAbilityChannelPolicy, validatePracticeAbilityPolicy } from "../js/practiceLab/practiceAbilityPolicy.js";
import {
  PRACTICE_CONSISTENCY_ANALYSIS_VERSION, PRACTICE_CONSISTENCY_DEFAULT_DURATION_MS, PRACTICE_CONSISTENCY_DURATIONS_MS,
  PRACTICE_CONSISTENCY_EXPERIMENT_ID, PRACTICE_CONSISTENCY_FORM_SCHEMA_VERSION, PRACTICE_CONSISTENCY_FORM_SET_ID,
  PRACTICE_CONSISTENCY_GUIDE_VERSION, PRACTICE_CONSISTENCY_POLICY_VERSION, PRACTICE_CONSISTENCY_RESULT_VERSION, PRACTICE_CONSISTENCY_VERSION,
} from "../js/practiceLab/practiceConsistencyConstants.js";
import { createPracticeConsistencyGuide } from "../js/practiceLab/practiceConsistencyGuide.js";
import { analyzePracticeConsistency } from "../js/practiceLab/practiceConsistencyAnalysis.js";
import { createPracticeConsistencyExperiment, registerPracticeConsistencyExperiment } from "../js/practiceLab/practiceConsistencyExperiment.js";
import {
  PRACTICE_ENDURANCE_ANALYSIS_VERSION, PRACTICE_ENDURANCE_CHECK_DURATION_MS, PRACTICE_ENDURANCE_CHECK_EXPERIMENT_ID,
  PRACTICE_ENDURANCE_CHECK_FORM_SET_ID, PRACTICE_ENDURANCE_ESTIMATOR_VERSION, PRACTICE_ENDURANCE_EXPERIMENT_ID,
  PRACTICE_ENDURANCE_FORM_SCHEMA_VERSION, PRACTICE_ENDURANCE_POLICY_VERSION, PRACTICE_ENDURANCE_PRACTICE_DURATIONS_MS,
  PRACTICE_ENDURANCE_RESULT_VERSION, PRACTICE_ENDURANCE_TRAINING_FORM_SET_ID, PRACTICE_ENDURANCE_VERSION,
} from "../js/practiceLab/practiceEnduranceConstants.js";
import { analyzePracticeEndurance } from "../js/practiceLab/practiceEnduranceAnalysis.js";
import { estimatePracticeEnduranceAbility } from "../js/practiceLab/practiceEnduranceEstimator.js";
import { buildPracticeEnduranceAbilityMeasurement } from "../js/practiceLab/practiceEnduranceAbilityMeasurement.js";
import { createPracticeEnduranceCheckDescriptor, createPracticeEnduranceExperiment, registerPracticeEnduranceExperiment } from "../js/practiceLab/practiceEnduranceExperiment.js";
import { createPracticeSustainedWindowAccumulator } from "../js/practiceLab/practiceSustainedWindowAccumulator.js";
import { PRACTICE_SUSTAINED_WINDOW_VERSION } from "../js/practiceLab/practiceSustainedWindowConstants.js";
import { selectPracticeSustainedForm } from "../js/practiceLab/practiceSustainedPlan.js";

const sha = (text) => `sha256-${createHash("sha256").update(text).digest("hex")}`;
const json = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const fullDifficulty = () => ({ status: "full", difficultyIndex: 0, availableModelWeight: 1, relativeDifficultyPercentile: 50 });
const scoreRange = () => fullDifficulty();

function makeWindow({ ordinal, startMs, wpm = 100, accuracy = 0.98, disfluency = 0.02, correctionCostRate = 0.01, durationMs = 30_000 } = {}) {
  const accepted = (wpm * durationMs / 60_000) * 5;
  const opportunities = Math.max(100, accepted);
  const correct = opportunities * accuracy;
  const effectiveTarget = (wpm * durationMs / 60_000) * 5;
  // Keep effective pace equal to requested wpm while allowing independent control counts.
  const effectiveCorrect = effectiveTarget;
  return Object.freeze({
    windowId: `window-${String(ordinal).padStart(2, "0")}`, ordinal, startMs, endMs: startMs + 30_000,
    durationMs, windowActiveMs: durationMs, acceptedForwardInsertions: accepted,
    firstPassOpportunityCount: Math.ceil(Math.max(opportunities, effectiveCorrect / Math.max(accuracy, 0.01))),
    firstPassCorrectCount: effectiveCorrect,
    timingEligibleCount: 100, disfluentCount: 100 * disfluency,
    closedCorrectionIntervals: correctionCostRate > 0 ? 1 : 0, correctionCostMs: durationMs * correctionCostRate,
    errorEpisodeCount: 0, expectedTextStartIndex: (ordinal - 1) * 400, expectedTextEndIndex: ordinal * 400,
  });
}
function snapshotFromSeries(series, { analysisStartMs = 30_000, accuracies = [], disfluencies = [], correctionRates = [] } = {}) {
  return Object.freeze({ version: PRACTICE_SUSTAINED_WINDOW_VERSION, analysisStartMs, windowMs: 30_000, latencyThresholdMs: 300, windows: Object.freeze(series.map((wpm, index) => makeWindow({ ordinal: index + 1, startMs: analysisStartMs + index * 30_000, wpm, accuracy: accuracies[index] ?? 0.98, disfluency: disfluencies[index] ?? 0.02, correctionCostRate: correctionRates[index] ?? 0.01 }))) });
}

// Architecture/version boundary.
test("PL29 generic record and foundation versions remain stable inside the PL31 DB9 envelope", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 9); assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 13); assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 10);
  assert.equal(PRACTICE_CONSISTENCY_VERSION, 1); assert.equal(PRACTICE_CONSISTENCY_POLICY_VERSION, 1); assert.equal(PRACTICE_CONSISTENCY_FORM_SCHEMA_VERSION, 1); assert.equal(PRACTICE_CONSISTENCY_GUIDE_VERSION, 1); assert.equal(PRACTICE_CONSISTENCY_ANALYSIS_VERSION, 1); assert.equal(PRACTICE_CONSISTENCY_RESULT_VERSION, 1);
  assert.equal(PRACTICE_ENDURANCE_VERSION, 1); assert.equal(PRACTICE_ENDURANCE_POLICY_VERSION, 1); assert.equal(PRACTICE_ENDURANCE_FORM_SCHEMA_VERSION, 1); assert.equal(PRACTICE_ENDURANCE_ANALYSIS_VERSION, 1); assert.equal(PRACTICE_ENDURANCE_ESTIMATOR_VERSION, 1); assert.equal(PRACTICE_ENDURANCE_RESULT_VERSION, 1); assert.equal(PRACTICE_SUSTAINED_WINDOW_VERSION, 1);
});

test("PL29 activates only the existing Consistency and Endurance catalog cards", () => {
  const consistency = getPracticeExperiment("consistency-trainer"); const endurance = getPracticeExperiment("endurance");
  assert.equal(consistency.status, "preview"); assert.equal(consistency.requiresPracticeData, false); assert.deepEqual(consistency.estimatedDurationMinutes, { minimum: 3, recommended: 6, maximum: 10 });
  assert.equal(endurance.status, "preview"); assert.deepEqual(endurance.estimatedDurationMinutes, { minimum: 5, recommended: 10, maximum: 20 });
  assert.equal(getPracticeExperiment("endurance-check"), null); assert.equal(getPracticeExperiment("stamina"), null); assert.equal(getPracticeExperiment("consistency-endurance"), null);
});

test("visible descriptors remain separate and hidden Endurance Check alone owns the endurance channel", () => {
  const consistency = createPracticeConsistencyExperiment(); const endurance = createPracticeEnduranceExperiment(); const check = createPracticeEnduranceCheckDescriptor();
  assert.equal(consistency.id, PRACTICE_CONSISTENCY_EXPERIMENT_ID); assert.equal(consistency.abilityChannel, null); assert.equal(consistency.resumable, false);
  assert.equal(endurance.id, PRACTICE_ENDURANCE_EXPERIMENT_ID); assert.equal(endurance.abilityChannel, null); assert.equal(endurance.resumable, false);
  assert.equal(check.id, PRACTICE_ENDURANCE_CHECK_EXPERIMENT_ID); assert.equal(check.abilityChannel, "endurance"); assert.equal(check.resumable, false);
});

test("registered visible implementations are exactly the existing catalog IDs", () => {
  const registry = createPracticeExperimentRegistry(); registerPracticeConsistencyExperiment(registry, { runtime: {} }); registerPracticeEnduranceExperiment(registry, { runtime: {} });
  assert.equal(registry.hasImplementation("consistency-trainer"), true); assert.equal(registry.hasImplementation("endurance"), true); assert.equal(registry.hasImplementation("endurance-check"), false);
});

test("PL13 endurance policy accepts only the trusted diagnostic protocol role", () => {
  validatePracticeAbilityPolicy(); const policy = getPracticeAbilityChannelPolicy("endurance"); assert.deepEqual(policy.allowedEvidenceRoles, ["diagnostic"]); assert.equal(policy.minimumTypedCharacters, 125); assert.ok(policy.minimumDurationMs <= 180_000 && policy.maximumDurationMs >= 180_000);
});

// Static form certification.
for (const [name, manifestPath, formsPath, id, partition, minReady, minLength, maxSpread] of [
  ["Consistency", "data/practice/consistency/en-v1/WS-CONSISTENCY-EN-1.manifest.json", "data/practice/consistency/en-v1/WS-CONSISTENCY-EN-1.forms.json", PRACTICE_CONSISTENCY_FORM_SET_ID, "training", 4, 22_000, 0.50],
  ["Endurance Practice", "data/practice/endurance/en-v1/WS-ENDURANCE-PRACTICE-EN-1.manifest.json", "data/practice/endurance/en-v1/WS-ENDURANCE-PRACTICE-EN-1.forms.json", PRACTICE_ENDURANCE_TRAINING_FORM_SET_ID, "training", 2, 44_000, 0.55],
  ["Endurance Check", "data/practice/endurance/en-v1/WS-ENDURANCE-CHECK-EN-1.manifest.json", "data/practice/endurance/en-v1/WS-ENDURANCE-CHECK-EN-1.forms.json", PRACTICE_ENDURANCE_CHECK_FORM_SET_ID, "diagnostic", 4, 22_000, 0.40],
]) test(`${name} form set is ready, partition-correct, long enough and locally uniform`, async () => {
  const manifest = await json(manifestPath); const artifactText = await readFile(new URL(`../${formsPath}`, import.meta.url), "utf8"); const artifact = JSON.parse(artifactText);
  assert.equal(manifest.formSetId, id); assert.equal(manifest.partition, partition); assert.equal(manifest.status, "ready"); assert.ok(manifest.readyFormCount >= minReady); assert.equal(sha(artifactText), manifest.formsChecksum);
  for (const form of artifact.forms.filter((row) => row.releaseValidation.valid)) { assert.equal(form.partition, partition); assert.equal(form.reviewStatus, "approved"); assert.ok(form.graphemeCount >= minLength); assert.ok(form.typability.availableModelWeight >= 0.90); assert.ok(form.releaseValidation.windowDifficultySpread <= maxSpread + 1e-12); assert.equal(sha(form.text), form.formHash); }
});

test("form manifests bind current corpus, PL7 index, PL10 reference and frequency source", async () => {
  const model = await json("data/practice/models/en-v1/manifest.json"); const manifest = await json("data/practice/endurance/en-v1/WS-ENDURANCE-CHECK-EN-1.manifest.json");
  assert.equal(manifest.bindings.corpusChecksum, model.corpusChecksum); assert.equal(manifest.bindings.indexChecksum, model.indexChecksum); assert.equal(manifest.bindings.typabilityReferenceChecksum, model.referenceChecksum); assert.equal(manifest.bindings.frequencyReferenceChecksum, model.frequencyReferenceChecksum);
});

test("sustained form selection is deterministic and exposes no weakness-state input", () => {
  const formSet = { manifest: { formSetId: "set", formSetVersion: 1 }, forms: [{ formId: "a" }, { formId: "b" }, { formId: "c" }] };
  assert.equal(selectPracticeSustainedForm({ sessionId: "session-1", contextLanguage: "en", formSet }).formId, selectPracticeSustainedForm({ sessionId: "session-1", contextLanguage: "en", formSet }).formId);
  assert.equal(selectPracticeSustainedForm.length, 0); // options object only; no positional skill-state channel.
});

// Consistency guide and window protocol.
test("Consistency protocol durations and default are exactly 3 / 6 / 10 min with 6 min default", () => { assert.deepEqual(PRACTICE_CONSISTENCY_DURATIONS_MS, [180_000, 360_000, 600_000]); assert.equal(PRACTICE_CONSISTENCY_DEFAULT_DURATION_MS, 360_000); });

test("Consistency calibration requires 50 inserts and 70% first-pass accuracy", () => {
  const low = createPracticeConsistencyGuide(); for (let i = 0; i < 49; i++) low.recordProcessedInput({ type: "character", relativeActiveTimestampMs: i * 500, isFirstAttempt: true, correctness: "correct" }); assert.equal(low.getSnapshot(30_000).status, "unavailable");
  const inaccurate = createPracticeConsistencyGuide(); for (let i = 0; i < 60; i++) inaccurate.recordProcessedInput({ type: "character", relativeActiveTimestampMs: i * 400, isFirstAttempt: true, correctness: i < 40 ? "correct" : "incorrect" }); assert.equal(inaccurate.getSnapshot(30_000).status, "unavailable");
  const ok = createPracticeConsistencyGuide(); for (let i = 0; i < 60; i++) ok.recordProcessedInput({ type: "character", relativeActiveTimestampMs: i * 400, isFirstAttempt: true, correctness: "correct" }); assert.equal(ok.getSnapshot(30_000).available, true); assert.equal(ok.getCalibration().anchorGrossWpm, 24);
});

test("Consistency guide applies 15-second rolling sample and ±10% fixed anchor band", () => {
  function status(count) { const guide = createPracticeConsistencyGuide(); for (let i = 0; i < 75; i++) guide.recordProcessedInput({ type: "character", relativeActiveTimestampMs: i * 390, isFirstAttempt: true, correctness: "correct" }); for (let i = 0; i < count; i++) guide.recordProcessedInput({ type: "character", relativeActiveTimestampMs: 30_100 + i * (14_000 / Math.max(1, count - 1)), isFirstAttempt: true, correctness: "correct" }); return guide.getSnapshot(44_500).status; }
  assert.equal(status(30), "slower"); assert.equal(status(38), "steady"); assert.equal(status(50), "faster");
});

test("Consistency analysis window counts are exactly 5 / 11 / 19 after 30-second calibration", () => {
  for (const [duration, count] of [[180_000,5],[360_000,11],[600_000,19]]) { const a = createPracticeSustainedWindowAccumulator({ analysisStartMs: 30_000, windowMs: 30_000, maximumWindows: count }); assert.equal(a.getSnapshot(duration).windows.length, count); }
});

test("detrended Consistency separates smooth drift from short-timescale variation", () => {
  const smooth = Array.from({ length: 11 }, (_, i) => 100 * Math.exp(Math.log(0.9) * i / 10)); const s = analyzePracticeConsistency({ windowSnapshot: snapshotFromSeries(smooth), scoreRange, durationMs: 360_000 }); assert.equal(s.pace.pattern, "drifting-slower"); assert.ok(s.pace.variationPercent < 1); assert.ok(s.pace.driftPercent < -7.5);
  const oscillating = [80, 120, 95, 110, 85, 115, 100, 90, 120, 80, 105]; const o = analyzePracticeConsistency({ windowSnapshot: snapshotFromSeries(oscillating), scoreRange, durationMs: 360_000 }); assert.equal(o.pace.pattern, "variable"); assert.ok(o.pace.variationPercent >= 8); assert.ok(Math.abs(o.pace.driftPercent) < 7.5);
});

test("Consistency control stability is independent of pace pattern and has no combined score", () => {
  const result = analyzePracticeConsistency({ windowSnapshot: snapshotFromSeries(Array(11).fill(100), { accuracies: Array(11).fill(0.98), disfluencies: Array(11).fill(0.02), correctionRates: Array(11).fill(0.01) }), scoreRange, durationMs: 360_000 }); assert.equal(result.pace.pattern, "steady"); assert.equal(result.control.stability, "stable"); assert.equal(Object.hasOwn(result, "score"), false); assert.equal(Object.hasOwn(result, "consistencyScore"), false);
});

// Endurance protocol and inference.
test("Endurance Practice durations are exactly 5 / 10 / 20 min and Check is fixed at 10 min", () => { assert.deepEqual(PRACTICE_ENDURANCE_PRACTICE_DURATIONS_MS, [300_000,600_000,1_200_000]); assert.equal(PRACTICE_ENDURANCE_CHECK_DURATION_MS, 600_000); });

test("Endurance Check excludes 60-second settling and measures exactly 18 windows", () => { const accumulator = createPracticeSustainedWindowAccumulator({ analysisStartMs: 60_000, windowMs: 30_000, maximumWindows: 18 }); const snap = accumulator.getSnapshot(600_000); assert.equal(snap.analysisStartMs, 60_000); assert.equal(snap.windows.length, 18); assert.equal(snap.windows[0].windowId, "window-01"); assert.equal(snap.windows[17].windowId, "window-18"); });

test("Endurance Check uses windows 1–4 early and 15–18 late with exact pace-retention ratio", () => {
  const wpms = [...Array(4).fill(100), ...Array(10).fill(97), ...Array(4).fill(90)]; const result = analyzePracticeEndurance({ windowSnapshot: snapshotFromSeries(wpms,{analysisStartMs:60_000}), scoreRange, flow:"check", durationMs:600_000 }); assert.deepEqual(result.earlyWindowOrdinals,[1,2,3,4]); assert.deepEqual(result.lateWindowOrdinals,[15,16,17,18]); assert.ok(Math.abs(result.paceRetentionPercent - 90) < 1e-8); assert.equal(result.pattern,"pace-decline");
});

test("Endurance control deltas pool counts rather than averaging window percentages", () => {
  const wpms=Array(18).fill(90); const accuracies=Array(18).fill(0.96); accuracies[0]=0.99; accuracies[1]=0.97; accuracies[2]=0.95; accuracies[3]=0.93; accuracies[14]=0.94; accuracies[15]=0.92; accuracies[16]=0.90; accuracies[17]=0.88;
  const result=analyzePracticeEndurance({windowSnapshot:snapshotFromSeries(wpms,{analysisStartMs:60_000,accuracies}),scoreRange,flow:"check",durationMs:600_000}); assert.ok(result.control.accuracyDeltaPp < -3); assert.equal(result.pattern,"control-decline");
});

test("Endurance pattern distinguishes stable, pace decline, control decline, mixed decline, rising and uncertain", () => {
  const r=(early,late,{ea=.98,la=.98}={})=>analyzePracticeEndurance({windowSnapshot:snapshotFromSeries([...Array(4).fill(early),...Array(10).fill((early+late)/2),...Array(4).fill(late)],{analysisStartMs:60_000,accuracies:[...Array(14).fill(ea),...Array(4).fill(la)]}),scoreRange,flow:"check",durationMs:600_000}).pattern;
  assert.equal(r(100,100),"stable"); assert.equal(r(100,90),"pace-decline"); assert.equal(r(100,100,{ea:.98,la:.90}),"control-decline"); assert.equal(r(100,90,{ea:.98,la:.90}),"mixed-decline"); assert.equal(r(100,106),"rising"); assert.equal(r(100,94),"uncertain");
});

test("Endurance ability uses only final six measured windows and requires at least five", () => {
  const good=estimatePracticeEnduranceAbility({windowSnapshot:snapshotFromSeries(Array(18).fill(90),{analysisStartMs:60_000}),scoreRange}); assert.equal(good.eligible,true); assert.deepEqual(good.windowOrdinals,[13,14,15,16,17,18]); assert.equal(good.validWindowCount,6);
  const snap=snapshotFromSeries(Array(18).fill(90),{analysisStartMs:60_000}); const windows=snap.windows.map((w,i)=>i===12?{...w,durationMs:10_000}:i===13?{...w,durationMs:10_000}:w); const bad=estimatePracticeEnduranceAbility({windowSnapshot:{...snap,windows},scoreRange}); assert.equal(bad.eligible,false); assert.equal(bad.reason,"insufficient-windows");
});

test("Endurance ability keeps low-accuracy structural windows and applies pooled >=70% floor", () => {
  const accuracies=Array(18).fill(.95); accuracies[12]=.50; const retained=estimatePracticeEnduranceAbility({windowSnapshot:snapshotFromSeries(Array(18).fill(80),{analysisStartMs:60_000,accuracies}),scoreRange}); assert.equal(retained.validWindowCount,6); assert.equal(retained.eligible,true);
  for(let i=12;i<18;i++) accuracies[i]=.60; const rejected=estimatePracticeEnduranceAbility({windowSnapshot:snapshotFromSeries(Array(18).fill(80),{analysisStartMs:60_000,accuracies}),scoreRange}); assert.equal(rejected.eligible,false); assert.equal(rejected.reason,"accuracy-floor");
});

test("Endurance uncertainty uses median individual sigma, MAD floor .02, effective n 4, penalty .03 and .05–.20 clamp", () => {
  const estimate=estimatePracticeEnduranceAbility({windowSnapshot:snapshotFromSeries(Array(18).fill(90),{analysisStartMs:60_000}),scoreRange}); assert.equal(estimate.eligible,true); assert.ok(estimate.sigmaSpread>=.02); const expected=Math.max(.05,Math.min(.20,Math.sqrt((estimate.sigmaIndividual**2)/4+estimate.sigmaSpread**2+.03**2))); assert.ok(Math.abs(estimate.measurementSigmaLog-expected)<1e-12);
});

test("one trusted Endurance Check yields one PL13 endurance observation rather than per-window observations", () => {
  const windowSnapshot=snapshotFromSeries(Array(18).fill(90),{analysisStartMs:60_000}); const measurement=buildPracticeEnduranceAbilityMeasurement({windowSnapshot,scoreRange}); assert.ok(measurement); const experiment={...createPracticeEnduranceCheckDescriptor(),buildAbilityMeasurement:()=>measurement};
  const assessment=buildPracticeAbilityObservation({session:{sessionId:"session-pl29-ability-0001",profileId:"profile-1",contextId:"context-1",status:"completed",completionReason:"time-complete",completedAtUtc:"2026-09-10T00:00:00.000Z",localDayKey:"2026-09-10",wpm:90,rawWpm:90,accuracy:95,activeDurationMs:600_000,typedCharacterCount:2700,configuration:{correctionBehavior:"allow"}},experiment,foundationAnalysis:null,contentPlan:{targetEntities:[]},evidenceRole:"diagnostic"});
  assert.equal(assessment.status,"eligible"); assert.equal(assessment.channel,"endurance"); assert.equal(assessment.observation.channel,"endurance"); assert.equal(assessment.observation.activeDurationMs,180_000); assert.equal(Array.isArray(assessment.observation),false);
});

test("manual stop and non-diagnostic visible Endurance never create canonical endurance ability", () => {
  const measurement=buildPracticeEnduranceAbilityMeasurement({windowSnapshot:snapshotFromSeries(Array(18).fill(90),{analysisStartMs:60_000}),scoreRange}); const check={...createPracticeEnduranceCheckDescriptor(),buildAbilityMeasurement:()=>measurement}; const base={sessionId:"session-pl29-stop-0001",profileId:"profile-1",contextId:"context-1",status:"abandoned",completionReason:"manual-stop",completedAtUtc:"2026-09-10T00:00:00.000Z",localDayKey:"2026-09-10",wpm:90,accuracy:95,activeDurationMs:600_000,typedCharacterCount:2700,configuration:{correctionBehavior:"allow"}};
  assert.equal(buildPracticeAbilityObservation({session:base,experiment:check,contentPlan:{targetEntities:[]},evidenceRole:"diagnostic"}).status,"not-eligible"); assert.equal(createPracticeEnduranceExperiment().abilityChannel,null);
});

test("PL29 runtime loader validates current provenance, model bindings and form hashes", async () => {
  const { loadPracticeSustainedFormSet } = await import("../js/practiceLab/practiceSustainedForms.js");
  const root = new URL("../", import.meta.url);
  const fetchImpl = async (url) => {
    const text = await readFile(new URL(String(url), root), "utf8");
    return { ok: true, text: async () => text };
  };
  for (const config of [
    { folder: "consistency", formSetId: PRACTICE_CONSISTENCY_FORM_SET_ID, expectedPartition: "training", minimumReadyForms: 4 },
    { folder: "endurance", formSetId: PRACTICE_ENDURANCE_TRAINING_FORM_SET_ID, expectedPartition: "training", minimumReadyForms: 2 },
    { folder: "endurance", formSetId: PRACTICE_ENDURANCE_CHECK_FORM_SET_ID, expectedPartition: "diagnostic", minimumReadyForms: 4 },
  ]) {
    const loaded = await loadPracticeSustainedFormSet({ fetchImpl, baseUrl: "data/practice", ...config });
    assert.ok(loaded.forms.length >= config.minimumReadyForms);
    assert.equal(loaded.manifest.formSetId, config.formSetId);
  }
});

test("PL29 source modules do not introduce scores, leaderboards, fatigue diagnosis or skill-target reads", async () => {
  const paths=["js/practiceLab/practiceConsistencyRuntime.js","js/practiceLab/practiceEnduranceRuntime.js","js/practiceLab/practiceConsistencyExperiment.js","js/practiceLab/practiceEnduranceExperiment.js","js/practiceLab/practiceSustainedPlan.js"];
  const source=(await Promise.all(paths.map((p)=>readFile(new URL(`../${p}`,import.meta.url),"utf8")))).join("\n"); assert.doesNotMatch(source,/skillStats|review queue|mastery|limiter/i); assert.doesNotMatch(source,/leaderboard/i); assert.doesNotMatch(source,/consistencyScore|enduranceScore|staminaScore/i);
  const ui=await readFile(new URL("../js/practiceLab/practiceSustainedSessionHost.js",import.meta.url),"utf8"); assert.doesNotMatch(ui,/\bfatigue\b|exhaustion|mental tiredness/i); assert.doesNotMatch(ui,/live WPM graph|live accuracy graph/i);
});
