import { MODE_IDS } from "../modes.js";

export const PRACTICE_LAB_ROUTE = "practice-lab";
export const PRACTICE_LAB_PUBLIC_ENABLED = false;

export function createPracticeFeatureGate({
  developerMode = false,
  publicEnabled = PRACTICE_LAB_PUBLIC_ENABLED,
} = {}) {
  const snapshot = Object.freeze({
    developerMode: developerMode === true,
    publicEnabled: publicEnabled === true,
    allowed: developerMode === true || publicEnabled === true,
    reason: developerMode === true ? "developer-preview" : publicEnabled === true ? "public" : "coming-soon",
  });
  return Object.freeze({
    canAccess: () => snapshot.allowed,
    getSnapshot: () => snapshot,
    resolveModeDefinitions(modes = []) {
      return modes.map((mode) => mode.id === MODE_IDS.PRACTICE && snapshot.allowed
        ? Object.freeze({ ...mode, enabled: true, status: "preview", route: PRACTICE_LAB_ROUTE })
        : mode);
    },
  });
}

export function isPracticeLabAvailable(options) {
  return createPracticeFeatureGate(options).canAccess();
}
