from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)

def replace(path, old, new, count=1):
    text = read(path)
    actual = text.count(old)
    if actual < count:
        raise SystemExit(f"anchor missing in {path}: expected >= {count}, found {actual}: {old[:120]!r}")
    write(path, text.replace(old, new, count))

# ---- Core storage/version envelope -------------------------------------------------
replace("js/practiceLab/practiceConstants.js", 'export const PRACTICE_DATABASE_VERSION = 3;', 'export const PRACTICE_DATABASE_VERSION = 4;')
replace("js/practiceLab/practiceConstants.js", '  sessionSummary: 7,\n  abilityState: 1,', '  sessionSummary: 8,\n  abilityState: 1,\n  performanceState: 1,')
replace("js/practiceLab/practiceConstants.js", '  abilityStateBytes: 32 * 1024,', '  abilityStateBytes: 32 * 1024,\n  performanceStateBytes: 64 * 1024,')
replace("js/practiceLab/practiceConstants.js", '  sessionSummaries: Object.freeze({', '''  performanceStates: Object.freeze({
    keyPath: "performanceStateId",
    indexes: [
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "contextId", keyPath: "contextId" }),
      Object.freeze({ name: "updatedAt", keyPath: "updatedAt" }),
      Object.freeze({ name: "profileContext", keyPath: ["profileId", "contextId"], options: { unique: true } }),
    ],
  }),
  sessionSummaries: Object.freeze({''')

replace("js/practiceLab/practiceIds.js", '  ability: "practice-ability_",', '  ability: "practice-ability_",\n  performance: "practice-performance_",')
replace("js/practiceLab/practiceIds.js", '''export function hashPracticeContent(value = "") {''', '''export function createPracticePerformanceStateId(profileId, contextId) {
  if (arguments.length !== 2) throw new TypeError("createPracticePerformanceStateId requires profileId and contextId");
  if (!isPracticeId(profileId, "profile") || !isPracticeId(contextId, "context")) throw new TypeError("Practice performance state identity is invalid");
  return `practice-performance_${[profileId, contextId].map(encodeIdentityPart).join("|")}`;
}

export function hashPracticeContent(value = "") {''')

replace("js/practiceLab/practiceDefaults.js", '    abilityMeasurementSummary: null,', '    abilityMeasurementSummary: null,\n    performanceMeasurementSummary: null,')

replace("js/practiceLab/practiceSchemas.js", '  abilityState: Object.freeze({ storeName: "abilityStates", versionField: "recordVersion" }),', '  abilityState: Object.freeze({ storeName: "abilityStates", versionField: "recordVersion" }),\n  performanceState: Object.freeze({ storeName: "performanceStates", versionField: "recordVersion" }),')

# ---- Migration / validation ---------------------------------------------------------
replace("js/practiceLab/practiceMigrations.js", 'import { validatePracticeAbilityState } from "./practiceAbilityValidation.js";', 'import { validatePracticeAbilityState } from "./practiceAbilityValidation.js";\nimport { validatePracticePerformanceState } from "./practicePerformanceValidation.js";')
replace("js/practiceLab/practiceMigrations.js", '  abilityState: validatePracticeAbilityState,', '  abilityState: validatePracticeAbilityState,\n  performanceState: validatePracticePerformanceState,')
replace("js/practiceLab/practiceMigrations.js", '  abilityState: (value) => value,', '  abilityState: (value) => value,\n  performanceState: (value) => value,')
replace("js/practiceLab/practiceMigrations.js", '    6: (value) => ({ ...value, recordVersion: 7, abilityMeasurementSummary: null }),', '    6: (value) => ({ ...value, recordVersion: 7, abilityMeasurementSummary: null }),\n    7: (value) => ({ ...value, recordVersion: 8, performanceMeasurementSummary: null }),')
replace("js/practiceLab/practiceMigrations.js", '  if (type === "sessionSummary" && version <= 6) return {', '  if (type === "sessionSummary" && version <= 7) return {')
replace("js/practiceLab/practiceMigrations.js", '''    skillEvidenceSummary: version <= 5 ? null : value.skillEvidenceSummary ?? null,
    abilityMeasurementSummary: null,
  };''', '''    skillEvidenceSummary: version <= 5 ? null : value.skillEvidenceSummary ?? null,
    abilityMeasurementSummary: version <= 6 ? null : value.abilityMeasurementSummary ?? null,
    performanceMeasurementSummary: null,
  };''')

