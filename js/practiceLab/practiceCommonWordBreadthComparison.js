import { PRACTICE_COMMON_WORD_BANDS } from "./practiceCommonWordsConstants.js";

const layers = Object.freeze([
  ["observed", "observedCount", "observedPercent"],
  ["repeatedEvidence", "repeatedEvidenceCount", "repeatedEvidencePercent"],
  ["automatic", "automaticCount", "automaticPercent"],
  ["strong", "strongCount", "strongPercent"],
]);
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
function compatible(a, b) {
  return a?.profileId === b?.profileId
    && a?.contextId === b?.contextId
    && a?.referenceId === b?.referenceId
    && a?.referenceVersion === b?.referenceVersion
    && a?.breadthModelVersion === b?.breadthModelVersion;
}
function deltaBlock(a, b) {
  return Object.fromEntries(layers.map(([name, countKey, percentKey]) => [name, Object.freeze({
    countDelta: Number(b?.[countKey] ?? 0) - Number(a?.[countKey] ?? 0),
    percentagePointDelta: Number(b?.[percentKey] ?? 0) - Number(a?.[percentKey] ?? 0),
  })]));
}

export function comparePracticeCommonWordBreadthSnapshots(a, b) {
  if (!compatible(a, b)) throw Object.assign(new TypeError("Common-word breadth snapshots are not strongly comparable"), { code: "COMMON_WORD_BREADTH_INCOMPATIBLE" });
  return freezeDeep({
    breadthModelVersion: a.breadthModelVersion,
    profileId: a.profileId,
    contextId: a.contextId,
    referenceId: a.referenceId,
    referenceVersion: a.referenceVersion,
    overall: deltaBlock(a.overall, b.overall),
    bands: Object.fromEntries(PRACTICE_COMMON_WORD_BANDS.map((band) => [band, deltaBlock(a.bands?.[band], b.bands?.[band])])),
    wording: "Changes describe WordStrike typing-evidence coverage, not words learned or language vocabulary growth.",
  });
}
