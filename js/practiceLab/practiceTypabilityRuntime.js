import { PRACTICE_TYPABILITY_RUNTIME_ARTIFACTS } from "./generated/practiceTypabilityRuntimeData.js";
import {
  PRACTICE_TYPABILITY_MODEL_VERSION,
  PRACTICE_TYPABILITY_REFERENCE_VERSION,
  validatePracticeTypabilityReference,
} from "./practiceTypabilityModel.js";

function languageBase(value) {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/_/g, "-").toLowerCase().split("-")[0]
    : "und";
}

export function resolvePracticeTypabilityRuntime({
  language,
  modelVersion = PRACTICE_TYPABILITY_MODEL_VERSION,
  referenceVersion = PRACTICE_TYPABILITY_REFERENCE_VERSION,
} = {}) {
  if (modelVersion !== PRACTICE_TYPABILITY_MODEL_VERSION || referenceVersion !== PRACTICE_TYPABILITY_REFERENCE_VERSION) return null;
  const runtime = PRACTICE_TYPABILITY_RUNTIME_ARTIFACTS[languageBase(language)] ?? null;
  if (!runtime) return null;
  const validation = validatePracticeTypabilityReference(runtime.reference);
  if (!validation.valid) return null;
  if (runtime.reference.modelVersion !== modelVersion || runtime.reference.referenceVersion !== referenceVersion) return null;
  return runtime;
}
