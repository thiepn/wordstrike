import { analyzePracticeText } from "./practiceTextAnalysis.js";
import { extractPracticeTextDifficultyFeatures, PRACTICE_TEXT_FEATURE_VERSION } from "./practiceTextDifficultyFeatures.js";
import {
  PRACTICE_TYPABILITY_MODEL_KIND,
  PRACTICE_TYPABILITY_MODEL_VERSION,
  PRACTICE_TYPABILITY_REFERENCE_VERSION,
  scorePracticeTextTypability,
} from "./practiceTypabilityModel.js";
import { resolvePracticeTypabilityRuntime } from "./practiceTypabilityRuntime.js";
import { createUnavailablePracticeReferenceFrequencyProvider } from "./practiceReferenceFrequency.js";
import {
  PRACTICE_CONTEXT_MODEL_VERSION,
  PRACTICE_CONTEXT_POLICY_VERSION,
  normalizePracticeContextLatency,
} from "./practiceContextNormalizer.js";
import { PRACTICE_KEYBOARD_GEOMETRY_VERSION } from "./practiceKeyboardGeometry.js";
import { PRACTICE_NORMALIZATION_ANALYSIS_VERSION } from "./practiceNormalizationConstants.js";

export { PRACTICE_NORMALIZATION_ANALYSIS_VERSION } from "./practiceNormalizationConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function languageFrom({ contentPlan, context }) {
  const explicit = contentPlan?.metadata?.language;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim().replace(/_/g, "-").toLowerCase();
  if (typeof context?.dataLocale === "string" && context.dataLocale.trim()) return context.dataLocale.trim().replace(/_/g, "-").toLowerCase();
  return "und";
}

function unavailableTextDifficulty(language) {
  const english = String(language).split("-")[0] === "en";
  return freezeDeep({
    status: english ? "insufficient" : "unsupported-language",
    modelKind: PRACTICE_TYPABILITY_MODEL_KIND,
    modelVersion: PRACTICE_TYPABILITY_MODEL_VERSION,
    referenceVersion: PRACTICE_TYPABILITY_REFERENCE_VERSION,
    difficultyIndex: null,
    relativeDifficultyPercentile: null,
    availableModelWeight: 0,
    effectiveWeights: {},
    standardizedFeatures: {},
    contributions: {},
    referenceItemCount: 0,
    percentileMethod: "empirical-midrank-v1",
  });
}

function resolveStaticRecord(contentPlan, runtime) {
  if (!runtime || !contentPlan) return null;
  const candidate = runtime.staticScoresBySessionContentHash?.[contentPlan.contentHash] ?? null;
  if (!candidate) return null;
  const metadata = contentPlan.metadata ?? {};
  if (metadata.corpusId !== runtime.reference.corpusId) return null;
  if (Number(metadata.corpusVersion) !== runtime.reference.corpusVersion) return null;
  if (metadata.sourceContentId !== candidate.contentId) return null;
  if (metadata.sourceContentHash !== candidate.contentHash) return null;
  if (candidate.sessionContentHash !== contentPlan.contentHash) return null;
  return candidate;
}

function compactTextDifficulty({ score, features, staticRecord, contentPlan, reference }) {
  return freezeDeep({
    status: score.status,
    modelKind: score.modelKind,
    difficultyIndex: score.difficultyIndex,
    relativeDifficultyPercentile: score.relativeDifficultyPercentile,
    availableModelWeight: score.availableModelWeight,
    wordFrequencyCoverageRate: features?.frequencyCoverage?.wordFrequencyCoverageRate ?? null,
    bigramFrequencyCoverageRate: features?.frequencyCoverage?.bigramFrequencyCoverageRate ?? null,
    corpusId: staticRecord ? reference?.corpusId ?? null : null,
    corpusVersion: staticRecord ? reference?.corpusVersion ?? null : null,
    contentId: staticRecord?.contentId ?? contentPlan?.contentId ?? null,
    contentHash: contentPlan?.contentHash ?? null,
    referenceItemCount: score.referenceItemCount ?? 0,
    staticMetadataUsed: Boolean(staticRecord),
  });
}

