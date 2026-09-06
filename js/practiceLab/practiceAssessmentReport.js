import { PRACTICE_ASSESSMENT_LIMITS, PRACTICE_ASSESSMENT_REPORT_VERSION } from "./practiceAssessmentConstants.js";

const ratio = (n, d) => Number.isFinite(n) && Number.isFinite(d) && d > 0 ? n / d : null;
const per1000 = (n, d) => Number.isFinite(n) && Number.isFinite(d) && d > 0 ? n * 1000 / d : null;
const sumMetric = (blocks, key) => blocks.reduce((sum, block) => sum + (Number.isFinite(block.result?.blockMetrics?.[key]) ? block.result.blockMetrics[key] : 0), 0);
const hasMetric = (blocks, key) => blocks.some((block) => Number.isFinite(block.result?.blockMetrics?.[key]));
const clone = (value) => JSON.parse(JSON.stringify(value));

function buildControl(blocks) {
  const diagnostic = blocks.filter((block) => block.result?.status === "completed" && block.blockId.startsWith("diagnostic-"));
  const opportunities = sumMetric(diagnostic, "firstPassOpportunityCount");
  const correct = sumMetric(diagnostic, "firstPassCorrectCount");
  const fluent = sumMetric(diagnostic, "fluentTransitionCount");
  const disfluent = sumMetric(diagnostic, "disfluentTransitionCount");
  const typed = sumMetric(diagnostic, "typedCharacterCount");
  return Object.freeze({
    firstPassAccuracy: opportunities > 0 ? ratio(correct, opportunities) : null,
    disfluencyRate: fluent + disfluent > 0 ? ratio(disfluent, fluent + disfluent) : null,
    correctionInputsPer1000: hasMetric(diagnostic, "correctionInputCount") ? per1000(sumMetric(diagnostic, "correctionInputCount"), typed) : null,
    correctionCharactersPer1000: hasMetric(diagnostic, "correctionCharactersRemoved") ? per1000(sumMetric(diagnostic, "correctionCharactersRemoved"), typed) : null,
    correctionCostMsPer1000: hasMetric(diagnostic, "correctionCostMs") ? per1000(sumMetric(diagnostic, "correctionCostMs"), typed) : null,
    errorEpisodesPer1000: hasMetric(diagnostic, "errorEpisodeCount") ? per1000(sumMetric(diagnostic, "errorEpisodeCount"), typed) : null,
    includedBlockIds: Object.freeze(diagnostic.map((block) => block.blockId)),
  });
}

function masteryCounts(masterySnapshot) {
  const stage = { unmeasured: 0, learning: 0, acquired: 0, transferred: 0, robust: 0, retained: 0 };
  const automaticity = { developing: 0, emerging: 0, established: 0, strong: 0 };
  for (const entry of masterySnapshot?.entities ?? masterySnapshot?.items ?? []) {
    const key = String(entry.stage ?? "unmeasured").toLowerCase();
    if (Object.hasOwn(stage, key)) stage[key] += 1;
    const auto = String(entry.automaticity?.status ?? entry.automaticityStatus ?? "").toLowerCase();
    if (Object.hasOwn(automaticity, auto)) automaticity[auto] += 1;
  }
  return { stages: stage, automaticity };
}

