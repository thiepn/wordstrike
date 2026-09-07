import { PRACTICE_ACCURACY_RECOVERY_FEEDBACK_VERSION } from "./practiceAccuracyRecoveryConstants.js";
import { PRACTICE_ACCURACY_RECOVERY_POLICY_V1 } from "./practiceAccuracyRecoveryPolicy.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export function classifyPracticeAccuracyRecoveryFeedback(episode) {
  if (!episode?.corrected) return null;
  if (Number.isFinite(episode.correctCharactersRemoved)) return episode.correctCharactersRemoved > 0 ? "repair-extra-deletion" : "repair-clean";
  return "repair-complete";
}

export function createPracticeAccuracyRecoveryFeedbackTracker({ policy = PRACTICE_ACCURACY_RECOVERY_POLICY_V1, clock = () => Date.now() } = {}) {
  let lastShownAt = -Infinity;
  let last = null;
  return Object.freeze({
    consume({ episode, attribution, target } = {}) {
      if (!episode?.corrected || !target || !Array.isArray(attribution)) return null;
      const relevant = attribution.some((entity) => entity?.entityType === target.entityType && entity?.entityKey === target.entityKey);
      if (!relevant) return null;
      const now = Number(clock());
      if (Number.isFinite(now) && now - lastShownAt < policy.feedback.cooldownMs) return null;
      const code = classifyPracticeAccuracyRecoveryFeedback(episode);
      if (!code) return null;
      lastShownAt = Number.isFinite(now) ? now : lastShownAt;
      last = freezeDeep({
        version: PRACTICE_ACCURACY_RECOVERY_FEEDBACK_VERSION,
        code,
        message: code === "repair-clean" ? "Clean repair" : code === "repair-extra-deletion" ? "Extra correct text was deleted" : "Repair complete",
        displayDurationMs: policy.feedback.displayDurationMs,
      });
      return last;
    },
    getSnapshot() { return last; },
    reset() { lastShownAt = -Infinity; last = null; },
  });
}
