import { comparePracticeBenchmarkMeasurements } from "./practiceBenchmarkComparison.js";
import { comparePracticeAbilityEstimates } from "./practiceAbilityComparison.js";
import { getPracticeAssessmentBlocksForDepth } from "./practiceAssessmentConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function findBlock(run, blockId) {
  return run?.blocks?.find((block) => block.blockId === blockId) ?? null;
}

function safeAbilityComparison(earlier, later) {
  const a = earlier?.report?.generalPerformance?.coldNaturalAbility;
  const b = later?.report?.generalPerformance?.coldNaturalAbility;
  if (![a?.meanLogWpm, a?.varianceLogWpm, b?.meanLogWpm, b?.varianceLogWpm].every(Number.isFinite)) return null;
  try { return comparePracticeAbilityEstimates(a, b); } catch { return null; }
}

function diagnosticDelta(earlier, later, key) {
  const a = earlier?.report?.control?.[key];
  const b = later?.report?.control?.[key];
  return Number.isFinite(a) && Number.isFinite(b) ? b - a : null;
}

export function comparePracticeAssessmentRuns(earlier, later) {
  if (!earlier || !later) return freezeDeep({ status: "not-comparable", reasons: ["missing-assessment-run"] });
  if (earlier.contextId !== later.contextId) return freezeDeep({ status: "not-comparable", reasons: ["context-mismatch"] });
  if (earlier.protocolVersion !== later.protocolVersion) return freezeDeep({ status: "not-comparable", reasons: ["protocol-mismatch"] });
  if (!earlier.report || !later.report || earlier.report.reportStatus === "invalid" || later.report.reportStatus === "invalid") return freezeDeep({ status: "not-comparable", reasons: ["invalid-or-missing-report"] });

  const earlierIds = getPracticeAssessmentBlocksForDepth(earlier.depth).map((block) => block.blockId);
  const laterIds = new Set(getPracticeAssessmentBlocksForDepth(later.depth).map((block) => block.blockId));
  const overlappingBlockIds = earlierIds.filter((id) => laterIds.has(id));
  const sameDepth = earlier.depth === later.depth;
  const completeIntegrity = earlier.report.reportStatus === "complete" && later.report.reportStatus === "complete";
  const status = sameDepth && completeIntegrity ? "comparable" : "partially-comparable";

  const earlierBenchmark = findBlock(earlier, "benchmark-natural")?.result?.evaluationSummary ?? null;
  const laterBenchmark = findBlock(later, "benchmark-natural")?.result?.evaluationSummary ?? null;
  const benchmark = earlierBenchmark && laterBenchmark
    ? comparePracticeBenchmarkMeasurements(earlierBenchmark, laterBenchmark)
    : null;
  const ability = safeAbilityComparison(earlier, later);

  return freezeDeep({
    status,
    reasons: [],
    sameDepth,
    overlappingBlockIds,
    benchmark,
    ability,
    diagnostic: {
      firstPassAccuracyDelta: diagnosticDelta(earlier, later, "firstPassAccuracy"),
      disfluencyRateDelta: diagnosticDelta(earlier, later, "disfluencyRate"),
      correctionCostMsPer1000Delta: diagnosticDelta(earlier, later, "correctionCostMsPer1000"),
      earlierBlueprintCoverage: earlier.report?.diagnosticCoverage ?? null,
      laterBlueprintCoverage: later.report?.diagnosticCoverage ?? null,
    },
    overallImprovementVerdict: null,
  });
}