replace("js/practiceLab/practiceValidation.js", 'import { validatePracticeAbilityMeasurementSummary } from "./practiceAbilityValidation.js";', 'import { validatePracticeAbilityMeasurementSummary } from "./practiceAbilityValidation.js";\nimport { validatePracticePerformanceMeasurementSummary } from "./practicePerformanceValidation.js";')
replace("js/practiceLab/practiceValidation.js", '  "normalizedTransitions", "typabilityFeatureVector", "skillEvidenceDeltas", "abilityObservation", "newAbilityEstimate", "leaderboardEligible",', '  "normalizedTransitions", "typabilityFeatureVector", "skillEvidenceDeltas", "abilityObservation", "newAbilityEstimate", "performanceStateDelta", "leaderboardEligible",')
replace("js/practiceLab/practiceValidation.js", '  if (summary.abilityMeasurementSummary != null) errors.push(...validatePracticeAbilityMeasurementSummary(summary.abilityMeasurementSummary).errors.map((entry) => ({ ...entry, path: `abilityMeasurementSummary.${entry.path}` })));', '  if (summary.abilityMeasurementSummary != null) errors.push(...validatePracticeAbilityMeasurementSummary(summary.abilityMeasurementSummary).errors.map((entry) => ({ ...entry, path: `abilityMeasurementSummary.${entry.path}` })));\n  if (summary.performanceMeasurementSummary != null) errors.push(...validatePracticePerformanceMeasurementSummary(summary.performanceMeasurementSummary).errors.map((entry) => ({ ...entry, path: `performanceMeasurementSummary.${entry.path}` })));')

# ---- Trusted experiment descriptor --------------------------------------------------
replace("js/practiceLab/practiceSessionContract.js", 'import { PRACTICE_ABILITY_CHANNELS } from "./practiceAbilityConstants.js";', 'import { PRACTICE_ABILITY_CHANNELS } from "./practiceAbilityConstants.js";\nimport { PRACTICE_PERFORMANCE_MEASUREMENT_KINDS } from "./practicePerformanceConstants.js";')
replace("js/practiceLab/practiceSessionContract.js", '  if (descriptor.abilityChannel != null && !PRACTICE_ABILITY_CHANNELS.includes(descriptor.abilityChannel)) errors.push({ path: "abilityChannel", code: "INVALID_ENUM", message: "unsupported ability channel" });', '''  if (descriptor.abilityChannel != null && !PRACTICE_ABILITY_CHANNELS.includes(descriptor.abilityChannel)) errors.push({ path: "abilityChannel", code: "INVALID_ENUM", message: "unsupported ability channel" });
  const performanceKind = descriptor.performanceMeasurementKind ?? null;
  const performanceChannel = descriptor.performanceReferenceChannel ?? null;
  if (performanceKind != null && !PRACTICE_PERFORMANCE_MEASUREMENT_KINDS.includes(performanceKind)) errors.push({ path: "performanceMeasurementKind", code: "INVALID_ENUM", message: "unsupported performance measurement kind" });
  if (descriptor.abilityChannel != null && performanceKind != null) errors.push({ path: "performanceMeasurementKind", code: "CONFLICT", message: "PL14 v1 cannot combine ability and performance measurement roles" });
  if (performanceKind == null && performanceChannel != null) errors.push({ path: "performanceReferenceChannel", code: "CONFLICT", message: "performance reference channel requires a performance measurement" });
  if (performanceKind === "state-probe" && !PRACTICE_ABILITY_CHANNELS.includes(performanceChannel)) errors.push({ path: "performanceReferenceChannel", code: "INVALID_ENUM", message: "state probe requires a canonical ability reference channel" });
  if (performanceKind === "control-frontier" && performanceChannel !== "controlled-speed") errors.push({ path: "performanceReferenceChannel", code: "INVALID_ENUM", message: "control frontier must reference controlled-speed" });
  if (performanceKind === "control-frontier" && typeof descriptor.buildPerformanceMeasurement !== "function") errors.push({ path: "buildPerformanceMeasurement", code: "REQUIRED", message: "control frontier requires a trusted measurement callback" });
  if (performanceKind !== "control-frontier" && descriptor.buildPerformanceMeasurement != null) errors.push({ path: "buildPerformanceMeasurement", code: "FORBIDDEN_FIELD", message: "frontier measurement callback is allowed only for control-frontier" });''')
