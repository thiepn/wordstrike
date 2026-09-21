import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderPracticeProblemWordsResult } from "../js/practiceLab/practiceProblemWordsSessionHost.js";
import { renderPracticeCommonWordsResult } from "../js/practiceLab/practiceCommonWordsSessionHost.js";
import { renderPracticeSustainedResult } from "../js/practiceLab/practiceSustainedSessionHost.js";
import { buildPracticeCoachViewModel } from "../js/practiceLab/practiceCoachUi.js";

const root = () => ({
  innerHTML: "",
  querySelector() { return null; },
});

test("Phase 1 Problem Words labels context-adjusted residuals as residuals rather than absolute times", () => {
  const target = root();
  renderPracticeProblemWordsResult(target, {
    summary: {
      configuration: { target: { entityType: "word", entityKey: "because" } },
      beforeMetrics: {
        executionQuality: 71,
        wholeWordFirstPassAccuracy: 0.8,
        launch: { fluentResidualMedianMs: 14, disfluencyRate: 0.1 },
        internal: { fluentResidualMedianMs: -3, disfluencyRate: 0.04 },
      },
      afterMetrics: {
        executionQuality: 78,
        wholeWordFirstPassAccuracy: 1,
        launch: { fluentResidualMedianMs: -8, disfluencyRate: 0.05 },
        internal: { fluentResidualMedianMs: -6, disfluencyRate: 0.02 },
      },
      immediateProbeDelta: 7,
      launchResidualDeltaMs: -22,
      internalResidualDeltaMs: -3,
    },
  });
  assert.match(target.innerHTML, /Start timing residual/);
  assert.match(target.innerHTML, /Inside-word timing residual/);
  assert.match(target.innerHTML, /14 ms → -8 ms/);
  assert.match(target.innerHTML, /Start residual change<\/dt><dd>-22 ms/);
  assert.match(target.innerHTML, /milliseconds relative to expected context/);
  assert.doesNotMatch(target.innerHTML, /<dt>Starting the word<\/dt>/);
});

test("Phase 1 Common Words labels residual timing with explicit units and direction", () => {
  const target = root();
  renderPracticeCommonWordsResult(target, { flow: "check", contentPlan: { completion: { value: 200 } } }, {
    summary: { afterMetrics: {
      wpm: 80,
      accuracy: 97,
      bandMetrics: {
        core: { wholeWordFirstPassAccuracy: 0.98, launchResidualMedianMs: -12, internalResidualMedianMs: 5, launchDisfluencyRate: 0.02, internalDisfluencyRate: 0.01 },
      },
    } },
  }, { bands: {} }, null, { focusResult: false });
  assert.match(target.innerHTML, /Launch residual \(ms\)/);
  assert.match(target.innerHTML, /Internal residual \(ms\)/);
  assert.match(target.innerHTML, /-12 ms/);
  assert.match(target.innerHTML, /negative values mean faster-than-expected execution/);
  assert.doesNotMatch(target.innerHTML, /<th>Starting words<\/th>/);
});

test("Phase 1 Endurance labels percentage-point deltas as changes rather than absolute control levels", () => {
  const target = root();
  renderPracticeSustainedResult(target, { experiment: { id: "endurance" }, flow: "check" }, {
    summary: { trainingQuality: {
      pattern: "stable",
      earlyAdjustedEffectiveWpm: 78,
      lateAdjustedEffectiveWpm: 76,
      paceRetentionPercent: 97.4,
      control: { accuracyDeltaPp: -1.5, disfluencyDeltaPp: 2.4, correctionCostDeltaPp: 0.8 },
      pace: { variationPercent: 4.2, trendPercent: -2.1 },
    } },
  }, null);
  assert.match(target.innerHTML, /Control change · late − early/);
  assert.match(target.innerHTML, /First-pass accuracy change<\/dt><dd>-1.5 pp/);
  assert.match(target.innerHTML, /Disfluency change<\/dt><dd>\+2.4 pp/);
  assert.match(target.innerHTML, /not absolute levels/);
  assert.doesNotMatch(target.innerHTML, /<dt>First-pass accuracy<\/dt><dd>-1.5 pp/);
});

test("Phase 1 Daily Coach developer diagnostics are opt-in and production-safe by default", async () => {
  const plan = {
    requestedMinutes: 5,
    plannedMinutes: 4,
    status: "ready",
    coverage: { label: "Focused" },
    completion: { completedCount: 0 },
    personalization: { responseInformed: true },
    suggestions: {},
    blocks: [{
      blockId: "block-1", ordinal: 1, kind: "targeted-intervention", experimentId: "weak-keys",
      estimatedMinutes: 4, status: "pending", target: { entityType: "key", entityKey: "e" },
      reasonCodes: ["key-foundation"], responseInformed: true,
      personalizationDecision: { treatmentFamilyKey: "weak-keys@current", needUtility: 80, responseModifier: 1.1, optionComparisons: [] },
    }],
  };
  const production = buildPracticeCoachViewModel({ state: { status: "ready", requestedMinutes: 5, plan } });
  const developer = buildPracticeCoachViewModel({ state: { status: "ready", requestedMinutes: 5, plan }, preview: true });
  assert.deepEqual(production.plan.developerDiagnostics, []);
  assert.equal(developer.plan.developerDiagnostics.length, 1);

  const controller = await readFile(new URL("../js/practiceLab/practiceLabControllerRuntimeV25.js", import.meta.url), "utf8");
  assert.match(controller, /coachPreview = options\.featureGate\?\.getSnapshot\?\.\(\)\.reason === "developer-preview"/);
  assert.doesNotMatch(controller, /buildPracticeCoachViewModel\(\{ state: coachState, preview: true \}\)/);
});
