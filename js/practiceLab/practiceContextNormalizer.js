import {
  practiceMedian,
  practiceQuantile,
} from "./practiceRobustStats.js";
import { createPracticeTransitionContextResolver } from "./practiceContextFeatures.js";
import { createUnavailablePracticeReferenceFrequencyProvider } from "./practiceReferenceFrequency.js";

export const PRACTICE_CONTEXT_MODEL_VERSION = 1;
export const PRACTICE_CONTEXT_POLICY_VERSION = 1;

export const PRACTICE_CONTEXT_NORMALIZATION_STATUSES = Object.freeze([
  "normalized",
  "insufficient-data",
]);

export const PRACTICE_CONTEXT_POLICY_V1 = Object.freeze({
  version: PRACTICE_CONTEXT_POLICY_VERSION,
  minimumBucketSamples: 4,
  priorStrength: 12,
  residualRatioMin: -0.95,
  residualRatioMax: 10,
});

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finiteLatency = (value) => Number.isFinite(value) && value >= 0;

function validatePolicy(policy) {
  if (!policy || policy.version !== PRACTICE_CONTEXT_POLICY_VERSION) throw new TypeError("Unsupported Practice context policy version");
  if (!Number.isInteger(policy.minimumBucketSamples) || policy.minimumBucketSamples < 1) throw new TypeError("Practice minimumBucketSamples must be positive");
  if (!Number.isFinite(policy.priorStrength) || policy.priorStrength <= 0) throw new TypeError("Practice priorStrength must be positive");
  if (!Number.isFinite(policy.residualRatioMin) || !Number.isFinite(policy.residualRatioMax) || policy.residualRatioMin >= policy.residualRatioMax) throw new TypeError("Practice residual-ratio clamp is invalid");
  return policy;
}

function validLevel1(features) {
  return features.structuralClass !== "unknown" && features.wordPositionClass !== "unknown";
}
function validLevel2(features) {
  return validLevel1(features) && features.geometryClass !== "unknown";
}
function validLevel3(features) {
  return validLevel2(features)
    && features.wordFrequencyBand !== "unknown"
    && features.bigramFrequencyBand !== "unknown";
}

function keyPart(value) {
  return `${String(value).length}:${String(value)}`;
}
function bucketKey(level, features) {
  if (level === 1) return [features.structuralClass, features.wordPositionClass].map(keyPart).join("|");
  if (level === 2) return [features.structuralClass, features.wordPositionClass, features.geometryClass].map(keyPart).join("|");
  return [features.structuralClass, features.wordPositionClass, features.geometryClass, features.wordFrequencyBand, features.bigramFrequencyBand].map(keyPart).join("|");
}

function collectBucket(map, key, latency) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(latency);
}

function finalizeBuckets(samples) {
  const result = new Map();
  for (const [key, values] of samples) result.set(key, Object.freeze({
    sampleCount: values.length,
    medianMs: practiceMedian(values),
  }));
  return result;
}

function shrinkEstimate(bucket, parent, policy) {
  if (!bucket || bucket.sampleCount < policy.minimumBucketSamples || !finiteLatency(bucket.medianMs) || !finiteLatency(parent)) return parent;
  const weight = bucket.sampleCount / (bucket.sampleCount + policy.priorStrength);
  return weight * bucket.medianMs + (1 - weight) * parent;
}

function summarizeCounts(values) {
  return Object.freeze({
    global: values.global,
    level1: values.level1,
    level2: values.level2,
    level3: values.level3,
  });
}