replace("js/practiceLab/practiceSessionContract.js", '  if (Object.hasOwn(configuration ?? {}, "abilityChannel")) errors.push({ path: "abilityChannel", code: "FORBIDDEN_FIELD", message: "abilityChannel is trusted experiment metadata and cannot be configured per session" });', '''  if (Object.hasOwn(configuration ?? {}, "abilityChannel")) errors.push({ path: "abilityChannel", code: "FORBIDDEN_FIELD", message: "abilityChannel is trusted experiment metadata and cannot be configured per session" });
  if (Object.hasOwn(configuration ?? {}, "performanceMeasurementKind")) errors.push({ path: "performanceMeasurementKind", code: "FORBIDDEN_FIELD", message: "performanceMeasurementKind is trusted experiment metadata and cannot be configured per session" });
  if (Object.hasOwn(configuration ?? {}, "performanceReferenceChannel")) errors.push({ path: "performanceReferenceChannel", code: "FORBIDDEN_FIELD", message: "performanceReferenceChannel is trusted experiment metadata and cannot be configured per session" });''')
replace("js/practiceLab/practiceSessionContract.js", '    abilityChannel: null,\n    ...overrides,', '    abilityChannel: null,\n    performanceMeasurementKind: null,\n    performanceReferenceChannel: null,\n    buildPerformanceMeasurement: null,\n    ...overrides,')

replace("js/practiceLab/practiceExperimentRegistryRuntime.js", '        abilityChannel: descriptor.abilityChannel ?? null,', '        abilityChannel: descriptor.abilityChannel ?? null,\n        performanceMeasurementKind: descriptor.performanceMeasurementKind ?? null,\n        performanceReferenceChannel: descriptor.performanceReferenceChannel ?? null,')

# ---- Foundation v6 ------------------------------------------------------------------
replace("js/practiceLab/practiceFoundationAnalysis.js", 'export const PRACTICE_FOUNDATION_ANALYSIS_VERSION = 5;', 'export const PRACTICE_FOUNDATION_ANALYSIS_VERSION = 6;')
replace("js/practiceLab/practiceFoundationAnalysis.js", '  ability = null,\n} = {}) {', '  ability = null,\n  performance = null,\n} = {}) {')
replace("js/practiceLab/practiceFoundationAnalysis.js", '    ability: ability ?? freezeDeep({ version: 1, channel: null, status: "not-requested", reasons: [], observation: null, sessionSummary: null }),\n  });', '''    ability: ability ?? freezeDeep({ version: 1, channel: null, status: "not-requested", reasons: [], observation: null, sessionSummary: null }),
    performance: performance ?? freezeDeep({ version: 1, status: "not-requested", reasons: [], measurementKind: null, stateProbe: null, warmup: null, frontier: null, sessionSummary: null, performanceStateDelta: null }),
  });''')
