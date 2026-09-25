import { ONBOARDING_VERSIONS } from "./onboardingContent.js";
import { getResilientBrowserStorage } from "./browserStorage.js";

const PREFIX = "wordstrike.onboarding";
const HINTS_KEY = `${PREFIX}.hints.v1`;

const storage = () => getResilientBrowserStorage();
const tutorialKey = (id) => `${PREFIX}.${id}.v${ONBOARDING_VERSIONS[id]}`;

function readHints() {
  try {
    const parsed = JSON.parse(storage()?.getItem(HINTS_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

export function isTutorialSeen(id) {
  if (!ONBOARDING_VERSIONS[id]) return true;
  try { return storage()?.getItem(tutorialKey(id)) === "seen"; } catch { return false; }
}

export function markTutorialSeen(id) {
  if (!ONBOARDING_VERSIONS[id]) return false;
  try { storage()?.setItem(tutorialKey(id), "seen"); return true; } catch { return false; }
}

export function isHintSeen(id) {
  return readHints().has(id);
}

export function markHintSeen(id) {
  const hints = readHints();
  hints.add(id);
  try { storage()?.setItem(HINTS_KEY, JSON.stringify([...hints])); return true; } catch { return false; }
}

export function resetContextualHints() {
  try { storage()?.removeItem(HINTS_KEY); return true; } catch { return false; }
}

export function resetAllOnboarding() {
  for (const id of Object.keys(ONBOARDING_VERSIONS)) {
    try { storage()?.removeItem(tutorialKey(id)); } catch { /* Continue clearing other keys. */ }
  }
  resetContextualHints();
}

export function getOnboardingStorageDiagnostic() {
  return Object.freeze({
    tutorials: Object.fromEntries(Object.keys(ONBOARDING_VERSIONS).map((id) => [id, isTutorialSeen(id)])),
    hints: Object.freeze([...readHints()]),
  });
}
