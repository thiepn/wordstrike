import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);
const replaceOnce = (source, search, replacement, label) => {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`PL11 patch missing anchor: ${label}`);
  if (source.indexOf(search, index + search.length) >= 0) throw new Error(`PL11 patch ambiguous anchor: ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + search.length);
};
const replaceRegex = (source, regex, replacement, label) => {
  const matches = [...source.matchAll(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g"))];
  if (matches.length !== 1) throw new Error(`PL11 patch expected one ${label}, found ${matches.length}`);
  return source.replace(regex, replacement);
};

// practiceSkillEvidenceValidation.js: retain historical pattern entity records.
{
  const file = "js/practiceLab/practiceSkillEvidenceValidation.js";
  let source = read(file);
  source = replaceOnce(source,
`import {
  CONFIDENCE_LEVELS,
  LATENCY_HISTOGRAM_BOUNDS_MS,`,
`import {
  CONFIDENCE_LEVELS,
  ENTITY_TYPES,
  LATENCY_HISTOGRAM_BOUNDS_MS,`, "skill validation ENTITY_TYPES import");
  source = replaceOnce(source,
`  if (type === "word") return /^[\\p{L}\\p{M}'-]{1,64}$/u.test(key);
  return false;`,
`  if (type === "word") return /^[\\p{L}\\p{M}'-]{1,64}$/u.test(key);
  if (["punctuation-transition", "number-pattern", "symbol-pattern"].includes(type)) return /^[a-z0-9][a-z0-9-]{0,79}$/.test(key);
  return false;`, "pattern entity validation");
  source = replaceOnce(source,
`  if (!validEntity(stat.entityType, stat.entityKey)) push(errors, "entityKey", "INVALID_ENTITY", "invalid canonical PL11 entity");`,
`  if (!ENTITY_TYPES.includes(stat.entityType) || !validEntity(stat.entityType, stat.entityKey)) push(errors, "entityKey", "INVALID_ENTITY", "invalid Practice skill entity");`, "skill entity enum validation");
  write(file, source);
}

// practiceValidation.js: delegate v3 stat validation, add skill summary/checkpoint validation.
{
  const file = "js/practiceLab/practiceValidation.js";
  let source = read(file);
  source = replaceOnce(source,
`import { validatePracticeNormalizationSummary } from "./practiceNormalizationValidation.js";`,
`import { validatePracticeNormalizationSummary } from "./practiceNormalizationValidation.js";
import { validatePracticeSkillStatV3 } from "./practiceSkillEvidenceValidation.js";
import {
  PRACTICE_EVIDENCE_ACCURACY_SCOPES,
  PRACTICE_EVIDENCE_ROLES,
  PRACTICE_EVIDENCE_TIMING_SCOPES,
  PRACTICE_SKILL_EVIDENCE_POLICY_V1,
  PRACTICE_SKILL_EVIDENCE_POLICY_VERSION,
  PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION,
  PRACTICE_SKILL_EVIDENCE_VERSION,
} from "./practiceSkillEvidencePolicy.js";`, "validation PL11 imports");
  source = replaceOnce(source,
`  "errorEpisodeHistory", "mistypedStrings", "rawLatencies", "normalizationTrace",
  "normalizedTransitions", "typabilityFeatureVector", "leaderboardEligible",`,
`  "errorEpisodeHistory", "mistypedStrings", "rawLatencies", "normalizationTrace",
  "normalizedTransitions", "typabilityFeatureVector", "skillEvidenceDeltas", "leaderboardEligible",`, "forbidden session evidence deltas");
  source = replaceRegex(source,
/export function validateSkillStat\(stat\) \{[\s\S]*?\n\}\n\nfunction appendSerializable/,
`export function validateSkillStat(stat) {
  return validatePracticeSkillStatV3(stat);
}

function appendSerializable`, "validateSkillStat block");

  const summaryValidator = `
export function validatePracticeSkillEvidenceSummary(summary) {
  const errors = [];
  if (!isPlainObject(summary)) return result([{ path: "skillEvidenceSummary", code: "INVALID_TYPE", message: "skillEvidenceSummary must be an object" }]);
  validateVersion(errors, summary.analysisVersion, 1, "analysisVersion");
  validateVersion(errors, summary.evidenceVersion, PRACTICE_SKILL_EVIDENCE_VERSION, "evidenceVersion");
  validateVersion(errors, summary.policyVersion, PRACTICE_SKILL_EVIDENCE_POLICY_VERSION, "policyVersion");
  oneOf(errors, summary.evidenceRole, "evidenceRole", PRACTICE_EVIDENCE_ROLES);
  if (!isPlainObject(summary.entityCounts)) error(errors, "entityCounts", "INVALID_TYPE", "entityCounts must be an object");
  else for (const key of ["key", "bigram", "trigram", "word"]) finite(errors, summary.entityCounts[key], \`entityCounts.\${key}\`, { min: 0, integer: true });
  for (const key of ["opportunityCount", "fluentTimingCount", "disfluentTimingCount", "normalizedResidualCount", "primaryErrorEpisodeCount", "directTargetEntityCount", "omittedObservationCount"]) finite(errors, summary[key], key, { min: 0, integer: true });
  oneOf(errors, summary.accuracyScope, "accuracyScope", PRACTICE_EVIDENCE_ACCURACY_SCOPES);
  oneOf(errors, summary.timingScope, "timingScope", PRACTICE_EVIDENCE_TIMING_SCOPES);
  if (typeof summary.entityCoverageTruncated !== "boolean") error(errors, "entityCoverageTruncated", "INVALID_TYPE", "entityCoverageTruncated must be boolean");
  const entityTotal = isPlainObject(summary.entityCounts) ? ["key", "bigram", "trigram", "word"].reduce((sum, key) => sum + Number(summary.entityCounts[key] || 0), 0) : 0;
  if (summary.directTargetEntityCount > entityTotal) error(errors, "directTargetEntityCount", "IMPOSSIBLE_RELATIONSHIP", "direct target entities exceed entity count");
  if (summary.normalizedResidualCount > summary.fluentTimingCount + summary.disfluentTimingCount) error(errors, "normalizedResidualCount", "IMPOSSIBLE_RELATIONSHIP", "normalized residual count exceeds timing evidence");
  return result(errors);
}

function validateSkillEvidenceTrackerSnapshot(snapshot, errors, path = "metricsSnapshot.skillEvidenceTrackerSnapshot") {
  if (snapshot == null) return;
  if (!isPlainObject(snapshot)) return error(errors, path, "INVALID_TYPE", "skill evidence tracker snapshot must be an object or null");
  validateVersion(errors, snapshot.trackerVersion, PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION, \`\${path}.trackerVersion\`);
  validateVersion(errors, snapshot.policyVersion, PRACTICE_SKILL_EVIDENCE_POLICY_VERSION, \`\${path}.policyVersion\`);
  if (!isPlainObject(snapshot.opportunityTracker)) error(errors, \`\${path}.opportunityTracker\`, "INVALID_TYPE", "opportunity tracker snapshot is required");
  else {
    validateVersion(errors, snapshot.opportunityTracker.trackerVersion, PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION, \`\${path}.opportunityTracker.trackerVersion\`);
    finite(errors, snapshot.opportunityTracker.maxFirstAttemptCursor, \`\${path}.opportunityTracker.maxFirstAttemptCursor\`, { min: 0, integer: true });
    oneOf(errors, snapshot.opportunityTracker.accuracyScope, \`\${path}.opportunityTracker.accuracyScope\`, PRACTICE_EVIDENCE_ACCURACY_SCOPES);
  }
  if (!Array.isArray(snapshot.entries) || snapshot.entries.length > PRACTICE_SKILL_EVIDENCE_POLICY_V1.checkpointEntityCap) error(errors, \`\${path}.entries\`, "ARRAY_LIMIT", "checkpoint evidence entity snapshot exceeds PL11 cap");
  else for (const [index, entry] of snapshot.entries.entries()) {
    oneOf(errors, entry?.entityType, \`\${path}.entries[\${index}].entityType\`, ENTITY_TYPES);
    if (typeof entry?.entityKey !== "string" || !entry.entityKey) error(errors, \`\${path}.entries[\${index}].entityKey\`, "INVALID_ENTITY", "checkpoint entityKey is required");
    if (Array.isArray(entry?.breadthHashes) && entry.breadthHashes.length > PRACTICE_SKILL_EVIDENCE_POLICY_V1.maxBreadthPointsPerEntityPerSession) error(errors, \`\${path}.entries[\${index}].breadthHashes\`, "ARRAY_LIMIT", "checkpoint breadth hashes exceed cap");
    for (const forbidden of ["text", "containingWords", "sentenceExcerpt", "eventTrace", "rawEvents"]) if (Object.hasOwn(entry ?? {}, forbidden)) error(errors, \`\${path}.entries[\${index}].\${forbidden}\`, "FORBIDDEN_FIELD", "raw content is forbidden in skill tracker snapshots");
  }
  for (const key of ["omittedObservationCount", "lastProcessedEpisodeId"]) finite(errors, snapshot[key], \`\${path}.\${key}\`, { min: 0, integer: true });
  for (const key of ["evidenceTruncated", "checkpointEvidenceTruncated"]) if (typeof snapshot[key] !== "boolean") error(errors, \`\${path}.\${key}\`, "INVALID_TYPE", \`\${key} must be boolean\`);
}

`;
  source = replaceOnce(source, `export function validateSessionSummary(summary) {`, summaryValidator + `export function validateSessionSummary(summary) {`, "insert skill evidence summary validator");
  source = replaceOnce(source,
`  if (summary.normalizationSummary != null) errors.push(...validatePracticeNormalizationSummary(summary.normalizationSummary).errors.map((entry) => ({ ...entry, path: \`normalizationSummary.\${entry.path}\` })));`,
`  if (summary.normalizationSummary != null) errors.push(...validatePracticeNormalizationSummary(summary.normalizationSummary).errors.map((entry) => ({ ...entry, path: \`normalizationSummary.\${entry.path}\` })));
  if (summary.skillEvidenceSummary != null) errors.push(...validatePracticeSkillEvidenceSummary(summary.skillEvidenceSummary).errors.map((entry) => ({ ...entry, path: \`skillEvidenceSummary.\${entry.path}\` })));`, "session skill evidence summary validation");
  source = replaceOnce(source,
`  appendSerializable(errors, record.metricsSnapshot, "metricsSnapshot");`,
`  appendSerializable(errors, record.metricsSnapshot, "metricsSnapshot", PRACTICE_LIMITS.checkpointBytes);
  validateSkillEvidenceTrackerSnapshot(record.metricsSnapshot?.skillEvidenceTrackerSnapshot ?? null, errors);`, "checkpoint tracker validation");
  source = replaceRegex(source,
/export function normalizeSkillStat\(value\) \{[\s\S]*?\n\}\n\nexport function normalizeSessionSummary/,
`export function normalizeSkillStat(value) {
  if (!isPlainObject(value)) return null;
  const copy = {
    ...value,
    entityType: String(value.entityType || "").toLowerCase(),
    entityKey: String(value.entityKey || ""),
  };
  if (Number(copy.recordVersion) >= 3) return copy;
  return {
    ...copy,
    recentLatencySamples: Array.isArray(value.recentLatencySamples)
      ? value.recentLatencySamples.slice(-PRACTICE_LIMITS.recentLatencySamples)
      : [],
  };
}

export function normalizeSessionSummary`, "normalizeSkillStat block");
  write(file, source);
}

// PL9 error tracker: expose compact closed episodes without exposing private state.
{
  const file = "js/practiceLab/practiceErrorTracker.js";
  let source = read(file);
  source = replaceOnce(source,
`    startPosition: episode.errorStartPosition,
    outcome,`,
`    startPosition: episode.errorStartPosition,
    primaryPosition: episode.errorStartPosition,
    affectedStart: episode.errorStartPosition,
    affectedEnd: episode.errorStartPosition + Math.max(0, episode.generationExpected.length - 1),
    outcome,`, "closed episode attribution fields");
  source = replaceOnce(source,
`  const state = createInitialState({ seed, aggregateScope, initialIncorrectCount });

  const closeCurrent = (outcome) => {`,
`  const state = createInitialState({ seed, aggregateScope, initialIncorrectCount });
  const closedEpisodeQueue = [];

  const closeCurrent = (outcome) => {`, "closed episode queue state");
  source = replaceOnce(source,
`    applyEpisodeAggregate(state, episode, policy);
    state.activeEpisode = null;
    return episode;`,
`    applyEpisodeAggregate(state, episode, policy);
    closedEpisodeQueue.push(episode);
    if (closedEpisodeQueue.length > policy.recentEpisodeSamples) closedEpisodeQueue.splice(0, closedEpisodeQueue.length - policy.recentEpisodeSamples);
    state.activeEpisode = null;
    return episode;`, "queue closed episode");
  source = replaceOnce(source,
`    checkpointSnapshot({ contentHash = null, cursorIndex = state.currentCursor } = {}) {`,
`    drainClosedEpisodes() {
      const result = freezeDeep(clone(closedEpisodeQueue));
      closedEpisodeQueue.length = 0;
      return result;
    },
    previewActiveEpisode() {
      if (!state.activeEpisode) return null;
      const outcome = finiteNonNegative(state.activeEpisode.repairCompleteActiveMs) ? "corrected" : "uncorrected";
      return freezeDeep(finalizeEpisode(state.activeEpisode, outcome, policy));
    },
    checkpointSnapshot({ contentHash = null, cursorIndex = state.currentCursor } = {}) {`, "error tracker drain API");
  write(file, source);
}

// PL8/PL10 transient event chain carries first-attempt marker.
{
  const file = "js/practiceLab/practiceLatencyClassifier.js";
  let source = read(file);
  source = replaceOnce(source,
`    correctness: event?.correctness ?? null,
  };`,
`    correctness: event?.correctness ?? null,
    isFirstAttempt: event?.isFirstAttempt === true,
  };`, "PL8 first-attempt transition marker");
  write(file, source);
}
{
  const file = "js/practiceLab/practiceContextNormalizer.js";
  let source = read(file);
  source = replaceOnce(source,
`      correctness: transition.correctness,
    });`,
`      correctness: transition.correctness,
      isFirstAttempt: transition.isFirstAttempt === true,
    });`, "PL10 first-attempt normalized marker");
  write(file, source);
}

// Foundation analysis becomes v4 and owns canonical skill evidence output.
{
  const file = "js/practiceLab/practiceFoundationAnalysis.js";
  let source = read(file);
  source = source.replace("export const PRACTICE_FOUNDATION_ANALYSIS_VERSION = 3;", "export const PRACTICE_FOUNDATION_ANALYSIS_VERSION = 4;");
  source = replaceOnce(source,
`  normalizationOptions = {},
} = {}) {`,
`  normalizationOptions = {},
  skillEvidenceTracker = null,
  skillEvidenceFinalize = null,
} = {}) {`, "foundation skill args");
  source = replaceOnce(source,
`  const normalization = analyzePracticeNormalization({
    latencyAnalysis: latency,
    contentPlan,
    context,
    segmenter,
    ...normalizationOptions,
  });
  return freezeDeep({
    version: PRACTICE_FOUNDATION_ANALYSIS_VERSION,
    latency,
    errors,
    normalization,
  });`,
`  const normalization = analyzePracticeNormalization({
    latencyAnalysis: latency,
    contentPlan,
    context,
    segmenter,
    ...normalizationOptions,
  });
  const partial = { latency, errors, normalization };
  const skills = skillEvidenceTracker && skillEvidenceFinalize
    ? skillEvidenceTracker.finalize({ foundationAnalysis: partial, ...skillEvidenceFinalize })
    : freezeDeep({ version: 1, policyVersion: 1, summary: null, deltas: [] });
  return freezeDeep({
    version: PRACTICE_FOUNDATION_ANALYSIS_VERSION,
    latency,
    errors,
    normalization,
    skills,
  });`, "foundation skill build");
  write(file, source);
}

// Checkpoint carries bounded PL11 tracker snapshot in metrics state.
{
  const file = "js/practiceLab/practiceCheckpoint.js";
  let source = read(file);
  source = replaceOnce(source,
`  errorTrackerSnapshot = null,
  now = Date.now,`,
`  errorTrackerSnapshot = null,
  skillEvidenceTrackerSnapshot = null,
  now = Date.now,`, "checkpoint skill snapshot arg");
  source = replaceOnce(source,
`      errorTrackerSnapshot,
    },`,
`      errorTrackerSnapshot,
      skillEvidenceTrackerSnapshot,
    },`, "checkpoint skill snapshot payload");
  write(file, source);
}

// Session result persists only compact skill evidence summary.
{
  const file = "js/practiceLab/practiceSessionResult.js";
  let source = read(file);
  source = replaceOnce(source,
`      normalizationSummary: foundationAnalysis?.normalization?.sessionSummary ?? null,
      beforeMetrics:`,
`      normalizationSummary: foundationAnalysis?.normalization?.sessionSummary ?? null,
      skillEvidenceSummary: foundationAnalysis?.skills?.summary ?? null,
      beforeMetrics:`, "session result skill summary");
  write(file, source);
}

// Session engine: stream first-pass evidence, freeze role, restore tracker, commit deltas.
{
  const file = "js/practiceLab/practiceSessionEngine.js";
  let source = read(file);
  source = replaceOnce(source,
`import { createPracticeSessionContextSnapshot } from "./practiceContextFeatures.js";`,
`import { createPracticeSessionContextSnapshot } from "./practiceContextFeatures.js";
import { resolvePracticeEvidenceRole } from "./practiceEvidenceRole.js";
import { createPracticeSkillEvidenceTracker } from "./practiceSkillEvidenceCollector.js";`, "session PL11 imports");
  source = replaceOnce(source,
`  let errorTracker = createPracticeErrorTracker();
  let normalizationContext = null;`,
`  let errorTracker = createPracticeErrorTracker();
  let normalizationContext = null;
  let skillEvidenceTracker = null;
  let evidenceRole = "unclassified";`, "session tracker state");
  source = replaceOnce(source,
`    experiment = nextExperiment;
    configuration = freezeDeep(clonePracticeValue(nextConfiguration));
    contentPlan = nextContentPlan;
    typingState = createPracticeTypingState(contentPlan, { segmenter });`,
`    experiment = nextExperiment;
    configuration = freezeDeep(clonePracticeValue(nextConfiguration));
    contentPlan = nextContentPlan;
    evidenceRole = resolvePracticeEvidenceRole({ contentPlan, context: normalizationContext });
    skillEvidenceTracker = createPracticeSkillEvidenceTracker({
      sessionId,
      profileId,
      contextId,
      contentPlan,
      context: normalizationContext,
      evidenceRole,
      segmenter,
    });
    typingState = createPracticeTypingState(contentPlan, { segmenter });`, "prepare skill tracker");
  source = replaceOnce(source,
`        const errorEvent = {
          eventIndex: eventBuffer.totalEventCount + 1, eventTraceVersion: PRACTICE_EVENT_TRACE_VERSION,`,
`        const isFirstAttempt = skillEvidenceTracker.recordInsertion({ position: outcome.position, correctness: outcome.correctness });
        const errorEvent = {
          eventIndex: eventBuffer.totalEventCount + 1, eventTraceVersion: PRACTICE_EVENT_TRACE_VERSION,`, "mark first attempt");
  source = replaceOnce(source,
`          latencyFromPriorInsertionMs: latency, source: input.source, targetEntityMatches: [],
        };
        eventBuffer.push(errorEvent);
        errorTracker.consume(errorEvent);`,
`          latencyFromPriorInsertionMs: latency, source: input.source, targetEntityMatches: [], isFirstAttempt,
        };
        eventBuffer.push(errorEvent);
        errorTracker.consume(errorEvent);
        for (const episode of errorTracker.drainClosedEpisodes()) skillEvidenceTracker.recordClosedEpisode(episode);`, "insertion error drain");
  source = replaceOnce(source,
`        source: input.source, targetEntityMatches: [],
      };
      eventBuffer.push(errorEvent);
      errorTracker.consume(errorEvent);`,
`        source: input.source, targetEntityMatches: [], isFirstAttempt: null,
      };
      eventBuffer.push(errorEvent);
      errorTracker.consume(errorEvent);
      for (const episode of errorTracker.drainClosedEpisodes()) skillEvidenceTracker.recordClosedEpisode(episode);`, "correction error drain");
  source = replaceOnce(source,
`      errorTrackerSnapshot: errorTracker.checkpointSnapshot({ contentHash: contentPlan.contentHash, cursorIndex: typingState.cursorIndex }),
      now: wallDate,`,
`      errorTrackerSnapshot: errorTracker.checkpointSnapshot({ contentHash: contentPlan.contentHash, cursorIndex: typingState.cursorIndex }),
      skillEvidenceTrackerSnapshot: skillEvidenceTracker?.checkpointSnapshot() ?? null,
      now: wallDate,`, "checkpoint engine tracker snapshot");
  source = replaceOnce(source,
`  const analyzeFoundation = () => {
    try {
      return buildPracticeFoundationAnalysis({`,
`  const analyzeFoundation = ({ status, observedAt }) => {
    try {
      for (const episode of errorTracker.drainClosedEpisodes()) skillEvidenceTracker.recordClosedEpisode(episode);
      const activeEpisode = errorTracker.previewActiveEpisode();
      if (activeEpisode) skillEvidenceTracker.recordClosedEpisode(activeEpisode);
      return buildPracticeFoundationAnalysis({`, "foundation engine finalize signature");
  source = replaceOnce(source,
`        context: normalizationContext,
        segmenter,
      });`,
`        context: normalizationContext,
        segmenter,
        skillEvidenceTracker,
        skillEvidenceFinalize: {
          status,
          observedAt,
          localDayKey: sessionTimeContext?.localDayKey ?? getPracticeTimeContext(wallDate()).localDayKey,
        },
      });`, "foundation tracker input");
  source = replaceOnce(source,
`    let foundationAnalysis;
    let analysis;
    try {
      foundationAnalysis = analyzeFoundation();
      analysis = await analyze(foundationAnalysis);`,
`    let foundationAnalysis;
    let analysis;
    completedAtUtc = wallIso();
    try {
      foundationAnalysis = analyzeFoundation({ status, observedAt: completedAtUtc });
      analysis = await analyze(foundationAnalysis);`, "finalization timestamp before analysis");
  source = replaceOnce(source,
`      finalizationState = "error";
      lastErrorCode = error.code;`,
`      finalizationState = "error";
      completedAtUtc = null;
      lastErrorCode = error.code;`, "reset completed timestamp on analysis failure");
  source = replaceOnce(source,
`    completedAtUtc = wallIso();
    const finalMetrics = metricsSnapshot();`,
`    const finalMetrics = metricsSnapshot();`, "remove second completion timestamp");
  source = replaceOnce(source,
`        sessionSummary: preparedFinalResult,
        updatedSkillStats: analysis?.updatedSkillStats ?? [],
        reviewItemChanges:`,
`        sessionSummary: preparedFinalResult,
        skillEvidenceDeltas: foundationAnalysis.skills?.deltas ?? [],
        reviewItemChanges:`, "commit skill deltas");
  source = replaceOnce(source,
`    normalizationContext = null;
    experiment = null;`,
`    normalizationContext = null;
    skillEvidenceTracker = null;
    experiment = null;`, "destroy skill tracker");
  source = replaceOnce(source,
`    errorTracker.markTimingBoundary();
    const restoredTail =`,
`    errorTracker.markTimingBoundary();
    const skillSeed = checkpoint.metricsSnapshot?.skillEvidenceTrackerSnapshot ?? null;
    skillEvidenceTracker = createPracticeSkillEvidenceTracker({
      sessionId,
      profileId,
      contextId,
      contentPlan,
      context: normalizationContext,
      evidenceRole,
      segmenter,
      seed: skillSeed,
      initialCursor: typingState.cursorIndex,
      historicalRestore: !skillSeed,
    });
    const restoredTail =`, "restore skill tracker");
  source = replaceOnce(source,
`      normalizationContextFingerprint: normalizationContext?.fingerprint ?? null,
      activeDurationMs:`,
`      normalizationContextFingerprint: normalizationContext?.fingerprint ?? null,
      evidenceRole,
      skillEvidence: skillEvidenceTracker?.getSnapshot() ?? null,
      activeDurationMs:`, "skill diagnostics");
  write(file, source);
}

// Repository: canonical skill deltas merge inside the atomic transaction.
{
  const file = "js/practiceLab/practiceRepository.js";
  let source = read(file);
  source = replaceOnce(source,
`import { createDefaultPracticeProfile } from "./practiceDefaults.js";`,
`import { createDefaultPracticeProfile, createDefaultSkillStat } from "./practiceDefaults.js";
import { mergePracticeSkillEvidence } from "./practiceSkillEvidenceMerge.js";
import { validatePracticeSkillEvidenceBatch } from "./practiceSkillEvidenceDelta.js";`, "repository PL11 imports");
  source = replaceRegex(source,
/    async commitCompletedPracticeSession\(\{ sessionSummary, updatedSkillStats = \[\], reviewItemChanges = \[\], updatedProfileSummary = null, clearCheckpoint = true \}\) \{[\s\S]*?\n    \},\n\n    async resetPracticeData/,
`    async commitCompletedPracticeSession({ sessionSummary, skillEvidenceDeltas = [], updatedSkillStats = null, reviewItemChanges = [], updatedProfileSummary = null, clearCheckpoint = true }) {
      validate("sessionSummaries", sessionSummary);
      if (Array.isArray(updatedSkillStats) && updatedSkillStats.length) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Direct full skill-stat replacement is disabled; use canonical skill evidence deltas", { operation: "commit-session", storeName: "skillStats", recordId: sessionSummary.sessionId });
      const batchValidation = validatePracticeSkillEvidenceBatch(skillEvidenceDeltas, { sessionId: sessionSummary.sessionId, profileId: sessionSummary.profileId, contextId: sessionSummary.contextId });
      if (!batchValidation.valid) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice skill evidence batch failed validation", { operation: "commit-session", storeName: "skillStats", recordId: sessionSummary.sessionId, cause: batchValidation.errors });
      reviewItemChanges.filter((change) => change?.action !== "delete").forEach((record) => validate("reviewItems", record));
      if (updatedProfileSummary) validate("profiles", updatedProfileSummary);
      const activeProfileId = ensureManifest().profileId;
      const mismatch = sessionSummary.profileId !== activeProfileId
        || reviewItemChanges.some((change) => change?.action !== "delete" && (change.profileId !== sessionSummary.profileId || change.contextId !== sessionSummary.contextId))
        || (updatedProfileSummary && updatedProfileSummary.profileId !== sessionSummary.profileId);
      if (mismatch) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice completion records must belong to the session profile/context", { operation: "commit-session", storeName: "profiles", recordId: sessionSummary.profileId });
      await assertContextOwnership(sessionSummary.profileId, sessionSummary.contextId, { operation: "commit-session" });

      const stores = ["contexts", "sessionSummaries", "skillStats", "reviewItems", "profiles", "activeSessionCheckpoints", "meta"];
      const transactionResult = await writeWithQuotaRecovery("commit-session", () => dataStore.runTransaction(stores, "readwrite", async (transaction) => {
        await assertContextOwnership(sessionSummary.profileId, sessionSummary.contextId, { transaction, operation: "commit-session" });
        const existing = await transaction.get("sessionSummaries", sessionSummary.sessionId);
        if (existing) {
          if (equivalent(existing, sessionSummary)) return { committed: false, idempotent: true, profileSummary: await transaction.get("profiles", sessionSummary.profileId) };
          throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, "A different completed Practice session already uses this sessionId", { operation: "commit-session", storeName: "sessionSummaries", recordId: sessionSummary.sessionId });
        }
        const checkpoint = await transaction.get("activeSessionCheckpoints", sessionSummary.profileId);
        if (checkpoint && (checkpoint.profileId !== sessionSummary.profileId || checkpoint.contextId !== sessionSummary.contextId)) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice checkpoint does not match the completing session context", { operation: "commit-session", storeName: "activeSessionCheckpoints", recordId: sessionSummary.profileId, recoverable: true });
        if (updatedProfileSummary) await assertContextOwnership(updatedProfileSummary.profileId, updatedProfileSummary.activeContextId, { transaction, operation: "commit-session-profile" });
        for (const change of reviewItemChanges) if (change?.action === "delete") {
          const existingReview = await transaction.get("reviewItems", change.reviewItemId);
          if (existingReview && (existingReview.profileId !== sessionSummary.profileId || existingReview.contextId !== sessionSummary.contextId)) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Deleted review does not belong to the completing session context", { operation: "commit-session", storeName: "reviewItems", recordId: change.reviewItemId, recoverable: true });
        }
        const mergedStats = [];
        for (const delta of skillEvidenceDeltas) {
          let stat = await transaction.get("skillStats", delta.statId);
          if (stat) {
            const migration = migratePracticeRecord("skillStat", stat);
            if (!migration.ok) throw migration.error;
            stat = migration.value;
          } else {
            stat = createDefaultSkillStat({
              statId: delta.statId,
              profileId: delta.profileId,
              contextId: delta.contextId,
              entityType: delta.entityType,
              entityKey: delta.entityKey,
              now: () => new Date(delta.observedAt),
            });
          }
          const merged = mergePracticeSkillEvidence(stat, delta);
          validate("skillStats", merged);
          mergedStats.push(merged);
        }
        for (const merged of mergedStats) await transaction.put("skillStats", merged);
        for (const change of reviewItemChanges) {
          if (change?.action === "delete") await transaction.delete("reviewItems", change.reviewItemId);
          else await transaction.put("reviewItems", change);
        }
        if (updatedProfileSummary) await transaction.put("profiles", updatedProfileSummary);
        await transaction.put("sessionSummaries", sessionSummary);
        if (clearCheckpoint) await transaction.delete("activeSessionCheckpoints", sessionSummary.profileId);
        await transaction.put("meta", { key: "manifestReconciliation", status: "pending", sessionId: sessionSummary.sessionId, createdAt: toPracticeUtcIso(now), updatedAt: toPracticeUtcIso(now) });
        return { committed: true, idempotent: false, mergedSkillStatCount: mergedStats.length };
      }));
      try {
        const reconciliationProfile = transactionResult.profileSummary ?? updatedProfileSummary;
        saveManifestPatch({
          lastCompletedSessionAt: sessionSummary.status === "completed" ? sessionSummary.completedAtUtc : ensureManifest().lastCompletedSessionAt,
          dashboardSummary: reconciliationProfile?.dashboardSummary ?? ensureManifest().dashboardSummary,
          storageHealth: "healthy",
        });
        await dataStore.put("meta", { key: "manifestReconciliation", status: "resolved", sessionId: sessionSummary.sessionId, createdAt: sessionSummary.completedAtUtc, updatedAt: toPracticeUtcIso(now) });
        const { profileSummary: _profileSummary, ...publicResult } = transactionResult;
        return { ...publicResult, manifestUpdated: true };
      } catch (cause) {
        const { profileSummary: _profileSummary, ...publicResult } = transactionResult;
        return { ...publicResult, manifestUpdated: false, recoveryRequired: true, error: practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECOVERY_REQUIRED, "Session committed, but the Practice manifest requires reconciliation", { operation: "commit-session-manifest", recoverable: true, cause }) };
      }
    },

    async resetPracticeData`, "repository commit function");
  write(file, source);
}

// Retention: v3 confidence and targeted evidence determine low-confidence pruning; review-linked entities are protected.
{
  const file = "js/practiceLab/practiceRetention.js";
  let source = read(file);
  source = replaceRegex(source,
/function skillDeletes\(records\) \{[\s\S]*?\n\}\n\nfunction reviewDeletes/,
`function skillDeletes(records, reviewItems = []) {
  const caps = {
    bigram: PRACTICE_LIMITS.bigramStats,
    trigram: PRACTICE_LIMITS.trigramStats,
    word: PRACTICE_LIMITS.wordStats,
  };
  const linked = new Set(reviewItems.map((record) => \`\${record.profileId}\\0\${record.contextId}\\0\${record.entityType}\\0\${record.entityKey}\`));
  const identity = (record) => \`\${record.profileId}\\0\${record.contextId}\\0\${record.entityType}\\0\${record.entityKey}\`;
  const deletions = [];
  const compare = (a, b) => (
    (a.confidenceScore || 0) - (b.confidenceScore || 0)
    || (a.evidence?.observation?.targetedSessionCount || 0) - (b.evidence?.observation?.targetedSessionCount || 0)
    || (a.evidence?.opportunities?.count || 0) - (b.evidence?.opportunities?.count || 0)
    || time(a.lastObservedAt || a.updatedAt) - time(b.lastObservedAt || b.updatedAt)
    || (a.priority || 0) - (b.priority || 0)
    || String(a.statId).localeCompare(String(b.statId))
  );
  for (const [type, cap] of Object.entries(caps)) {
    const group = records.filter((record) => record.entityType === type);
    if (group.length <= cap) continue;
    const candidates = group.filter((record) => !linked.has(identity(record))).sort(compare);
    deletions.push(...candidates.slice(0, Math.min(candidates.length, group.length - cap)).map((record) => record.statId));
  }
  const patterns = records.filter((record) => ["punctuation-transition", "number-pattern", "symbol-pattern"].includes(record.entityType));
  if (patterns.length > PRACTICE_LIMITS.patternStats) {
    const candidates = patterns.filter((record) => !linked.has(identity(record))).sort(compare);
    deletions.push(...candidates.slice(0, Math.min(candidates.length, patterns.length - PRACTICE_LIMITS.patternStats)).map((record) => record.statId));
  }
  return [...new Set(deletions)];
}

function reviewDeletes`, "retention skill delete function");
  source = replaceOnce(source, `    skillStats: skillDeletes(skillStats),`, `    skillStats: skillDeletes(skillStats, reviewItems),`, "retention review-linked skill call");
  write(file, source);
}

// New v3 checkpoint defaults always state tracker absence explicitly.
{
  const file = "js/practiceLab/practiceDefaults.js";
  let source = read(file);
  source = replaceOnce(source, `    metricsSnapshot: {},`, `    metricsSnapshot: { skillEvidenceTrackerSnapshot: null },`, "default checkpoint tracker null");
  write(file, source);
}

console.log("PL11 integration patch applied");