replace("js/practiceLab/practiceFoundationAnalysis.js", '''export function withPracticeAbilityAnalysis(foundationAnalysis, ability) {
  if (!foundationAnalysis || foundationAnalysis.version !== PRACTICE_FOUNDATION_ANALYSIS_VERSION) throw new TypeError("Practice ability attachment requires current foundation analysis");
  if (!ability || typeof ability !== "object") throw new TypeError("Practice ability analysis is required");
  return freezeDeep({ ...foundationAnalysis, ability });
}''', '''export function withPracticeAbilityAnalysis(foundationAnalysis, ability) {
  if (!foundationAnalysis || foundationAnalysis.version !== PRACTICE_FOUNDATION_ANALYSIS_VERSION) throw new TypeError("Practice ability attachment requires current foundation analysis");
  if (!ability || typeof ability !== "object") throw new TypeError("Practice ability analysis is required");
  return freezeDeep({ ...foundationAnalysis, ability });
}

export function withPracticePerformanceAnalysis(foundationAnalysis, performance) {
  if (!foundationAnalysis || foundationAnalysis.version !== PRACTICE_FOUNDATION_ANALYSIS_VERSION) throw new TypeError("Practice performance attachment requires current foundation analysis");
  if (!performance || typeof performance !== "object") throw new TypeError("Practice performance analysis is required");
  return freezeDeep({ ...foundationAnalysis, performance });
}''')

# ---- PL13 common-core refactor; preserve observation shape exactly ------------------
path = "js/practiceLab/practiceAbilityObservation.js"
text = read(path)
text = text.replace('} from "./practiceAbilityPolicy.js";\n', '} from "./practiceAbilityPolicy.js";\nimport { buildPracticeAdjustedPerformanceObservation, getPracticeDifficultyAdjustment } from "./practiceAdjustedPerformance.js";\n', 1)
pattern = re.compile(r'\nfunction getDifficulty\(foundationAnalysis, policy\) \{.*?\n\}\n\nfunction calculateMeasurementUncertainty\(\{.*?\n\}\n\nexport function buildPracticeAbilityObservation', re.S)
text, n = pattern.subn('\nexport function buildPracticeAbilityObservation', text, count=1)
if n != 1:
    raise SystemExit("failed to remove duplicated PL13 adjusted-performance helpers")
text = text.replace('  const difficulty = getDifficulty(foundationAnalysis, policy);', '  const difficulty = getPracticeDifficultyAdjustment(foundationAnalysis, policy);', 1)
old = '''  const observedLogWpm = Math.log(session.wpm);
  const adjustedLogPerformance = observedLogWpm + difficulty.adjustment;
  const uncertainty = calculateMeasurementUncertainty({
    activeDurationMs: session.activeDurationMs,
    accuracy: session.accuracy,
    channelPolicy,
    difficulty,
    latencySummary: foundationAnalysis?.latency?.sessionSummary ?? null,
    policy,
  });
  const observation = freezeDeep({'''
new = '''  const core = buildPracticeAdjustedPerformanceObservation({
    wpm: session.wpm,
    rawWpm: session.rawWpm,
    accuracy: session.accuracy,
    activeDurationMs: session.activeDurationMs,
    typedCharacterCount: session.typedCharacterCount,
    foundationAnalysis,
    channelPolicy,
    policy,
  });
  const observation = freezeDeep({'''
if old not in text:
    raise SystemExit("ability observation core block anchor missing")
text = text.replace(old, new, 1)
replacements = {
    '    rawWpm: Number.isFinite(session.rawWpm) ? session.rawWpm : null,': '    rawWpm: core.rawWpm,',
    '    wpm: session.wpm,': '    wpm: core.wpm,',
    '    adjustedWpm: Math.exp(adjustedLogPerformance),': '    adjustedWpm: core.adjustedWpm,',
    '    adjustedLogPerformance,': '    adjustedLogPerformance: core.adjustedLogPerformance,',
    '    accuracy: session.accuracy,': '    accuracy: core.accuracy,',
    '    activeDurationMs: session.activeDurationMs,': '    activeDurationMs: core.activeDurationMs,',
    '    typedCharacterCount: session.typedCharacterCount,': '    typedCharacterCount: core.typedCharacterCount,',
    '    difficultyIndex: difficulty.difficultyIndex,': '    difficultyIndex: core.difficultyIndex,',
    '    difficultyAdjustmentLog: difficulty.adjustment,': '    difficultyAdjustmentLog: core.difficultyAdjustmentLog,',
    '    difficultyModelStatus: difficulty.status,': '    difficultyModelStatus: core.difficultyModelStatus,',
    '    difficultyCoverage: difficulty.coverage,': '    difficultyCoverage: core.difficultyCoverage,',
    '    measurementSigmaLog: uncertainty.measurementSigmaLog,': '    measurementSigmaLog: core.measurementSigmaLog,',
    '    measurementVarianceLog: uncertainty.measurementVarianceLog,': '    measurementVarianceLog: core.measurementVarianceLog,',
    '    reliabilityWeight: uncertainty.reliabilityWeight,': '    reliabilityWeight: core.reliabilityWeight,',
}
for old_line, new_line in replacements.items():
    if old_line not in text:
        raise SystemExit(f"ability property anchor missing: {old_line}")
    text = text.replace(old_line, new_line, 1)
