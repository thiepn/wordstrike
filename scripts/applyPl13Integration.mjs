import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(path, before, after) {
  const source = await readFile(path, "utf8");
  if (!source.includes(before)) throw new Error(`PL13 patch anchor missing in ${path}: ${before.slice(0, 100)}`);
  const next = source.replace(before, after);
  if (next === source) throw new Error(`PL13 patch made no change in ${path}`);
  await writeFile(path, next, "utf8");
}

// Defaults: session summary v7 carries only a compact measurement summary.
await replaceOnce(
  "js/practiceLab/practiceDefaults.js",
  "    skillEvidenceSummary: null,\n    beforeMetrics: null,",
  "    skillEvidenceSummary: null,\n    abilityMeasurementSummary: null,\n    beforeMetrics: null,",
);

// Central summary validation: ability measurement summary is compact and validated independently.
await replaceOnce(
  "js/practiceLab/practiceValidation.js",
  'import { validatePracticeNormalizationSummary } from "./practiceNormalizationValidation.js";\n',
  'import { validatePracticeNormalizationSummary } from "./practiceNormalizationValidation.js";\nimport { validatePracticeAbilityMeasurementSummary } from "./practiceAbilityValidation.js";\n',
);
await replaceOnce(
  "js/practiceLab/practiceValidation.js",
  '  "normalizedTransitions", "typabilityFeatureVector", "skillEvidenceDeltas", "leaderboardEligible",\n',
  '  "normalizedTransitions", "typabilityFeatureVector", "skillEvidenceDeltas", "abilityObservation", "newAbilityEstimate", "leaderboardEligible",\n',
);
await replaceOnce(
  "js/practiceLab/practiceValidation.js",
  '  if (summary.skillEvidenceSummary != null) errors.push(...validatePracticeSkillEvidenceSummary(summary.skillEvidenceSummary).errors.map((entry) => ({ ...entry, path: `skillEvidenceSummary.${entry.path}` })));\n  appendSerializable(errors, summary.configuration, "configuration");',
  '  if (summary.skillEvidenceSummary != null) errors.push(...validatePracticeSkillEvidenceSummary(summary.skillEvidenceSummary).errors.map((entry) => ({ ...entry, path: `skillEvidenceSummary.${entry.path}` })));\n  if (summary.abilityMeasurementSummary != null) errors.push(...validatePracticeAbilityMeasurementSummary(summary.abilityMeasurementSummary).errors.map((entry) => ({ ...entry, path: `abilityMeasurementSummary.${entry.path}` })));\n  appendSerializable(errors, summary.configuration, "configuration");',
);

// Trusted experiment descriptor owns ability intent. Session configuration cannot spoof it.
await replaceOnce(
  "js/practiceLab/practiceSessionContract.js",
  'import {\n  ENTITY_TYPES,\n} from "./practiceConstants.js";\n',
  'import {\n  ENTITY_TYPES,\n} from "./practiceConstants.js";\nimport { PRACTICE_ABILITY_CHANNELS } from "./practiceAbilityConstants.js";\n',
);
await replaceOnce(
  "js/practiceLab/practiceSessionContract.js",
  '  if (typeof descriptor.resumable !== "boolean") errors.push({ path: "resumable", code: "INVALID_TYPE", message: "resumable must be boolean" });\n  return { valid: errors.length === 0, errors };',
  '  if (typeof descriptor.resumable !== "boolean") errors.push({ path: "resumable", code: "INVALID_TYPE", message: "resumable must be boolean" });\n  if (descriptor.abilityChannel != null && !PRACTICE_ABILITY_CHANNELS.includes(descriptor.abilityChannel)) errors.push({ path: "abilityChannel", code: "INVALID_ENUM", message: "unsupported ability channel" });\n  return { valid: errors.length === 0, errors };',
);
await replaceOnce(
  "js/practiceLab/practiceSessionContract.js",
  '  if (configuration?.correctionBehavior != null && !PRACTICE_CORRECTION_POLICIES.includes(configuration.correctionBehavior)) errors.push({ path: "correctionBehavior", code: "INVALID_ENUM", message: "unsupported correction behavior" });\n  return { valid: errors.length === 0, errors };',
  '  if (configuration?.correctionBehavior != null && !PRACTICE_CORRECTION_POLICIES.includes(configuration.correctionBehavior)) errors.push({ path: "correctionBehavior", code: "INVALID_ENUM", message: "unsupported correction behavior" });\n  if (Object.hasOwn(configuration ?? {}, "abilityChannel")) errors.push({ path: "abilityChannel", code: "FORBIDDEN_FIELD", message: "abilityChannel is trusted experiment metadata and cannot be configured per session" });\n  return { valid: errors.length === 0, errors };',
);
await replaceOnce(
  "js/practiceLab/practiceSessionContract.js",
  '    resumable: true,\n    ...overrides,',
  '    resumable: true,\n    abilityChannel: null,\n    ...overrides,',
);