export function buildPracticeAssessmentReport({ run, limiterSnapshot = null, abilityState = null, masterySnapshot = null } = {}) {
  if (!run || !Array.isArray(run.blocks)) throw new TypeError("Assessment report requires a persisted assessment run");
  const invalidBlocks = run.blocks.filter((block) => block.status === "invalid");
  const benchmarkBlock = run.blocks.find((block) => block.blockId === "benchmark-natural") ?? null;
  const transferBlock = run.blocks.find((block) => block.blockId === "cold-transfer") ?? null;
  const benchmarkEval = benchmarkBlock?.result?.evaluationSummary ?? null;
  const transferEval = transferBlock?.result?.evaluationSummary ?? null;
  const nonstandard = run.integrityStatus === "nonstandard" || benchmarkEval?.freshness === "repeat";
  const reportStatus = run.integrityStatus === "invalid" ? "invalid" : invalidBlocks.length ? "partial" : "complete";
  const limiters = (limiterSnapshot?.primaryLimiters ?? limiterSnapshot?.limiters ?? []).slice(0, PRACTICE_ASSESSMENT_LIMITS.maximumStoredLimiterSummaries).map((item) => ({
    statId: item.statId ?? null,
    entityType: item.entityType ?? null,
    entityKey: item.entityKey ?? null,
    phenotype: item.phenotype ?? null,
    status: item.status ?? null,
    weaknessScore: item.weaknessScore ?? null,
    impactScore: item.impactScore ?? null,
    priorityScore: item.priorityScore ?? null,
    evidenceConfidenceLevel: item.evidenceConfidenceLevel ?? item.confidenceLevel ?? null,
    hierarchyStatus: item.hierarchyStatus ?? null,
  }));
  const benchmarkMetrics = benchmarkBlock?.result?.blockMetrics ?? null;
  const transferMetrics = transferBlock?.result?.blockMetrics ?? null;
  const coverage = run.blocks.filter((b) => b.result?.coverage).map((b) => b.result.coverage);
  const mastery = masteryCounts(masterySnapshot);
  return Object.freeze({
    reportVersion: PRACTICE_ASSESSMENT_REPORT_VERSION,
    reportStatus,
    assessmentRunId: run.assessmentRunId,
    protocolVersion: run.protocolVersion,
    blueprintVersion: run.plan?.planVersion ?? 1,
    depth: run.depth,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    integrity: Object.freeze({
      status: run.integrityStatus === "standard" && nonstandard ? "nonstandard" : run.integrityStatus,
      benchmarkFreshness: benchmarkEval?.freshness ?? null,
      benchmarkIntegrity: benchmarkEval?.integrityStatus ?? benchmarkEval?.status ?? null,
      diagnosticStatus: invalidBlocks.some((b) => b.blockId.startsWith("diagnostic-")) ? "partial" : "measured",
      transferFreshness: transferEval?.freshness ?? null,
      transferIntegrity: transferEval?.integrityStatus ?? transferEval?.status ?? null,
      reasons: Object.freeze(invalidBlocks.map((block) => `Invalid assessment block: ${block.blockId}`)),
    }),
    blockSummary: Object.freeze(run.blocks.map((block) => Object.freeze({ blockId: block.blockId, status: block.status, sessionId: block.childSessionId, durationMs: block.durationMs, freshness: block.result?.diagnosticFreshness ?? block.result?.evaluationSummary?.freshness ?? null }))),
    generalPerformance: Object.freeze({
      benchmark: benchmarkMetrics ? Object.freeze({ wpm: benchmarkMetrics.wpm, rawWpm: benchmarkMetrics.rawWpm, adjustedWpm: benchmarkEval?.adjustedWpm ?? null, accuracy: benchmarkMetrics.accuracy, measurementSigmaLog: benchmarkEval?.measurementSigmaLog ?? null, freshness: benchmarkEval?.freshness ?? null, comparabilityClass: benchmarkEval?.comparabilityClass ?? null }) : null,
      coldNaturalAbility: abilityState ? Object.freeze({ estimateWpm: abilityState.estimateWpm ?? abilityState.estimatedWpm ?? null, interval95LowerWpm: abilityState.interval95LowerWpm ?? null, interval95UpperWpm: abilityState.interval95UpperWpm ?? null, confidenceLevel: abilityState.confidenceLevel ?? null, abilityUpdatedByAssessment: benchmarkEval?.abilityEligible === true }) : null,
    }),
    control: buildControl(run.blocks),
    diagnosticCoverage: Object.freeze({ blueprintVersion: 1, blocks: Object.freeze(clone(coverage)) }),
    limiterSnapshot: Object.freeze(limiters),
    masterySnapshot: Object.freeze(mastery),
    transfer: run.depth === "deep" ? Object.freeze({ available: Boolean(transferMetrics), freshness: transferEval?.freshness ?? null, integrity: transferEval?.integrityStatus ?? transferEval?.status ?? null, wpm: transferMetrics?.wpm ?? null, adjustedWpm: transferEval?.adjustedWpm ?? null, accuracy: transferMetrics?.accuracy ?? null, validTransferEvidenceEntityCount: transferEval?.validTransferEvidenceEntityCount ?? null, adjustedWpmDelta: Number.isFinite(transferEval?.adjustedWpm) && Number.isFinite(benchmarkEval?.adjustedWpm) ? transferEval.adjustedWpm - benchmarkEval.adjustedWpm : null, deltaLabel: "descriptive" }) : Object.freeze({ available: false, freshness: null, integrity: null, wpm: null, adjustedWpm: null, accuracy: null, validTransferEvidenceEntityCount: null, adjustedWpmDelta: null, deltaLabel: "not-measured" }),
    measurementCoverage: Object.freeze({
      "cold-natural ability": benchmarkBlock?.status === "completed" ? "measured" : "partial",
      "first-pass accuracy": run.blocks.some((b) => b.blockId.startsWith("diagnostic-") && b.status === "completed") ? "measured" : "partial",
      "fluency/disfluency": run.blocks.some((b) => b.blockId.startsWith("diagnostic-") && b.status === "completed") ? "measured" : "partial",
      "correction behavior": run.blocks.some((b) => b.blockId.startsWith("diagnostic-") && b.status === "completed") ? "measured" : "partial",
      "key diagnostics": run.blocks.find((b) => b.blockId === "diagnostic-core-keys")?.status === "completed" ? "measured" : "not-measured",
      "combination diagnostics": run.blocks.find((b) => b.blockId === "diagnostic-combinations")?.status === "completed" ? "measured" : "not-measured",
      "word-launch diagnostics": run.blocks.find((b) => b.blockId === "diagnostic-word-launch")?.status === "completed" ? "measured" : "not-measured",
      "punctuation/capitalization diagnostics": run.blocks.find((b) => b.blockId === "diagnostic-punctuation-capitals")?.status === "completed" ? "partial" : "not-measured",
      "numbers/symbol diagnostics": run.blocks.find((b) => b.blockId === "diagnostic-numbers-symbols")?.status === "completed" ? "partial" : "not-measured",
      "cold transfer": run.depth === "deep" && transferBlock?.status === "completed" ? "measured" : "not-measured",
      "controlled speed": "not-measured",
      burst: "not-measured",
      "common-word ability": "not-measured",
      endurance: "not-measured",
    }),
  });
}
