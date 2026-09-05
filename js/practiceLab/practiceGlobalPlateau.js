import { PRACTICE_GLOBAL_PLATEAU_MODEL_VERSION } from "./practiceLearningConstants.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";

const DAY_MS = 86_400_000;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function computePracticeRecentContextDose(learningStates, now, policy = PRACTICE_LEARNING_POLICY_V1) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new TypeError("Practice recent dose requires injected current time");
  const start = nowMs - policy.globalPlateau.recentDoseDays * DAY_MS;
  let recentDoseUnits = 0;
  const sessions = new Set();
  const days = new Set();
  for (const state of learningStates ?? []) {
    for (const observation of state?.acquisition?.observations ?? []) {
      const time = Date.parse(observation.completedAtUtc);
      if (!Number.isFinite(time) || time < start || time > nowMs) continue;
      recentDoseUnits += Number(observation.doseUnits || 0);
      sessions.add(observation.sessionId);
      days.add(observation.localDayKey);
    }
  }
  return freezeDeep({
    windowDays: policy.globalPlateau.recentDoseDays,
    recentDoseUnits,
    recentTargetedSessions: sessions.size,
    recentTrainingDays: days.size,
  });
}

function dominantType(entityResults) {
  const counts = { motor: 0, control: 0, transfer: 0 };
  for (const result of entityResults ?? []) {
    if (result?.saturation?.type === "transfer-limited") counts.transfer += 1;
    else if (result?.saturation?.diagnostics?.plateauMechanismFamily === "motor-speed") counts.motor += 1;
    else if (result?.saturation?.diagnostics?.plateauMechanismFamily === "control") counts.control += 1;
  }
  const values = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!values[0][1]) return "unknown";
  if (values.length > 1 && values[0][1] === values[1][1]) return "mixed";
  return values[0][0];
}

export function evaluatePracticeGlobalPlateau({
  abilityCurve,
  recentDose,
  entityResults = [],
  policy = PRACTICE_LEARNING_POLICY_V1,
} = {}) {
  const stableAbility = abilityCurve?.status === "stable";
  const confidence = abilityCurve?.confidence ?? "none";
  const unresolved = entityResults.filter((result) =>
    ["likely", "confirmed"].includes(result?.limiter?.status)
    || result?.mastery?.stage === "learning",
  );
  const strongSignals = entityResults.filter((result) => ["likely", "supported"].includes(result?.saturation?.status));
  const transferLimited = entityResults.filter((result) => result?.saturation?.type === "transfer-limited");
  const possible = stableAbility
    && ["medium", "high"].includes(confidence)
    && Number(recentDose?.recentDoseUnits || 0) >= policy.globalPlateau.possibleDoseUnits
    && Number(recentDose?.recentTrainingDays || 0) >= policy.globalPlateau.possibleTrainingDays
    && unresolved.length > 0;
  const strongAbility = confidence === "high"
    || (confidence === "medium" && Number(abilityCurve?.spanDays || 0) >= 14);
  const supported = possible
    && strongAbility
    && Number(recentDose?.recentDoseUnits || 0) >= policy.globalPlateau.supportedDoseUnits
    && Number(recentDose?.recentTrainingDays || 0) >= policy.globalPlateau.supportedTrainingDays
    && (strongSignals.length >= policy.globalPlateau.supportedMinimumEntitySignals || transferLimited.length > 0);
  const hasAbilityEvidence = abilityCurve && abilityCurve.status !== "insufficient-data";
  let status = "insufficient-data";
  if (hasAbilityEvidence) status = supported ? "supported" : possible ? "possible" : "not-detected";
  return freezeDeep({
    modelVersion: PRACTICE_GLOBAL_PLATEAU_MODEL_VERSION,
    status,
    confidence: status === "supported" ? "high" : status === "possible" ? "medium" : abilityCurve?.confidence ?? "none",
    type: ["possible", "supported"].includes(status) ? dominantType(strongSignals.length ? strongSignals : unresolved) : "unknown",
    abilityCurveStatus: abilityCurve?.status ?? "insufficient-data",
    recentDose: recentDose ?? null,
    evidence: {
      unresolvedEntityCount: unresolved.length,
      strongEntitySaturationCount: strongSignals.length,
      transferLimitedCount: transferLimited.length,
    },
  });
}
