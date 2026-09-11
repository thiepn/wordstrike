import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_TREATMENT_DELAY_BOUNDARIES,
  PRACTICE_TREATMENT_OUTCOME_POLICY_VERSION,
  PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
} from "./practiceTreatmentConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const time = (value) => {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
};

export function createPracticeTreatmentOutcomeCandidate({
  profileId,
  contextId,
  sessionId,
  observedAt,
  localDayKey = null,
  sourceKind,
  subjectKind,
  subjectId,
  outcomeDomain = null,
  protocolFingerprint = null,
  metrics = {},
  uncertainty = null,
  validity = {},
  evidenceRole = null,
} = {}) {
  if (!profileId || !contextId || !sessionId || !observedAt || !sourceKind || !subjectKind || !subjectId) throw new TypeError("Treatment outcome candidate identity is incomplete");
  const candidateId = `practice-treatment-candidate_${hashPracticeContent(JSON.stringify([sessionId, sourceKind, subjectId, protocolFingerprint ?? "none"]))}`;
  return freezeDeep({
    candidateId,
    policyVersion: PRACTICE_TREATMENT_OUTCOME_POLICY_VERSION,
    responseModelVersion: PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
    profileId,
    contextId,
    sessionId,
    observedAt,
    localDayKey,
    sourceKind,
    subjectKind,
    subjectId,
    outcomeDomain,
    protocolFingerprint,
    metrics,
    uncertainty,
    validity,
    evidenceRole,
  });
}

export function getPracticeTreatmentDelayBucket(delayMs) {
  if (!Number.isFinite(delayMs) || delayMs < 0) return null;
  if (delayMs <= PRACTICE_TREATMENT_DELAY_BOUNDARIES.nextDayMaximumMs) return "next-day";
  if (delayMs <= PRACTICE_TREATMENT_DELAY_BOUNDARIES.shortMaximumMs) return "short";
  return "long";
}

function compatibleVersion(expected, actual) {
  return expected == null || actual == null || expected === actual;
}

export function evaluatePracticeTreatmentOutcomeCandidate(episode, contract, candidate) {
  if (!episode || !contract || !candidate) return { eligible: false, reason: "missing-input" };
  if (episode.profileId !== candidate.profileId || episode.contextId !== candidate.contextId) return { eligible: false, reason: "context-mismatch" };
  if (episode.treatment?.treatmentSessionId === candidate.sessionId) return { eligible: false, reason: "same-session" };
  if (contract.sourceKind !== candidate.sourceKind) return { eligible: false, reason: "source-mismatch" };
  if (candidate.validity?.eligible === false || candidate.validity?.valid === false) return { eligible: false, reason: "invalid-candidate" };
  const completedAt = time(episode.treatment?.completedAt);
  const observedAt = time(candidate.observedAt);
  if (completedAt == null || observedAt == null || observedAt <= completedAt) return { eligible: false, reason: "not-later" };
  const delayMs = observedAt - completedAt;
  if (delayMs < contract.minimumDelayMs) return { eligible: false, reason: "too-early", delayMs };
  if (delayMs > contract.maximumDelayMs) return { eligible: false, reason: "expired", delayMs };
  if (episode.treatment?.completedLocalDayKey && candidate.localDayKey && episode.treatment.completedLocalDayKey === candidate.localDayKey) return { eligible: false, reason: "same-local-day", delayMs };

  if (["target-baseline-retest", "retention-review", "cold-transfer"].includes(candidate.sourceKind)) {
    if (!episode.treatment?.targetStatId || candidate.subjectId !== episode.treatment.targetStatId) return { eligible: false, reason: "target-mismatch", delayMs };
  }
  if (candidate.sourceKind === "target-baseline-retest" && candidate.protocolFingerprint !== episode.treatment?.protocolFingerprint) return { eligible: false, reason: "protocol-mismatch", delayMs };
  if (candidate.sourceKind === "ability-observation" && candidate.outcomeDomain !== episode.treatment?.outcomeDomain) return { eligible: false, reason: "domain-mismatch", delayMs };
  if (["consistency-result", "control-frontier"].includes(candidate.sourceKind) && candidate.outcomeDomain !== episode.treatment?.outcomeDomain) return { eligible: false, reason: "domain-mismatch", delayMs };

  const baseline = episode.baseline;
  if (candidate.sourceKind === "ability-observation" && baseline?.abilityState) {
    if (!compatibleVersion(baseline.abilityState.abilityModelVersion, candidate.validity?.abilityModelVersion)) return { eligible: false, reason: "model-version-mismatch", delayMs };
  }
  if (candidate.sourceKind === "consistency-result" && baseline?.consistencyState) {
    if (!compatibleVersion(baseline.consistencyState.analysisVersion, candidate.validity?.analysisVersion)) return { eligible: false, reason: "model-version-mismatch", delayMs };
    if (Number.isFinite(baseline.consistencyState.durationMs) && Number.isFinite(candidate.validity?.durationMs) && baseline.consistencyState.durationMs !== candidate.validity.durationMs) return { eligible: false, reason: "duration-mismatch", delayMs };
  }
  if (candidate.sourceKind === "control-frontier" && baseline?.frontierState) {
    if (!compatibleVersion(baseline.frontierState.modelVersion, candidate.validity?.modelVersion) || !compatibleVersion(baseline.frontierState.policyVersion, candidate.validity?.policyVersion)) return { eligible: false, reason: "model-version-mismatch", delayMs };
  }
  return { eligible: true, reason: null, delayMs, delayBucket: getPracticeTreatmentDelayBucket(delayMs) };
}

