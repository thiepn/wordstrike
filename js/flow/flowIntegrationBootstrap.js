import { getFlowModifierQueryValue } from "./flowModifiers.js";
import { serializeFlowWeaknessProfile } from "./flowAdaptive.js";
import { loadFlowProgress } from "./flowProgression.js";

function eligible(params) {
  return params.get("dev") === "1"
    && params.get("mode") === "flow"
    && params.get("flowRun") === "1"
    && params.get("flowIntegration") === "1";
}

export function applyFlowIntegrationDefaults(locationLike = globalThis.location) {
  if (!locationLike?.href) return false;
  const url = new URL(locationLike.href);
  if (!eligible(url.searchParams)) return false;
  const progress = loadFlowProgress();
  const setup = progress.lastSetup || {};
  const publicGameMode = url.searchParams.get("flowRelease") === "1";
  let changed = false;

  const defaults = publicGameMode
    ? [["flowLength", setup.sessionLength]]
    : [
        ["flowLength", setup.sessionLength],
        ["flowCategory", setup.category],
        ["flowDifficulty", setup.difficulty],
      ];
  for (const [key, value] of defaults) {
    if (!url.searchParams.has(key) && value) {
      url.searchParams.set(key, value);
      changed = true;
    }
  }

  if (
    !publicGameMode &&
    url.searchParams.get("flowModifiers") === "1"
    && !url.searchParams.has("flowModifierIds")
    && Array.isArray(setup.modifiers)
    && setup.modifiers.length
  ) {
    url.searchParams.set("flowModifierIds", getFlowModifierQueryValue(setup.modifiers));
    changed = true;
  }

  if (
    !publicGameMode &&
    url.searchParams.get("flowAdaptive") === "1"
    && url.searchParams.get("flowResumeAdaptive") === "1"
    && !url.searchParams.has("flowWeaknesses")
    && Array.isArray(progress.lastWeaknessProfile)
    && progress.lastWeaknessProfile.length
  ) {
    url.searchParams.set("flowWeaknesses", serializeFlowWeaknessProfile({
      version: 1,
      weaknesses: progress.lastWeaknessProfile,
    }));
    changed = true;
  }

  if (changed && globalThis.history?.replaceState) {
    globalThis.history.replaceState(null, "", url.href);
  }
  return changed;
}

applyFlowIntegrationDefaults();
