import {
  PRACTICE_RESEARCH_ARMS,
  PRACTICE_RESEARCH_CONSENT_VERSION,
  PRACTICE_RESEARCH_DESIGN,
  PRACTICE_RESEARCH_ENTITY_TYPES,
  PRACTICE_RESEARCH_FOCUSED_MAPPING,
  PRACTICE_RESEARCH_POLICY,
  PRACTICE_RESEARCH_PROBE_QUOTAS,
  PRACTICE_RESEARCH_STUDY_ID,
  PRACTICE_RESEARCH_STUDY_SCHEMA_VERSION,
  PRACTICE_RESEARCH_STUDY_VERSION,
} from "./practiceResearchConstants.js";

const encoder = new TextEncoder();

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

export function canonicalizePracticeResearchStudy(study) {
  const { studyHash: _ignored, ...definition } = study ?? {};
  return JSON.stringify(canonical(definition));
}

function hex(bytes) { return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(""); }

export async function computePracticeResearchStudyHash(study, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle?.digest) throw new Error("Web Crypto SHA-256 is required for Practice Research");
  const digest = await cryptoImpl.subtle.digest("SHA-256", encoder.encode(canonicalizePracticeResearchStudy(study)));
  return `sha256:${hex(new Uint8Array(digest))}`;
}

const INITIAL_STUDY = Object.freeze({
  schemaVersion: PRACTICE_RESEARCH_STUDY_SCHEMA_VERSION,
  studyId: PRACTICE_RESEARCH_STUDY_ID,
  studyVersion: PRACTICE_RESEARCH_STUDY_VERSION,
  title: "Boss vs Focused Practice",
  description: "A local randomized comparison of Weakness Boss and the corresponding focused Practice intervention.",
  question: "When the same type of measured weakness is eligible for both approaches, does delayed target performance differ after Weakness Boss versus the corresponding standard focused intervention?",
  status: "available",
  design: PRACTICE_RESEARCH_DESIGN,
  consentVersion: PRACTICE_RESEARCH_CONSENT_VERSION,
  eligibility: Object.freeze({
    weaknessStatuses: Object.freeze(["likely", "confirmed"]),
    hierarchyStatuses: Object.freeze(["independent", "partial"]),
    entityTypes: PRACTICE_RESEARCH_ENTITY_TYPES,
    minimumBossTargetUtility: 35,
    requiresLearningHeadroom: true,
    excludesStableAnchor: true,
    excludesDueRetentionReview: true,
    excludesCoachTargetToday: true,
    excludesDirectPracticeHours: 24,
    excludesResearchTargetDays: 7,
    prefersResearchTargetDays: 30,
    requiresCanonicalFocusedMapping: true,
  }),
  targetSelection: Object.freeze({ order: "target-before-arm", ranking: "highest-boss-target-utility", responseHistory: false, coachPersonalization: false }),
  strata: Object.freeze(["entityType"]),
  arms: Object.freeze([
    Object.freeze({ armId: PRACTICE_RESEARCH_ARMS.FOCUSED, title: "Focused Practice", mapping: PRACTICE_RESEARCH_FOCUSED_MAPPING }),
    Object.freeze({ armId: PRACTICE_RESEARCH_ARMS.BOSS, title: "Weakness Boss", experimentId: "weakness-boss" }),
  ]),
  randomization: Object.freeze({ kind: "stratified-permuted-block", blockSize: 4, allocation: "2:2", hash: "SHA-256", seedBits: 128, reroll: false, concealUntil: "baseline-valid" }),
  baselineProtocol: Object.freeze({ experimentId: "research-target-probe", partition: "diagnostic", quotas: PRACTICE_RESEARCH_PROBE_QUOTAS, qualityCoverageMinimum: 0.60 }),
  primaryOutcome: Object.freeze({ outcomeId: "ResearchQualityDelta", formula: "FollowupQuality-BaselineQuality", unit: "quality-points", practicalThreshold: 5 }),
  secondaryOutcomes: Object.freeze(["FirstPassAccuracyDeltaPp", "NormalizedResidualDeltaMs", "DisfluencyDeltaPp", "LaunchResidualDeltaMs", "InternalResidualDeltaMs"]),
  contaminationPolicy: Object.freeze({ accepted: Object.freeze(["none", "background"]), customText: "uncertain", sameTarget: "material", sameTargetReview: "material" }),
  maximumAssignments: PRACTICE_RESEARCH_POLICY.maximumAssignments,
  maximumEnrollmentDays: PRACTICE_RESEARCH_POLICY.maximumEnrollmentDays,
  analysis: Object.freeze({ kind: "randomized-per-protocol-local", statistic: "mean-b-minus-a", robustStatistic: "median-b-minus-a", exactBlockRandomization: true, interimUserResults: false }),
});

const STUDIES = Object.freeze(new Map([[`${PRACTICE_RESEARCH_STUDY_ID}@${PRACTICE_RESEARCH_STUDY_VERSION}`, INITIAL_STUDY]]));

export class PracticeResearchStudyRegistry {
  get(studyId, studyVersion = PRACTICE_RESEARCH_STUDY_VERSION) { return STUDIES.get(`${studyId}@${studyVersion}`) ?? null; }
  list({ status = null } = {}) { return Object.freeze([...STUDIES.values()].filter((study) => !status || study.status === status)); }
  async getBound(studyId, studyVersion = PRACTICE_RESEARCH_STUDY_VERSION, cryptoImpl = globalThis.crypto) {
    const study = this.get(studyId, studyVersion);
    if (!study) return null;
    return Object.freeze({ ...study, studyHash: await computePracticeResearchStudyHash(study, cryptoImpl) });
  }
}

export const practiceResearchStudyRegistry = new PracticeResearchStudyRegistry();
export function getPracticeResearchStudy(studyId = PRACTICE_RESEARCH_STUDY_ID, studyVersion = PRACTICE_RESEARCH_STUDY_VERSION) { return practiceResearchStudyRegistry.get(studyId, studyVersion); }
