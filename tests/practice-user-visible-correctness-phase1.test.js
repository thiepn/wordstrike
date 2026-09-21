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


test("Phase 1 remaining metric surfaces state their actual units and semantics", async () => {
  const [realText, paceLadder, burstSprints] = await Promise.all([
    readFile(new URL("../js/practiceLab/practiceRealTextSessionHost.js", import.meta.url), "utf8"),
    readFile(new URL("../js/practiceLab/practicePaceLadderSessionHost.js", import.meta.url), "utf8"),
    readFile(new URL("../js/practiceLab/practiceBurstSprintsSessionHost.js", import.meta.url), "utf8"),
  ]);
  assert.match(realText, /<dt>Disfluency rate<\/dt>/);
  assert.match(realText, /<dt>Log-scale uncertainty \(σ\)<\/dt>/);
  assert.doesNotMatch(realText, /<dt>Fluency · disfluency<\/dt>/);
  assert.match(paceLadder, /<th>Pace ratio<\/th><th>Target pace \(WPM\)<\/th><th>Observed gross pace \(WPM\)<\/th>/);
  assert.match(paceLadder, /<th>Correction overhead<\/th>/);
  assert.match(burstSprints, /<th>Gross \(WPM\)<\/th><th>Burst effective \(WPM\)<\/th>/);
});

test("Phase 1 target-result surfaces distinguish rates, residuals, and quality-point deltas", async () => {
  const [{ renderPracticeAccuracyRecoveryResult }, { renderPracticeCombinationRepairResult }, { renderPracticeWeaknessBossResult }, { renderPracticePhysicalTelemetryPanel }] = await Promise.all([
    import("../js/practiceLab/practiceAccuracyRecoverySessionHost.js"),
    import("../js/practiceLab/practiceCombinationRepairSessionHost.js"),
    import("../js/practiceLab/practiceWeaknessBossUi.js"),
    import("../js/practiceLab/practicePhysicalTelemetryUi.js"),
  ]);
  const accuracyRoot = root();
  renderPracticeAccuracyRecoveryResult(accuracyRoot, { summary: {
    configuration: { target: { entityType: "key", entityKey: "e" } },
    beforeMetrics: { firstPassAccuracy: 0.9, timing: { fluentResidualMedianMs: 12, disfluencyRate: 0.1 }, quality: 70 },
    afterMetrics: { firstPassAccuracy: 0.95, timing: { fluentResidualMedianMs: -4, disfluencyRate: 0.05 }, quality: 78 },
    trainingQuality: { accuracyDeltaPp: 5, residualDeltaMs: -16, recoveryProfile: { coverage: "none" }, targetOpportunityCount: 20 },
  } });
  assert.match(accuracyRoot.innerHTML, /<dt>Hesitation rate<\/dt>/);
  assert.match(accuracyRoot.innerHTML, /12 ms → -4 ms/);

  const combinationRoot = root();
  renderPracticeCombinationRepairResult(combinationRoot, { summary: { wpm: 70, accuracy: 96, trainingQuality: {
    sameSessionCheck: { immediateQualityChange: 6.5, entryQuality: 70, exitQuality: 76.5, immediateDirection: "Higher", interpretation: { wording: "Same-session descriptive change." } },
    phases: [],
  } } });
  assert.match(combinationRoot.innerHTML, /Immediate quality change<\/dt><dd>\+6.5 quality pts/);

  const bossRoot = root();
  renderPracticeWeaknessBossResult(bossRoot, { summary: { trainingQuality: {
    clearStatus: "defeated", boss: { archetype: "Tempo Warden" }, target: { entityType: "key", entityKey: "e" },
    openingProbe: { quality: 65 }, finalProbe: { quality: 72 }, immediateQualityDelta: 7,
    battle: { battleFirstPassAccuracy: 0.95, maxCleanTargetStreak: 8 },
  } } });
  assert.match(bossRoot.innerHTML, /Immediate quality delta<\/dt><dd>\+7 quality pts/);

  const physicalHtml = renderPracticePhysicalTelemetryPanel({
    availability: { enabled: true, contextEligible: true }, hasStoredData: true,
    snapshot: { coverage: { eligibleSessions: 1 }, keys: [], transitions: [], modifierRoutes: [] },
  });
  assert.match(physicalHtml, /<th scope="col">Median residual<\/th>/);
  assert.doesNotMatch(physicalHtml, /<th scope="col">Normalized timing<\/th>/);
});


test("Phase 1 Pace Ladder distinguishes the reference stage from ratio rungs", async () => {
  const source = await readFile(new URL("../js/practiceLab/practicePaceLadderSessionHost.js", import.meta.url), "utf8");
  assert.match(source, /s\.kind === "reference" \? "Reference"/);
  assert.doesNotMatch(source, /<th scope="row">\$\{Math\.round\(\(s\.ratio \?\? 0\) \* 100\)\}%<\/th>/);
});

test("Phase 1 Weakness Boss renders the explicit runtime recommendation, not list position", async () => {
  const { renderPracticeWeaknessBossDetail } = await import("../js/practiceLab/practiceWeaknessBossUi.js");
  const target = root();
  const candidate = (statId, entityKey) => ({
    statId, entityType: "key", entityKey,
    bossTheme: { name: `Boss ${entityKey}`, description: `Target ${entityKey}` },
    reasonCodes: ["confirmed-limiter"],
  });
  const first = candidate("stat-a", "a");
  const recommended = candidate("stat-b", "b");
  renderPracticeWeaknessBossDetail(target, {
    status: "ready",
    candidates: [first, recommended],
    recommendedCandidate: recommended,
    errorCode: null,
  });
  const recommendedIndex = target.innerHTML.indexOf('data-boss-candidate="stat-b"');
  const alternativeIndex = target.innerHTML.indexOf('data-boss-candidate="stat-a"');
  assert.ok(recommendedIndex >= 0 && alternativeIndex > recommendedIndex);
  assert.match(target.innerHTML.slice(recommendedIndex, alternativeIndex), /Recommended Boss/);
});

test("Phase 1 missing Common Words breadth percentages render unavailable, not a fake percent token", () => {
  const target = root();
  renderPracticeCommonWordsResult(target, { flow: "practice", contentPlan: { completion: { value: 80 } } }, {
    summary: { afterMetrics: { wordsCompleted: 80, wpm: 60, firstPassWordAccuracy: 0.95 } },
  }, { bands: {} }, null, { focusResult: false });
  assert.doesNotMatch(target.innerHTML, /—%/);
});