write(path, text)

# ---- Repository ownership and atomic merge -----------------------------------------
replace("js/practiceLab/practiceRepository.js", 'import { createDefaultPracticeAbilityState, mergePracticeAbilityObservation } from "./practiceAbilityEstimator.js";', 'import { createDefaultPracticeAbilityState, mergePracticeAbilityObservation } from "./practiceAbilityEstimator.js";\nimport { createDefaultPracticePerformanceState, getCurrentPerformanceStateFromRecord, mergePracticePerformanceStateDelta } from "./practicePerformanceState.js";\nimport { validatePracticePerformanceState, validatePracticePerformanceStateDelta } from "./practicePerformanceValidation.js";')
replace("js/practiceLab/practiceRepository.js", '  createPracticeAbilityStateId,\n  createPracticeQuarantineId,', '  createPracticeAbilityStateId,\n  createPracticePerformanceStateId,\n  createPracticeQuarantineId,')
replace("js/practiceLab/practiceRepository.js", '  abilityStates: validatePracticeAbilityState,', '  abilityStates: validatePracticeAbilityState,\n  performanceStates: validatePracticePerformanceState,')
replace("js/practiceLab/practiceRepository.js", '  abilityStates: "abilityState",', '  abilityStates: "abilityState",\n  performanceStates: "performanceState",')
replace("js/practiceLab/practiceRepository.js", '  return record?.abilityStateId || record?.contextId || record?.sessionId', '  return record?.performanceStateId || record?.abilityStateId || record?.contextId || record?.sessionId')
replace("js/practiceLab/practiceRepository.js", '''    async listAbilityStatesAcrossContexts(profileId = ensureManifest().profileId) {
      const records = await dataStore.query("abilityStates", "profileId", profileId);
      return records.filter((record) => validatePracticeAbilityState(record).valid);
    },

    async saveSessionSummary(summary) {''', '''    async listAbilityStatesAcrossContexts(profileId = ensureManifest().profileId) {
      const records = await dataStore.query("abilityStates", "profileId", profileId);
      return records.filter((record) => validatePracticeAbilityState(record).valid);
    },

    async getPerformanceState(profileId, contextId) {
      await assertContextOwnership(profileId, contextId, { operation: "get-performance-state" });
      return readValidated("performanceStates", createPracticePerformanceStateId(profileId, contextId));
    },
    async getCurrentPerformanceState(profileId, contextId, channel, queryNow = now) {
      const state = await this.getPerformanceState(profileId, contextId);
      return getCurrentPerformanceStateFromRecord(state, channel, queryNow);
    },
    async listPerformanceStatesAcrossContexts(profileId = ensureManifest().profileId) {
      const records = await dataStore.query("performanceStates", "profileId", profileId);
      return records.filter((record) => validatePracticePerformanceState(record, { maxBytes: PRACTICE_LIMITS.performanceStateBytes }).valid);
    },

    async saveSessionSummary(summary) {''')
