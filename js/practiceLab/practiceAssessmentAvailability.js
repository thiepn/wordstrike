import {
  PRACTICE_ASSESSMENT_DEPTHS,
  PRACTICE_ASSESSMENT_DEPTH_BLOCK_COUNTS,
} from "./practiceAssessmentConstants.js";

const REQUIRED_DIAGNOSTICS = Object.freeze({
  quick: ["diagnostic-core-keys", "diagnostic-word-launch"],
  standard: ["diagnostic-core-keys", "diagnostic-word-launch", "diagnostic-combinations", "diagnostic-punctuation-capitals", "diagnostic-numbers-symbols"],
  deep: ["diagnostic-core-keys", "diagnostic-word-launch", "diagnostic-combinations", "diagnostic-punctuation-capitals", "diagnostic-numbers-symbols", "diagnostic-lexical-extended", "diagnostic-combinations-extended", "diagnostic-mixed"],
});

export function getPracticeAssessmentAvailability({
  language,
  benchmarkSuites = [],
  diagnosticRegistry,
  transferPools = [],
  transferReservable = true,
} = {}) {
  const compatibleBenchmark = benchmarkSuites.find((suite) => suite?.status === "ready" && suite?.language === language) ?? null;
  const compatibleTransfer = transferPools.find((pool) => pool?.status === "ready" && pool?.language === language) ?? null;
  const artifact = diagnosticRegistry?.getArtifact?.(language) ?? null;
  const availability = {};
  for (const depth of PRACTICE_ASSESSMENT_DEPTHS) {
    const reasons = [];
    if (!language) reasons.push("Language not supported");
    if (!compatibleBenchmark) reasons.push("Compatible ready benchmark suite unavailable");
    if (!artifact || artifact.status !== "ready") reasons.push("Diagnostic forms not ready");
    for (const blockId of REQUIRED_DIAGNOSTICS[depth]) {
      if (!diagnosticRegistry?.isBlockReady?.(language, blockId)) reasons.push(`Diagnostic form set not ready: ${blockId}`);
    }
    if (depth === "deep" && (!compatibleTransfer || !transferReservable)) reasons.push("Cold-transfer pool unavailable");
    availability[depth] = Object.freeze({
      depth,
      available: reasons.length === 0,
      reasons: Object.freeze([...new Set(reasons)]),
      blockCount: PRACTICE_ASSESSMENT_DEPTH_BLOCK_COUNTS[depth],
    });
  }
  const recommendedDepth = ["deep", "standard", "quick"].find((depth) => availability[depth].available) ?? null;
  return Object.freeze({
    language: language ?? null,
    recommendedDepth,
    benchmarkSuiteId: compatibleBenchmark?.suiteId ?? null,
    transferPoolId: compatibleTransfer?.poolId ?? null,
    depths: Object.freeze(availability),
  });
}