function compactContext(context) {
  return freezeDeep({
    contextFingerprint: context.fingerprint,
    dataLocale: context.dataLocale,
    keyboardLayout: context.keyboardLayout,
    inputMethod: context.inputMethod,
  });
}

export function analyzePracticeNormalization({
  latencyAnalysis,
  contentPlan,
  context,
  segmenter = null,
  typabilityReference = null,
  staticScoresBySessionContentHash = null,
  frequencyProvider = null,
} = {}) {
  if (!contentPlan || !context || !latencyAnalysis) return freezeDeep({
    version: PRACTICE_NORMALIZATION_ANALYSIS_VERSION,
    context: context ?? null,
    textDifficulty: { features: null, score: unavailableTextDifficulty("und"), source: "unavailable" },
    transitionModel: null,
    normalizedTransitions: [],
    sessionSummary: null,
  });
  const language = languageFrom({ contentPlan, context });
  const runtime = typabilityReference
    ? null
    : resolvePracticeTypabilityRuntime({ language });
  const reference = typabilityReference ?? runtime?.reference ?? null;
  const staticRuntime = staticScoresBySessionContentHash
    ? { reference, staticScoresBySessionContentHash }
    : runtime;
  const provider = frequencyProvider ?? createUnavailablePracticeReferenceFrequencyProvider({ language });
  const contentAnalysis = analyzePracticeText({ text: contentPlan.text, language, segmenter });
  const staticRecord = resolveStaticRecord(contentPlan, staticRuntime);
  const features = staticRecord?.features ?? extractPracticeTextDifficultyFeatures({
    text: contentPlan.text,
    language,
    segmenter,
    analysis: contentAnalysis,
    frequencyProvider: provider,
  });
  const score = staticRecord?.textDifficulty ?? (reference
    ? scorePracticeTextTypability({ features, reference, language })
    : unavailableTextDifficulty(language));
  const transition = normalizePracticeContextLatency({
    latencyAnalysis,
    contentAnalysis,
    context,
    frequencyProvider: provider,
  });
  const frequencyReferenceVersion = provider.metadata?.referenceVersion ?? reference?.frequencyReferenceVersion ?? null;
  const sessionSummary = freezeDeep({
    analysisVersion: PRACTICE_NORMALIZATION_ANALYSIS_VERSION,
    contextModelVersion: PRACTICE_CONTEXT_MODEL_VERSION,
    contextPolicyVersion: PRACTICE_CONTEXT_POLICY_VERSION,
    textFeatureVersion: PRACTICE_TEXT_FEATURE_VERSION,
    typabilityModelVersion: PRACTICE_TYPABILITY_MODEL_VERSION,
    typabilityReferenceVersion: PRACTICE_TYPABILITY_REFERENCE_VERSION,
    frequencyReferenceVersion,
    keyboardGeometryVersion: PRACTICE_KEYBOARD_GEOMETRY_VERSION,
    context: compactContext(context),
    transitionNormalization: transition.sessionSummary,
    textDifficulty: compactTextDifficulty({ score, features, staticRecord, contentPlan, reference }),
  });
  return freezeDeep({
    version: PRACTICE_NORMALIZATION_ANALYSIS_VERSION,
    context,
    textDifficulty: {
      language,
      features,
      score,
      source: staticRecord ? "precomputed-static" : "dynamic",
      staticBinding: staticRecord ? {
        contentId: staticRecord.contentId,
        contentHash: staticRecord.contentHash,
        sessionContentHash: staticRecord.sessionContentHash,
      } : null,
    },
    transitionModel: transition.transitionModel,
    normalizedTransitions: transition.normalizedTransitions,
    sessionSummary,
  });
}