export function normalizePracticeContextLatency({
  latencyAnalysis,
  contentAnalysis,
  context,
  frequencyProvider = null,
  policy = PRACTICE_CONTEXT_POLICY_V1,
} = {}) {
  validatePolicy(policy);
  if (!latencyAnalysis || !Array.isArray(latencyAnalysis.classifiedTransitions)) throw new TypeError("Practice context normalization requires PL8 classified transitions");
  if (!contentAnalysis) throw new TypeError("Practice context normalization requires analyzed content");
  const provider = frequencyProvider ?? createUnavailablePracticeReferenceFrequencyProvider({ language: contentAnalysis.language });
  const resolver = createPracticeTransitionContextResolver({ contentAnalysis, context, frequencyProvider: provider });
  const enriched = latencyAnalysis.classifiedTransitions.map((transition) => Object.freeze({
    transition,
    features: resolver.resolve(transition),
  }));

  const globalFluentMedianMs = finiteLatency(latencyAnalysis.sessionSummary?.fluentMedianMs)
    ? latencyAnalysis.sessionSummary.fluentMedianMs
    : null;
  const bucketSamples = [null, new Map(), new Map(), new Map()];
  const fitTransitions = enriched.filter(({ transition }) =>
    transition.classification === "fluent"
    && (transition.correctness === "correct" || transition.correctness === true)
    && finiteLatency(transition.latencyMs),
  );
  for (const { transition, features } of fitTransitions) {
    if (validLevel1(features)) collectBucket(bucketSamples[1], bucketKey(1, features), transition.latencyMs);
    if (validLevel2(features)) collectBucket(bucketSamples[2], bucketKey(2, features), transition.latencyMs);
    if (validLevel3(features)) collectBucket(bucketSamples[3], bucketKey(3, features), transition.latencyMs);
  }
  const buckets = [null, finalizeBuckets(bucketSamples[1]), finalizeBuckets(bucketSamples[2]), finalizeBuckets(bucketSamples[3])];
  const contextLevelCounts = { global: 0, level1: 0, level2: 0, level3: 0 };
  let classifiable = 0;
  let normalizable = 0;
  let geometryKnown = 0;
  let frequencyKnown = 0;
  const residualMsValues = [];
  const residualRatioValues = [];

  const normalizedTransitions = enriched.map(({ transition, features }) => {
    const classifiableTransition = ["fluent", "disfluent"].includes(transition.classification) && finiteLatency(transition.latencyMs);
    if (classifiableTransition) {
      classifiable += 1;
      if (features.geometryKnown) geometryKnown += 1;
      if (features.wordFrequencyKnown && features.bigramFrequencyKnown) frequencyKnown += 1;
    }
    let expectedLatencyMs = null;
    let contextLevelUsed = null;
    if (classifiableTransition && finiteLatency(globalFluentMedianMs)) {
      expectedLatencyMs = globalFluentMedianMs;
      contextLevelUsed = 0;
      if (validLevel1(features)) {
        const bucket = buckets[1].get(bucketKey(1, features));
        if (bucket?.sampleCount >= policy.minimumBucketSamples) {
          expectedLatencyMs = shrinkEstimate(bucket, expectedLatencyMs, policy);
          contextLevelUsed = 1;
        }
      }
      if (validLevel2(features)) {
        const bucket = buckets[2].get(bucketKey(2, features));
        if (bucket?.sampleCount >= policy.minimumBucketSamples) {
          expectedLatencyMs = shrinkEstimate(bucket, expectedLatencyMs, policy);
          contextLevelUsed = 2;
        }
      }
      if (validLevel3(features)) {
        const bucket = buckets[3].get(bucketKey(3, features));
        if (bucket?.sampleCount >= policy.minimumBucketSamples) {
          expectedLatencyMs = shrinkEstimate(bucket, expectedLatencyMs, policy);
          contextLevelUsed = 3;
        }
      }
    }
    const residualLatencyMs = finiteLatency(expectedLatencyMs) ? transition.latencyMs - expectedLatencyMs : null;
    const residualRatio = finiteLatency(expectedLatencyMs) && expectedLatencyMs > 0
      ? clamp(transition.latencyMs / expectedLatencyMs - 1, policy.residualRatioMin, policy.residualRatioMax)
      : null;
    if (Number.isFinite(residualLatencyMs)) residualMsValues.push(residualLatencyMs);
    if (Number.isFinite(residualRatio)) residualRatioValues.push(residualRatio);
    if (contextLevelUsed != null) {
      normalizable += 1;
      if (contextLevelUsed === 0) contextLevelCounts.global += 1;
      else contextLevelCounts[`level${contextLevelUsed}`] += 1;
    }
    return freezeDeep({
      eventIndex: transition.eventIndex,
      textPosition: transition.textPosition,
      observedLatencyMs: finiteLatency(transition.latencyMs) ? transition.latencyMs : null,
      expectedLatencyMs,
      residualLatencyMs,
      residualRatio,
      contextLevelUsed,
      features,
      latencyClass: transition.classification,
      correctness: transition.correctness,
    });
  });

  const eligibleBucket = (entry) => entry.sampleCount >= policy.minimumBucketSamples;
  const specificBucketCount = [...buckets[3].values()].filter(eligibleBucket).length;
  const coarseBucketCount = [...buckets[1].values(), ...buckets[2].values()].filter(eligibleBucket).length;
  const coverage = freezeDeep({
    traceScope: latencyAnalysis.coverage?.scope ?? "complete-session",
    normalizableTransitionCount: normalizable,
    totalClassifiableTransitionCount: classifiable,
    normalizationCoverageRate: classifiable > 0 ? normalizable / classifiable : null,
    geometryKnownCount: geometryKnown,
    geometryUnknownCount: Math.max(0, classifiable - geometryKnown),
    geometryCoverageRate: classifiable > 0 ? geometryKnown / classifiable : null,
    frequencyKnownCount: frequencyKnown,
    frequencyUnknownCount: Math.max(0, classifiable - frequencyKnown),
    frequencyCoverageRate: classifiable > 0 ? frequencyKnown / classifiable : null,
    specificBucketCount,
    coarseBucketCount,
    contextLevelCounts: summarizeCounts(contextLevelCounts),
  });
  const status = finiteLatency(globalFluentMedianMs) ? "normalized" : "insufficient-data";
  return freezeDeep({
    contextModelVersion: PRACTICE_CONTEXT_MODEL_VERSION,
    contextPolicyVersion: PRACTICE_CONTEXT_POLICY_VERSION,
    status,
    policy: { ...policy },
    globalFluentMedianMs,
    fitFluentTransitionCount: fitTransitions.length,
    transitionModel: {
      hierarchy: ["global", "structural+word-position", "structural+word-position+geometry", "structural+word-position+geometry+frequency"],
      minimumBucketSamples: policy.minimumBucketSamples,
      priorStrength: policy.priorStrength,
      level1EligibleBucketCount: [...buckets[1].values()].filter(eligibleBucket).length,
      level2EligibleBucketCount: [...buckets[2].values()].filter(eligibleBucket).length,
      level3EligibleBucketCount: specificBucketCount,
    },
    normalizedTransitions,
    sessionSummary: {
      status,
      coverage,
      globalFluentMedianMs,
      normalizableTransitionCount: normalizable,
      normalizedResidualMedianMs: residualMsValues.length ? practiceMedian(residualMsValues) : null,
      normalizedResidualP90Ms: residualMsValues.length ? practiceQuantile(residualMsValues, 0.9) : null,
      normalizedResidualMedianRatio: residualRatioValues.length ? practiceMedian(residualRatioValues) : null,
      geometryCoverageRate: coverage.geometryCoverageRate,
      frequencyCoverageRate: coverage.frequencyCoverageRate,
      contextLevelCounts: coverage.contextLevelCounts,
    },
  });
}
