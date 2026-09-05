import { PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import { createEmptyPracticeSkillEvidence } from "./practiceSkillEvidenceMerge.js";
import { PRACTICE_SKILL_EVIDENCE_VERSION } from "./practiceSkillEvidencePolicy.js";

const LEGACY_FIELDS = Object.freeze([
  "sampleCount",
  "correctCount",
  "errorCount",
  "correctedErrorCount",
  "uncorrectedErrorCount",
  "latencyCount",
  "latencyMeanMs",
  "latencyM2",
  "latencyMinMs",
  "latencyMaxMs",
  "latencyEmaMs",
  "latencyHistogram",
  "recentLatencySamples",
]);

function legacyEvidence(value) {
  const result = {};
  for (const key of LEGACY_FIELDS) result[key] = Array.isArray(value[key]) ? [...value[key]] : value[key];
  const nonEmpty = ["sampleCount", "correctCount", "errorCount", "correctedErrorCount", "uncorrectedErrorCount", "latencyCount", "latencyMeanMs", "latencyM2"]
    .some((key) => Number(value[key] || 0) !== 0)
    || ["latencyMinMs", "latencyMaxMs", "latencyEmaMs"].some((key) => value[key] != null)
    || (value.latencyHistogram ?? []).some((entry) => Number(entry || 0) !== 0)
    || (value.recentLatencySamples ?? []).length > 0;
  return nonEmpty ? result : null;
}

export function migratePracticeSkillStatV2ToV3(value) {
  if (!value || Number(value.recordVersion) !== 2) throw new TypeError("PL11 skill migration requires skillStat v2");
  const legacyEvidenceV2 = legacyEvidence(value);
  const next = { ...value };
  for (const field of LEGACY_FIELDS) delete next[field];
  return {
    ...next,
    recordVersion: PRACTICE_RECORD_VERSIONS.skillStat,
    evidenceVersion: PRACTICE_SKILL_EVIDENCE_VERSION,
    evidence: createEmptyPracticeSkillEvidence({ entityType: value.entityType }),
    confidenceScore: 0,
    confidenceLevel: "none",
    legacyEvidenceV2,
  };
}