export function selectPracticeTreatmentOutcomeEpisode(episodes, candidate) {
  const matches = [];
  for (const episode of episodes ?? []) {
    if (episode?.status !== "tracking") continue;
    for (const contract of episode.outcomeContracts ?? []) {
      const slot = episode.outcomes?.find((outcome) => outcome.outcomeKey === contract.outcomeKey);
      if (!slot || slot.status !== "pending") continue;
      const evaluation = evaluatePracticeTreatmentOutcomeCandidate(episode, contract, candidate);
      if (evaluation.eligible) matches.push({ episode, contract, slot, evaluation });
    }
  }
  matches.sort((a, b) => (time(b.episode.treatment?.completedAt) ?? 0) - (time(a.episode.treatment?.completedAt) ?? 0)
    || String(a.episode.treatmentEpisodeId).localeCompare(String(b.episode.treatmentEpisodeId)));
  return { winner: matches[0] ?? null, superseded: matches.slice(1) };
}

export function attachPracticeTreatmentOutcome(episode, { contract, candidate, evaluation, contamination, response, repeatedFamily = false, primaryEligible = true } = {}) {
  const contaminationLevel = contamination?.level ?? "none";
  const measurementGrade = contract?.measurementGrade ?? "independent";
  let evidenceGrade = "prospective-recorded-clean";
  if (candidate?.validity?.compatible === false) evidenceGrade = "incompatible";
  else if (["material", "uncertain"].includes(contaminationLevel)) evidenceGrade = "recorded-confounded";
  else if (measurementGrade === "hybrid") evidenceGrade = "hybrid-measurement";
  else if (contaminationLevel === "background") evidenceGrade = "background-practice";
  const eligibleForPrimary = Boolean(primaryEligible)
    && evidenceGrade === "prospective-recorded-clean"
    && !repeatedFamily
    && Number.isFinite(response?.responseValue)
    && episode?.baseline?.status === "available";
  const outcomes = (episode.outcomes ?? []).map((slot) => slot.outcomeKey !== contract.outcomeKey ? slot : freezeDeep({
    ...slot,
    status: evidenceGrade === "incompatible" ? "incompatible" : ["material", "uncertain"].includes(contaminationLevel) ? "contaminated" : "observed",
    candidateId: candidate.candidateId,
    observedAt: candidate.observedAt,
    delayMs: evaluation.delayMs,
    delayBucket: evaluation.delayBucket,
    evidenceGrade,
    measurementGrade,
    primaryEligible: eligibleForPrimary,
    repeatedFamily,
    contamination,
    response,
    reason: repeatedFamily ? "repeated-family" : contamination?.reasons?.[0] ?? null,
  }));
  const updatedAt = candidate.observedAt;
  const terminal = outcomes.every((slot) => ["observed", "contaminated", "expired", "incompatible", "not-applicable"].includes(slot.status));
  return freezeDeep({ ...episode, outcomes, status: terminal ? "closed" : episode.status, closedAt: terminal ? updatedAt : episode.closedAt, updatedAt });
}

export function contaminatePracticeTreatmentOutcomeSlot(episode, outcomeKey, reason, at = new Date().toISOString()) {
  const outcomes = (episode.outcomes ?? []).map((slot) => slot.outcomeKey !== outcomeKey || slot.status !== "pending" ? slot : freezeDeep({
    ...slot,
    status: "contaminated",
    evidenceGrade: "recorded-confounded",
    primaryEligible: false,
    contamination: { level: "material", reasons: [reason], auditedAt: at },
    reason,
  }));
  const terminal = outcomes.every((slot) => ["observed", "contaminated", "expired", "incompatible", "not-applicable"].includes(slot.status));
  return freezeDeep({ ...episode, outcomes, status: terminal ? "closed" : episode.status, closedAt: terminal ? at : episode.closedAt, updatedAt: at });
}
