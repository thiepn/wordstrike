import {
  PRACTICE_EVIDENCE_ACCURACY_SCOPES,
  PRACTICE_SKILL_EVIDENCE_POLICY_VERSION,
  PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION,
} from "./practiceSkillEvidencePolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function createPracticeOpportunityTracker({ seed = null, initialCursor = 0, accuracyScope = "complete-session" } = {}) {
  if (!PRACTICE_EVIDENCE_ACCURACY_SCOPES.includes(accuracyScope)) throw new TypeError("Unsupported Practice opportunity accuracy scope");
  if (seed && seed.trackerVersion !== PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION) throw new TypeError("Unsupported Practice opportunity tracker version");
  if (seed && seed.policyVersion !== PRACTICE_SKILL_EVIDENCE_POLICY_VERSION) throw new TypeError("Unsupported Practice opportunity policy version");
  let maxFirstAttemptCursor = Number.isInteger(seed?.maxFirstAttemptCursor)
    ? Math.max(0, seed.maxFirstAttemptCursor)
    : Math.max(0, Number.isInteger(initialCursor) ? initialCursor : 0);
  let scope = seed?.accuracyScope ?? accuracyScope;

  return Object.freeze({
    consumePosition(position) {
      if (!Number.isInteger(position) || position < 0) throw new TypeError("Practice opportunity position must be a non-negative integer");
      const isFirstAttempt = position >= maxFirstAttemptCursor;
      if (isFirstAttempt) maxFirstAttemptCursor = position + 1;
      return isFirstAttempt;
    },
    markPartial() { scope = "partial-session"; },
    getSnapshot() {
      return freezeDeep({
        trackerVersion: PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION,
        policyVersion: PRACTICE_SKILL_EVIDENCE_POLICY_VERSION,
        maxFirstAttemptCursor,
        accuracyScope: scope,
      });
    },
    get maxFirstAttemptCursor() { return maxFirstAttemptCursor; },
    get accuracyScope() { return scope; },
  });
}