// Registry canonicalizes omitted optional descriptor field to null.
await replaceOnce(
  "js/practiceLab/practiceExperimentRegistryRuntime.js",
  '        ...descriptor,\n        supportedCompletionModes: Object.freeze([...descriptor.supportedCompletionModes]),',
  '        ...descriptor,\n        abilityChannel: descriptor.abilityChannel ?? null,\n        supportedCompletionModes: Object.freeze([...descriptor.supportedCompletionModes]),',
);

// Foundation v5 carries transient ability assessment without redefining PL8-PL11 layers.
await replaceOnce(
  "js/practiceLab/practiceFoundationAnalysis.js",
  'export const PRACTICE_FOUNDATION_ANALYSIS_VERSION = 4;',
  'export const PRACTICE_FOUNDATION_ANALYSIS_VERSION = 5;',
);
await replaceOnce(
  "js/practiceLab/practiceFoundationAnalysis.js",
  '  skillEvidenceFinalize = null,\n} = {}) {',
  '  skillEvidenceFinalize = null,\n  ability = null,\n} = {}) {',
);
await replaceOnce(
  "js/practiceLab/practiceFoundationAnalysis.js",
  '  return freezeDeep({\n    version: PRACTICE_FOUNDATION_ANALYSIS_VERSION,\n    latency,\n    errors,\n    normalization,\n    skills,\n  });\n}\n',
  '  return freezeDeep({\n    version: PRACTICE_FOUNDATION_ANALYSIS_VERSION,\n    latency,\n    errors,\n    normalization,\n    skills,\n    ability: ability ?? freezeDeep({ version: 1, channel: null, status: "not-requested", reasons: [], observation: null, sessionSummary: null }),\n  });\n}\n\nexport function withPracticeAbilityAnalysis(foundationAnalysis, ability) {\n  if (!foundationAnalysis || foundationAnalysis.version !== PRACTICE_FOUNDATION_ANALYSIS_VERSION) throw new TypeError("Practice ability attachment requires current foundation analysis");\n  if (!ability || typeof ability !== "object") throw new TypeError("Practice ability analysis is required");\n  return freezeDeep({ ...foundationAnalysis, ability });\n}\n',
);

// Session result persists observation metadata only, never latent state.
await replaceOnce(
  "js/practiceLab/practiceSessionResult.js",
  '      skillEvidenceSummary: foundationAnalysis?.skills?.summary ?? null,\n      beforeMetrics:',
  '      skillEvidenceSummary: foundationAnalysis?.skills?.summary ?? null,\n      abilityMeasurementSummary: foundationAnalysis?.ability?.sessionSummary ?? null,\n      beforeMetrics:',
);

// Session engine builds at most one observation after canonical final metrics exist.
await replaceOnce(
  "js/practiceLab/practiceSessionEngine.js",
  'import { buildPracticeFoundationAnalysis } from "./practiceFoundationAnalysis.js";\n',
  'import { buildPracticeFoundationAnalysis, withPracticeAbilityAnalysis } from "./practiceFoundationAnalysis.js";\nimport { buildPracticeAbilityObservation } from "./practiceAbilityObservation.js";\n',
);
await replaceOnce(
  "js/practiceLab/practiceSessionEngine.js",
  '      foundationAnalysis = analyzeFoundation({ status, observedAt: completedAtUtc });\n      analysis = await analyze(foundationAnalysis);',
  '      foundationAnalysis = analyzeFoundation({ status, observedAt: completedAtUtc });\n      const abilityMetrics = metricsSnapshot();\n      const abilityAssessment = buildPracticeAbilityObservation({\n        session: {\n          sessionId, profileId, contextId, status, completionReason: reason, completedAtUtc,\n          localDayKey: sessionTimeContext?.localDayKey ?? getPracticeTimeContext(wallDate()).localDayKey,\n          wpm: abilityMetrics.wpm, rawWpm: abilityMetrics.rawWpm, accuracy: abilityMetrics.accuracy,\n          activeDurationMs: abilityMetrics.activeDurationMs, typedCharacterCount: abilityMetrics.acceptedInsertions,\n          configuration: { ...configuration, correctionBehavior: configuration.correctionBehavior ?? experiment.defaultCorrectionBehavior },\n        },\n        experiment, foundationAnalysis, contentPlan, evidenceRole,\n      });\n      foundationAnalysis = withPracticeAbilityAnalysis(foundationAnalysis, abilityAssessment);\n      analysis = await analyze(foundationAnalysis);',
);
await replaceOnce(
  "js/practiceLab/practiceSessionEngine.js",
  '        skillEvidenceDeltas: foundationAnalysis.skills?.deltas ?? [],\n        reviewItemChanges:',
  '        skillEvidenceDeltas: foundationAnalysis.skills?.deltas ?? [],\n        abilityObservation: foundationAnalysis.ability?.observation ?? null,\n        reviewItemChanges:',
);

