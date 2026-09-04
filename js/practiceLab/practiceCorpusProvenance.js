import { validatePracticeCorpusSource, validatePracticeCorpusSourceRegistry } from "./practiceCorpusValidation.js";

function provenanceError(code, message, details = null) {
  const error = new TypeError(message);
  error.code = code;
  error.details = details;
  return error;
}

export function createPracticeSourceIndex(registry) {
  const validation = validatePracticeCorpusSourceRegistry(registry);
  if (!validation.valid) throw provenanceError("PRACTICE_CORPUS_INVALID_SOURCE_REGISTRY", "Practice corpus source registry is invalid", validation.errors);
  return new Map(registry.sources.map((source) => [source.sourceId, source]));
}

export function resolvePracticeCorpusSource(sourceId, registryOrIndex) {
  const index = registryOrIndex instanceof Map ? registryOrIndex : createPracticeSourceIndex(registryOrIndex);
  return index.get(sourceId) ?? null;
}

export function getPracticeSourceUsageEligibility(source, requestedUse, { allowTestFixtures = false } = {}) {
  const validation = validatePracticeCorpusSource(source);
  if (!validation.valid) return { allowed: false, reason: "invalid-source", errors: validation.errors };
  switch (requestedUse) {
    case "production-display":
      return source.usageApproval === "practice-display-approved"
        ? { allowed: true, reason: "explicit-display-approval" }
        : { allowed: false, reason: `usage-${source.usageApproval}` };
    case "statistical-reference":
      return ["practice-display-approved", "statistical-only"].includes(source.usageApproval)
        ? { allowed: true, reason: "explicit-statistical-approval" }
        : { allowed: false, reason: `usage-${source.usageApproval}` };
    case "test":
      return source.usageApproval === "test-only" && allowTestFixtures
        ? { allowed: true, reason: "explicit-test-approval" }
        : { allowed: false, reason: `usage-${source.usageApproval}` };
    default:
      return { allowed: false, reason: "unknown-requested-use" };
  }
}

export function assertPracticeSourceUsage({ sourceId, registry, index = null, requestedUse = "production-display", allowTestFixtures = false } = {}) {
  const resolvedIndex = index ?? createPracticeSourceIndex(registry);
  const source = resolvePracticeCorpusSource(sourceId, resolvedIndex);
  if (!source) throw provenanceError("PRACTICE_CORPUS_UNKNOWN_SOURCE", `Unknown Practice corpus source: ${sourceId}`);
  const eligibility = getPracticeSourceUsageEligibility(source, requestedUse, { allowTestFixtures });
  if (!eligibility.allowed) throw provenanceError("PRACTICE_CORPUS_SOURCE_NOT_APPROVED", `Practice corpus source ${sourceId} is not approved for ${requestedUse}`, { sourceId, requestedUse, usageApproval: source.usageApproval, reason: eligibility.reason });
  return source;
}