replace("js/practiceLab/practiceRepository.js", 'async commitCompletedPracticeSession({ sessionSummary, skillEvidenceDeltas = [], abilityObservation = null, updatedSkillStats = null, reviewItemChanges = [], updatedProfileSummary = null, clearCheckpoint = true }) {', 'async commitCompletedPracticeSession({ sessionSummary, skillEvidenceDeltas = [], abilityObservation = null, performanceStateDelta = null, updatedSkillStats = null, reviewItemChanges = [], updatedProfileSummary = null, clearCheckpoint = true }) {')
replace("js/practiceLab/practiceRepository.js", '''      if (Array.isArray(updatedSkillStats) && updatedSkillStats.length) throw practiceStorageError''', '''      if (performanceStateDelta != null) {
        const performanceValidation = validatePracticePerformanceStateDelta(performanceStateDelta);
        if (!performanceValidation.valid) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice performance-state delta failed validation", { operation: "commit-session", storeName: "performanceStates", recordId: sessionSummary.sessionId, cause: performanceValidation.errors });
        const expectedKind = performanceStateDelta.type === "frontier" ? "control-frontier" : "state-probe";
        if (performanceStateDelta.sessionId !== sessionSummary.sessionId || performanceStateDelta.profileId !== sessionSummary.profileId || performanceStateDelta.contextId !== sessionSummary.contextId || sessionSummary.performanceMeasurementSummary?.status !== "measured" || sessionSummary.performanceMeasurementSummary?.measurementKind !== expectedKind) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice performance delta does not match the completed session measurement contract", { operation: "commit-session", storeName: "performanceStates", recordId: sessionSummary.sessionId });
      }
      if (Array.isArray(updatedSkillStats) && updatedSkillStats.length) throw practiceStorageError''')
replace("js/practiceLab/practiceRepository.js", '''        || (abilityObservation && (abilityObservation.profileId !== sessionSummary.profileId || abilityObservation.contextId !== sessionSummary.contextId))
        || (updatedProfileSummary''', '''        || (abilityObservation && (abilityObservation.profileId !== sessionSummary.profileId || abilityObservation.contextId !== sessionSummary.contextId))
        || (performanceStateDelta && (performanceStateDelta.profileId !== sessionSummary.profileId || performanceStateDelta.contextId !== sessionSummary.contextId))
        || (updatedProfileSummary''')
replace("js/practiceLab/practiceRepository.js", 'const stores = ["contexts", "sessionSummaries", "skillStats", "abilityStates", "reviewItems", "profiles", "activeSessionCheckpoints", "meta"];', 'const stores = ["contexts", "sessionSummaries", "skillStats", "abilityStates", "performanceStates", "reviewItems", "profiles", "activeSessionCheckpoints", "meta"];')
replace("js/practiceLab/practiceRepository.js", '''        const checkpoint = await transaction.get("activeSessionCheckpoints", sessionSummary.profileId);''', '''        let mergedPerformanceState = null;
        if (performanceStateDelta) {
          const performanceStateId = createPracticePerformanceStateId(performanceStateDelta.profileId, performanceStateDelta.contextId);
          let performanceState = await transaction.get("performanceStates", performanceStateId);
          if (performanceState) {
            const migration = migratePracticeRecord("performanceState", performanceState);
            if (!migration.ok) throw migration.error;
            performanceState = migration.value;
          } else {
            performanceState = createDefaultPracticePerformanceState({ profileId: performanceStateDelta.profileId, contextId: performanceStateDelta.contextId, now: () => new Date(sessionSummary.completedAtUtc) });
          }
          mergedPerformanceState = mergePracticePerformanceStateDelta(performanceState, performanceStateDelta);
          const mergedPerformanceValidation = validatePracticePerformanceState(mergedPerformanceState, { maxBytes: PRACTICE_LIMITS.performanceStateBytes });
          if (!mergedPerformanceValidation.valid) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Merged Practice performance state failed validation", { operation: "commit-session", storeName: "performanceStates", recordId: performanceStateId, cause: mergedPerformanceValidation.errors });
        }
        const checkpoint = await transaction.get("activeSessionCheckpoints", sessionSummary.profileId);''')