// Repository: version-aware initialization, ability APIs, and atomic merge after duplicate-session check.
await replaceOnce(
  "js/practiceLab/practiceRepository.js",
  '  PRACTICE_LIMITS,\n  PRACTICE_RECORD_VERSIONS,',
  '  PRACTICE_DATABASE_VERSION,\n  PRACTICE_LIMITS,\n  PRACTICE_RECORD_VERSIONS,',
);
await replaceOnce(
  "js/practiceLab/practiceRepository.js",
  'import { createDefaultPracticeProfile, createDefaultSkillStat } from "./practiceDefaults.js";\n',
  'import { createDefaultPracticeProfile, createDefaultSkillStat } from "./practiceDefaults.js";\nimport { createDefaultPracticeAbilityState, mergePracticeAbilityObservation } from "./practiceAbilityEstimator.js";\nimport { validatePracticeAbilityObservation, validatePracticeAbilityState } from "./practiceAbilityValidation.js";\n',
);
await replaceOnce(
  "js/practiceLab/practiceRepository.js",
  '  createPracticeContextId,\n  createPracticeQuarantineId,',
  '  createPracticeContextId,\n  createPracticeAbilityStateId,\n  createPracticeQuarantineId,',
);
await replaceOnce(
  "js/practiceLab/practiceRepository.js",
  '  skillStats: validateSkillStat,\n  sessionSummaries:',
  '  skillStats: validateSkillStat,\n  abilityStates: validatePracticeAbilityState,\n  sessionSummaries:',
);
await replaceOnce(
  "js/practiceLab/practiceRepository.js",
  '  skillStats: "skillStat",\n  sessionSummaries:',
  '  skillStats: "skillStat",\n  abilityStates: "abilityState",\n  sessionSummaries:',
);
await replaceOnce(
  "js/practiceLab/practiceRepository.js",
  '  return record?.contextId || record?.sessionId || record?.profileId || record?.statId || record?.reviewItemId || record?.customTextId || record?.presetId || null;',
  '  return record?.abilityStateId || record?.contextId || record?.sessionId || record?.profileId || record?.statId || record?.reviewItemId || record?.customTextId || record?.presetId || null;',
);
await replaceOnce(
  "js/practiceLab/practiceRepository.js",
  '      if (manifest.databaseVersion !== 2) saveManifestPatch({ databaseVersion: 2 });',
  '      if (manifest.databaseVersion !== PRACTICE_DATABASE_VERSION) saveManifestPatch({ databaseVersion: PRACTICE_DATABASE_VERSION });',
);
await replaceOnce(
  "js/practiceLab/practiceRepository.js",
  '    async listSkillStatsAcrossContexts(profileId = ensureManifest().profileId) {\n      const records = await dataStore.query("skillStats", "profileId", profileId);\n      return records.filter((record) => validateSkillStat(record).valid);\n    },\n\n    async saveSessionSummary(summary) {',
  '    async listSkillStatsAcrossContexts(profileId = ensureManifest().profileId) {\n      const records = await dataStore.query("skillStats", "profileId", profileId);\n      return records.filter((record) => validateSkillStat(record).valid);\n    },\n\n    async getAbilityState(profileId, contextId, channel) {\n      await assertContextOwnership(profileId, contextId, { operation: "get-ability-state" });\n      return readValidated("abilityStates", createPracticeAbilityStateId(profileId, contextId, channel));\n    },\n    async listAbilityStates(profileId = ensureManifest().profileId, contextId = null) {\n      const resolved = await resolveContextId(profileId, contextId);\n      const records = await dataStore.query("abilityStates", "contextId", resolved);\n      return records.filter((record) => record.profileId === profileId && validatePracticeAbilityState(record).valid);\n    },\n    async listAbilityStatesAcrossContexts(profileId = ensureManifest().profileId) {\n      const records = await dataStore.query("abilityStates", "profileId", profileId);\n      return records.filter((record) => validatePracticeAbilityState(record).valid);\n    },\n\n    async saveSessionSummary(summary) {',
);
await replaceOnce(
  "js/practiceLab/practiceRepository.js",
  '    async commitCompletedPracticeSession({ sessionSummary, skillEvidenceDeltas = [], updatedSkillStats = null, reviewItemChanges = [], updatedProfileSummary = null, clearCheckpoint = true }) {\n      validate("sessionSummaries", sessionSummary);',
  '    async commitCompletedPracticeSession({ sessionSummary, skillEvidenceDeltas = [], abilityObservation = null, updatedSkillStats = null, reviewItemChanges = [], updatedProfileSummary = null, clearCheckpoint = true }) {\n      validate("sessionSummaries", sessionSummary);\n      if (abilityObservation != null) {\n        const abilityValidation = validatePracticeAbilityObservation(abilityObservation);\n        if (!abilityValidation.valid) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice ability observation failed validation", { operation: "commit-session", storeName: "abilityStates", recordId: sessionSummary.sessionId, cause: abilityValidation.errors });\n        if (abilityObservation.sessionId !== sessionSummary.sessionId || abilityObservation.profileId !== sessionSummary.profileId || abilityObservation.contextId !== sessionSummary.contextId || sessionSummary.abilityMeasurementSummary?.status !== "eligible" || sessionSummary.abilityMeasurementSummary?.channel !== abilityObservation.channel) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice ability observation does not match the completed session measurement contract", { operation: "commit-session", storeName: "abilityStates", recordId: sessionSummary.sessionId });\n      }',
);
await replaceOnce(
  "js/practiceLab/practiceRepository.js",
  '        || reviewItemChanges.some((change) => change?.action !== "delete" && (change.profileId !== sessionSummary.profileId || change.contextId !== sessionSummary.contextId))\n        || (updatedProfileSummary && updatedProfileSummary.profileId !== sessionSummary.profileId);',
  '        || reviewItemChanges.some((change) => change?.action !== "delete" && (change.profileId !== sessionSummary.profileId || change.contextId !== sessionSummary.contextId))\n        || (abilityObservation && (abilityObservation.profileId !== sessionSummary.profileId || abilityObservation.contextId !== sessionSummary.contextId))\n        || (updatedProfileSummary && updatedProfileSummary.profileId !== sessionSummary.profileId);',
);
await replaceOnce(
  "js/practiceLab/practiceRepository.js",
  '      const stores = ["contexts", "sessionSummaries", "skillStats", "reviewItems", "profiles", "activeSessionCheckpoints", "meta"];',
  '      const stores = ["contexts", "sessionSummaries", "skillStats", "abilityStates", "reviewItems", "profiles", "activeSessionCheckpoints", "meta"];',
);
await replaceOnce(
  "js/practiceLab/practiceRepository.js",
  '        const checkpoint = await transaction.get("activeSessionCheckpoints", sessionSummary.profileId);',
  '        let mergedAbilityState = null;\n        if (abilityObservation) {\n          const abilityStateId = createPracticeAbilityStateId(abilityObservation.profileId, abilityObservation.contextId, abilityObservation.channel);\n          let abilityState = await transaction.get("abilityStates", abilityStateId);\n          if (abilityState) {\n            const migration = migratePracticeRecord("abilityState", abilityState);\n            if (!migration.ok) throw migration.error;\n            abilityState = migration.value;\n          } else {\n            abilityState = createDefaultPracticeAbilityState({ profileId: abilityObservation.profileId, contextId: abilityObservation.contextId, channel: abilityObservation.channel, now: () => new Date(abilityObservation.completedAtUtc) });\n          }\n          mergedAbilityState = mergePracticeAbilityObservation(abilityState, abilityObservation);\n          const mergedAbilityValidation = validatePracticeAbilityState(mergedAbilityState, { maxBytes: PRACTICE_LIMITS.abilityStateBytes });\n          if (!mergedAbilityValidation.valid) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Merged Practice ability state failed validation", { operation: "commit-session", storeName: "abilityStates", recordId: abilityStateId, cause: mergedAbilityValidation.errors });\n        }\n        const checkpoint = await transaction.get("activeSessionCheckpoints", sessionSummary.profileId);',
);
await replaceOnce(
  "js/practiceLab/practiceRepository.js",
  '        for (const merged of mergedStats) await transaction.put("skillStats", merged);\n        for (const change of reviewItemChanges) {',
  '        for (const merged of mergedStats) await transaction.put("skillStats", merged);\n        if (mergedAbilityState) await transaction.put("abilityStates", mergedAbilityState);\n        for (const change of reviewItemChanges) {',
);
await replaceOnce(
  "js/practiceLab/practiceRepository.js",
  '        return { committed: true, idempotent: false, mergedSkillStatCount: mergedStats.length };',
  '        return { committed: true, idempotent: false, mergedSkillStatCount: mergedStats.length, abilityUpdated: Boolean(mergedAbilityState) };',
);

console.log("PL13 integration patch applied.");
