import fs from "node:fs";

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Missing validation anchor in ${path}: ${before.slice(0, 100)}`);
  fs.writeFileSync(path, source.replace(before, after));
}

function replaceIfPresent(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (source.includes(before)) fs.writeFileSync(path, source.replace(before, after));
}

replaceExact(
  "js/practiceLab/practiceValidation.js",
  'import {\n  PRACTICE_LATENCY_ANALYSIS_VERSION,\n  PRACTICE_LATENCY_CALIBRATION_STATUSES,\n  PRACTICE_LATENCY_CLASSIFIER_VERSION,\n  PRACTICE_LATENCY_CONFIDENCE_LEVELS,\n  PRACTICE_LATENCY_POLICY_V1,\n  PRACTICE_LATENCY_TRACE_SCOPES,\n} from "./practiceLatencyClassifier.js";',
  'import {\n  PRACTICE_LATENCY_ANALYSIS_VERSION,\n  PRACTICE_LATENCY_CALIBRATION_STATUSES,\n  PRACTICE_LATENCY_CLASSIFIER_VERSION,\n  PRACTICE_LATENCY_CONFIDENCE_LEVELS,\n  PRACTICE_LATENCY_POLICY_V1,\n  PRACTICE_LATENCY_TRACE_SCOPES,\n} from "./practiceLatencyClassifier.js";\nimport {\n  PRACTICE_ERROR_AGGREGATE_SCOPES,\n  PRACTICE_ERROR_ANALYSIS_VERSION,\n  PRACTICE_ERROR_ANALYZER_VERSION,\n  PRACTICE_ERROR_ALIGNMENT_POLICY_VERSION,\n  PRACTICE_ERROR_CONTENT_CLASSES,\n  PRACTICE_ERROR_STRUCTURAL_CLASSES,\n  PRACTICE_ERROR_SUMMARY_CONFIDENCE,\n  PRACTICE_ERROR_TRACE_SCOPES,\n  PRACTICE_RECOVERY_POLICY_VERSION,\n} from "./practiceErrorPolicy.js";',
);

replaceExact(
  "js/practiceLab/practiceValidation.js",
  'const FORBIDDEN_SESSION_FIELDS = Object.freeze([\n  "rawEvents", "eventTrace", "rawEventTrace", "leaderboardEligible",\n  "submissionPayload", "accessToken", "boardKey", "rulesVersion",\n]);',
  'const FORBIDDEN_SESSION_FIELDS = Object.freeze([\n  "rawEvents", "eventTrace", "rawEventTrace", "classifiedEventTrace",\n  "errorEpisodeHistory", "mistypedStrings", "rawLatencies", "leaderboardEligible",\n  "submissionPayload", "accessToken", "boardKey", "rulesVersion",\n]);',
);

const validator = [
  'export function validatePracticeErrorSummary(summary) {',
  '  const errors = [];',
  '  if (!isPlainObject(summary)) return result([{ path: "errorSummary", code: "INVALID_TYPE", message: "errorSummary must be an object" }]);',
  '  validateVersion(errors, summary.analysisVersion, PRACTICE_ERROR_ANALYSIS_VERSION, "analysisVersion");',
  '  validateVersion(errors, summary.errorAnalyzerVersion, PRACTICE_ERROR_ANALYZER_VERSION, "errorAnalyzerVersion");',
  '  validateVersion(errors, summary.alignmentPolicyVersion, PRACTICE_ERROR_ALIGNMENT_POLICY_VERSION, "alignmentPolicyVersion");',
  '  validateVersion(errors, summary.recoveryPolicyVersion, PRACTICE_RECOVERY_POLICY_VERSION, "recoveryPolicyVersion");',
  '',
  '  if (!isPlainObject(summary.coverage)) error(errors, "coverage", "INVALID_TYPE", "coverage must be an object");',
  '  else {',
  '    oneOf(errors, summary.coverage.aggregateScope, "coverage.aggregateScope", PRACTICE_ERROR_AGGREGATE_SCOPES);',
  '    oneOf(errors, summary.coverage.traceScope, "coverage.traceScope", PRACTICE_ERROR_TRACE_SCOPES);',
  '    for (const key of ["retainedEventCount", "totalEventCount", "activeEpisodeTruncatedCount"]) finite(errors, summary.coverage[key], "coverage." + key, { min: 0, integer: true });',
  '    if (typeof summary.coverage.traceTruncated !== "boolean") error(errors, "coverage.traceTruncated", "INVALID_TYPE", "traceTruncated must be boolean");',
  '    if (Number.isFinite(summary.coverage.retainedEventCount) && Number.isFinite(summary.coverage.totalEventCount) && summary.coverage.retainedEventCount > summary.coverage.totalEventCount) error(errors, "coverage.retainedEventCount", "IMPOSSIBLE_RELATIONSHIP", "retainedEventCount exceeds totalEventCount");',
  '    if (summary.coverage.traceTruncated && summary.coverage.traceScope !== "retained-window") error(errors, "coverage.traceScope", "IMPOSSIBLE_RELATIONSHIP", "truncated traces must use retained-window scope");',
  '    if (!summary.coverage.traceTruncated && summary.coverage.traceScope !== "complete-session") error(errors, "coverage.traceScope", "IMPOSSIBLE_RELATIONSHIP", "untruncated traces must use complete-session scope");',
  '  }',
  '',
  '  const countKeys = ["errorEpisodeCount", "correctedEpisodeCount", "uncorrectedEpisodeCount", "doublingEpisodeCount", "cascadeEpisodeCount", "correctionAttemptCount", "nonErrorCorrectionActionCount", "ignoredCorrectionActionCount", "disabledCorrectionAttemptCount", "charactersRemoved", "incorrectCharactersRemoved", "correctCharactersRemoved"];',
  '  for (const key of countKeys) finite(errors, summary[key], key, { min: 0, integer: true });',
  '  if (summary.correctedEpisodeCount + summary.uncorrectedEpisodeCount !== summary.errorEpisodeCount) error(errors, "errorEpisodeCount", "IMPOSSIBLE_RELATIONSHIP", "corrected + uncorrected episode counts must equal errorEpisodeCount");',
  '  if (summary.doublingEpisodeCount > summary.errorEpisodeCount || summary.cascadeEpisodeCount > summary.errorEpisodeCount) error(errors, "errorEpisodeCount", "IMPOSSIBLE_RELATIONSHIP", "episode subtype counts exceed total episodes");',
  '',
  '  if (!isPlainObject(summary.structuralCounts)) error(errors, "structuralCounts", "INVALID_TYPE", "structuralCounts must be an object");',
  '  else {',
  '    for (const key of PRACTICE_ERROR_STRUCTURAL_CLASSES) finite(errors, summary.structuralCounts[key], "structuralCounts." + key, { min: 0, integer: true });',
  '    const structuralTotal = PRACTICE_ERROR_STRUCTURAL_CLASSES.reduce((sum, key) => sum + (Number.isInteger(summary.structuralCounts[key]) ? summary.structuralCounts[key] : 0), 0);',
  '    if (structuralTotal !== summary.errorEpisodeCount) error(errors, "structuralCounts", "IMPOSSIBLE_RELATIONSHIP", "structural counts must equal errorEpisodeCount");',
  '  }',
  '',
  '  if (!isPlainObject(summary.contentCounts)) error(errors, "contentCounts", "INVALID_TYPE", "contentCounts must be an object");',
  '  else {',
  '    const contentKeys = PRACTICE_ERROR_CONTENT_CLASSES.map((key) => key === "whitespace-boundary" ? "whitespaceBoundary" : key);',
  '    for (const key of contentKeys) finite(errors, summary.contentCounts[key], "contentCounts." + key, { min: 0, integer: true });',
  '    const contentTotal = contentKeys.reduce((sum, key) => sum + (Number.isInteger(summary.contentCounts[key]) ? summary.contentCounts[key] : 0), 0);',
  '    if (contentTotal !== summary.errorEpisodeCount) error(errors, "contentCounts", "IMPOSSIBLE_RELATIONSHIP", "content counts must equal errorEpisodeCount");',
  '  }',
  '',
  '  if (summary.incorrectCharactersRemoved + summary.correctCharactersRemoved !== summary.charactersRemoved) error(errors, "charactersRemoved", "IMPOSSIBLE_RELATIONSHIP", "removed character classes must equal charactersRemoved");',
  '  if (summary.charactersRemoved === 0) {',
  '    if (summary.overDeletionRate != null) error(errors, "overDeletionRate", "IMPOSSIBLE_RELATIONSHIP", "overDeletionRate must be null without removed characters");',
  '  } else {',
  '    finite(errors, summary.overDeletionRate, "overDeletionRate", { min: 0, max: 1 });',
  '    if (Number.isFinite(summary.overDeletionRate) && Math.abs(summary.overDeletionRate - summary.correctCharactersRemoved / summary.charactersRemoved) > 1e-12) error(errors, "overDeletionRate", "IMPOSSIBLE_RELATIONSHIP", "overDeletionRate denominator is inconsistent");',
  '  }',
  '',
  '  for (const key of ["correctionInitiationMedianMs", "correctionDistanceMedianChars", "correctionToRepairMedianMs", "errorToRepairMedianMs", "repairToResumeMedianMs", "resumeToFluentMedianMs"]) if (summary[key] != null) finite(errors, summary[key], key, { min: 0 });',
  '  if (summary.errorEpisodeCount === 0) {',
  '    if (summary.correctedEpisodeRate != null) error(errors, "correctedEpisodeRate", "IMPOSSIBLE_RELATIONSHIP", "correctedEpisodeRate must be null without episodes");',
  '  } else {',
  '    finite(errors, summary.correctedEpisodeRate, "correctedEpisodeRate", { min: 0, max: 1 });',
  '    if (Number.isFinite(summary.correctedEpisodeRate) && Math.abs(summary.correctedEpisodeRate - summary.correctedEpisodeCount / summary.errorEpisodeCount) > 1e-12) error(errors, "correctedEpisodeRate", "IMPOSSIBLE_RELATIONSHIP", "correctedEpisodeRate denominator is inconsistent");',
  '  }',
  '  if (summary.episodesPer1000Insertions != null) finite(errors, summary.episodesPer1000Insertions, "episodesPer1000Insertions", { min: 0 });',
  '  oneOf(errors, summary.classificationConfidence, "classificationConfidence", PRACTICE_ERROR_SUMMARY_CONFIDENCE);',
  '  return result(errors);',
  '}',
  '',
].join("\n");

replaceExact("js/practiceLab/practiceValidation.js", "export function validateSessionSummary(summary) {", validator + "export function validateSessionSummary(summary) {");
replaceExact(
  "js/practiceLab/practiceValidation.js",
  '  if (summary.fluencySummary != null) errors.push(...validatePracticeFluencySummary(summary.fluencySummary).errors.map((entry) => ({ ...entry, path: `fluencySummary.${entry.path}` })));\n  appendSerializable(errors, summary.configuration, "configuration");',
  '  if (summary.fluencySummary != null) errors.push(...validatePracticeFluencySummary(summary.fluencySummary).errors.map((entry) => ({ ...entry, path: `fluencySummary.${entry.path}` })));\n  if (summary.errorSummary != null) errors.push(...validatePracticeErrorSummary(summary.errorSummary).errors.map((entry) => ({ ...entry, path: `errorSummary.${entry.path}` })));\n  appendSerializable(errors, summary.configuration, "configuration");',
);

replaceIfPresent("tests/practice-context-identity.test.js", "assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 3);", "assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 4);");
replaceIfPresent("tests/practice-profile-migration.test.js", "  sessionSummary: 3,", "  sessionSummary: 4,");
replaceIfPresent("tests/practice-latency-session-integration.test.js", "  assert.equal(result.summary.recordVersion, 3);", "  assert.equal(result.summary.recordVersion, 4);");

console.log("PL9 validation/version patches applied");