replace("js/practiceLab/practiceRepository.js", '        if (mergedAbilityState) await transaction.put("abilityStates", mergedAbilityState);', '        if (mergedAbilityState) await transaction.put("abilityStates", mergedAbilityState);\n        if (mergedPerformanceState) await transaction.put("performanceStates", mergedPerformanceState);')
replace("js/practiceLab/practiceRepository.js", 'return { committed: true, idempotent: false, mergedSkillStatCount: mergedStats.length, abilityUpdated: Boolean(mergedAbilityState) };', 'return { committed: true, idempotent: false, mergedSkillStatCount: mergedStats.length, abilityUpdated: Boolean(mergedAbilityState), performanceUpdated: Boolean(mergedPerformanceState) };')

# ---- Session summary / finalization --------------------------------------------------
replace("js/practiceLab/practiceSessionResult.js", '      abilityMeasurementSummary: foundationAnalysis?.ability?.sessionSummary ?? null,', '      abilityMeasurementSummary: foundationAnalysis?.ability?.sessionSummary ?? null,\n      performanceMeasurementSummary: foundationAnalysis?.performance?.sessionSummary ?? null,')

replace("js/practiceLab/practiceSessionEngine.js", 'import { buildPracticeFoundationAnalysis, withPracticeAbilityAnalysis } from "./practiceFoundationAnalysis.js";', 'import { buildPracticeFoundationAnalysis, withPracticeAbilityAnalysis, withPracticePerformanceAnalysis } from "./practiceFoundationAnalysis.js";\nimport { buildPracticePerformanceAnalysis } from "./practicePerformanceAnalysis.js";')
old_block = '''      const abilityMetrics = metricsSnapshot();
      const abilityAssessment = buildPracticeAbilityObservation({
        session: {
          sessionId, profileId, contextId, status, completionReason: reason, completedAtUtc,
          localDayKey: sessionTimeContext?.localDayKey ?? getPracticeTimeContext(wallDate()).localDayKey,
          wpm: abilityMetrics.wpm, rawWpm: abilityMetrics.rawWpm, accuracy: abilityMetrics.accuracy,
          activeDurationMs: abilityMetrics.activeDurationMs, typedCharacterCount: abilityMetrics.acceptedInsertions,
          configuration: { ...configuration, correctionBehavior: configuration.correctionBehavior ?? experiment.defaultCorrectionBehavior },
        },
        experiment, foundationAnalysis, contentPlan, evidenceRole,
      });
      foundationAnalysis = withPracticeAbilityAnalysis(foundationAnalysis, abilityAssessment);
      analysis = await analyze(foundationAnalysis);'''
new_block = '''      const abilityMetrics = metricsSnapshot();
      const measurementSession = freezeDeep({
        sessionId, profileId, contextId, status, completionReason: reason, completedAtUtc,
        localDayKey: sessionTimeContext?.localDayKey ?? getPracticeTimeContext(wallDate()).localDayKey,
        wpm: abilityMetrics.wpm, rawWpm: abilityMetrics.rawWpm, accuracy: abilityMetrics.accuracy,
        activeDurationMs: abilityMetrics.activeDurationMs, typedCharacterCount: abilityMetrics.acceptedInsertions,
        configuration: { ...configuration, correctionBehavior: configuration.correctionBehavior ?? experiment.defaultCorrectionBehavior },
      });
      const abilityAssessment = buildPracticeAbilityObservation({
        session: measurementSession,
        experiment, foundationAnalysis, contentPlan, evidenceRole,
      });
      foundationAnalysis = withPracticeAbilityAnalysis(foundationAnalysis, abilityAssessment);
      const performanceKind = experiment.performanceMeasurementKind ?? null;
      let referenceAbilityState = null;
      let existingPerformanceState = null;
      let frontierMeasurement = null;
      let frontierMeasurementError = null;
      if (performanceKind) {
        existingPerformanceState = typeof repository.getPerformanceState === "function" ? await repository.getPerformanceState(profileId, contextId) : null;
        if (performanceKind === "state-probe") referenceAbilityState = await repository.getAbilityState(profileId, contextId, experiment.performanceReferenceChannel);
        if (performanceKind === "control-frontier") {
          try {
            frontierMeasurement = await experiment.buildPerformanceMeasurement(freezeDeep({
              sessionSnapshot: immutableSnapshot(),
              metricsSnapshot: metricsSnapshot(),
              eventTrace: eventBuffer.getTrace(),
              foundationAnalysisWithoutPerformance: foundationAnalysis,
              contentPlan: {
                contentId: contentPlan.contentId,
                contentHash: contentPlan.contentHash,
                completion: contentPlan.completion,
                targetEntities: contentPlan.targetEntities,
                metadata: contentPlan.metadata,
              },
            }));
          } catch (cause) {
            frontierMeasurementError = cause;
            logger?.warn?.("Practice frontier measurement callback failed", { cause });
          }
        }
      }
      const performanceAssessment = buildPracticePerformanceAnalysis({
        session: measurementSession,
        experiment,
        foundationAnalysis,
        contentPlan,
        evidenceRole,
        referenceAbilityState,
        existingPerformanceState,
        eventTrace: eventBuffer.getTrace(),
        traceMetadata: eventBuffer.getMetadata(),
        frontierMeasurement,
        frontierMeasurementError,
      });
      foundationAnalysis = withPracticePerformanceAnalysis(foundationAnalysis, performanceAssessment);
      analysis = await analyze(foundationAnalysis);'''
