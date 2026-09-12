import { PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import { PRACTICE_RESEARCH_CONSENT_VERSION, PRACTICE_RESEARCH_POLICY } from "./practiceResearchConstants.js";
import { generatePracticeResearchSeed } from "./practiceResearchRandomization.js";

const DAY = 86_400_000;
const iso = (value) => new Date(value).toISOString();

export function practiceResearchEnrollmentId(profileId, contextId, studyId, studyVersion) {
  return `research-enrollment:${profileId}:${contextId}:${studyId}:v${studyVersion}`;
}

export function createPracticeResearchEnrollment({ profileId, contextId, study, consented, now = Date.now(), cryptoImpl = globalThis.crypto } = {}) {
  if (consented !== true) throw new TypeError("Practice Research enrollment requires explicit consent");
  if (!profileId || !contextId || !study?.studyId || !study?.studyHash) throw new TypeError("Practice Research enrollment identity/study binding is required");
  if (study.status !== "available") throw new TypeError("Practice Research study is not open for enrollment");
  const at = Number(now instanceof Date ? now.getTime() : now);
  const enrolledAt = iso(at);
  return Object.freeze({
    researchEnrollmentId: practiceResearchEnrollmentId(profileId, contextId, study.studyId, study.studyVersion),
    profileId,
    contextId,
    recordVersion: PRACTICE_RECORD_VERSIONS.researchEnrollment,
    studyId: study.studyId,
    studyVersion: study.studyVersion,
    studyHash: study.studyHash,
    consentVersion: PRACTICE_RESEARCH_CONSENT_VERSION,
    consentedAt: enrolledAt,
    status: "active",
    randomizationSeed: generatePracticeResearchSeed(cryptoImpl),
    enrolledAt,
    maximumAssignments: study.maximumAssignments ?? PRACTICE_RESEARCH_POLICY.maximumAssignments,
    enrollmentExpiresAt: iso(at + (study.maximumEnrollmentDays ?? PRACTICE_RESEARCH_POLICY.maximumEnrollmentDays) * DAY),
    assignmentsCreated: 0,
    strataProgress: Object.freeze({ key: 0, bigram: 0, trigram: 0, word: 0 }),
    recentProbeFamilyIds: Object.freeze([]),
    pausedAt: null,
    withdrawnAt: null,
    completedAt: null,
    createdAt: enrolledAt,
    updatedAt: enrolledAt,
  });
}

export function updatePracticeResearchEnrollmentStatus(enrollment, status, now = Date.now()) {
  if (!["active", "paused", "withdrawn", "completed", "expired"].includes(status)) throw new TypeError("Unsupported Practice Research enrollment status");
  if (["withdrawn", "completed", "expired"].includes(enrollment.status)) return enrollment;
  const at = iso(now instanceof Date ? now.getTime() : now);
  return Object.freeze({
    ...enrollment,
    status,
    pausedAt: status === "paused" ? at : enrollment.pausedAt,
    withdrawnAt: status === "withdrawn" ? at : enrollment.withdrawnAt,
    completedAt: status === "completed" ? at : enrollment.completedAt,
    updatedAt: at,
  });
}

export function isPracticeResearchEnrollmentOpen(enrollment, now = Date.now()) {
  if (enrollment?.status !== "active") return false;
  const at = now instanceof Date ? now.getTime() : Number(now);
  return enrollment.assignmentsCreated < enrollment.maximumAssignments && at <= Date.parse(enrollment.enrollmentExpiresAt);
}