replace("js/practiceLab/practiceSessionEngine.js", old_block, new_block)
replace("js/practiceLab/practiceSessionEngine.js", '        abilityObservation: foundationAnalysis.ability?.observation ?? null,', '        abilityObservation: foundationAnalysis.ability?.observation ?? null,\n        performanceStateDelta: foundationAnalysis.performance?.performanceStateDelta ?? null,')

# ---- Architecture docs --------------------------------------------------------------
for doc, appendix in {
  "docs/PRACTICE_LAB_DATA_ARCHITECTURE.md": '''\n\n## PL14 performance-state storage\n\nPL14 advances Practice IndexedDB to **v4** and adds `performanceStates`, keyed by `performanceStateId` with `profileId`, `contextId`, `updatedAt`, and unique `(profileId, contextId)` indexes. `abilityStates` remains the slow-changing PL13 latent model; `performanceStates.currentStates` is temporary, `warmupModels` summarizes bounded within-session response, and `controlFrontier` is the controlled-speed boundary. Ordinary quota retention does not prune this high-value bounded context model; Practice reset clears it. Session summaries advance to v8 with only compact `performanceMeasurementSummary`; v7 migration sets that field to null and does not backfill historical readiness/frontier.\n''',
  "docs/PRACTICE_LAB_ABILITY_ESTIMATION.md": '''\n\n## PL14 separation: ability is not readiness\n\n`abilityStates` continues to store only slow-changing latent PL13 ability. It does **not** contain current readiness, warm-up state, or control-frontier evidence. PL14 state probes compare a short adjusted observation with ability without writing the ability model; control-frontier observations likewise never update ability under the v1 mutually exclusive descriptor contract.\n''',
  "docs/PRACTICE_LAB_SESSION_ENGINE.md": '''\n\n## PL14 trusted performance measurement\n\nExperiment descriptors may declare `performanceMeasurementKind` (`state-probe` or `control-frontier`) plus `performanceReferenceChannel`; session configuration cannot spoof either field. A `control-frontier` descriptor must provide the runtime-only `buildPerformanceMeasurement` callback, which emits stage candidates only. The generic engine validates/normalizes those candidates and owns persistence. PL14 v1 rejects simultaneous `abilityChannel` and performance measurement declarations. Foundation analysis v6 adds `performance`; session summary v8 adds compact `performanceMeasurementSummary`; `performanceStateDelta` is merged atomically by the repository and is never persisted inside the summary. Auxiliary frontier callback failure yields a bounded `measurement-failed` summary without discarding otherwise valid typing evidence.\n''',
}.items():
    text = read(doc)
    if "PL14" not in text:
        write(doc, text.rstrip() + appendix + "\n")

# Remove staging files from the permanent implementation commit.
for relative in ["scripts/pl14_apply.py", ".github/workflows/pl14-apply.yml"]:
    target = ROOT / relative
    if target.exists():
        target.unlink()

print("PL14 integration patch applied")
