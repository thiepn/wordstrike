import { hashPracticeContent } from "./practiceIds.js";

export const PRACTICE_RESEARCH_PROBE_MATERIAL_VERSION = 1;
export const PRACTICE_RESEARCH_PROBE_PARTITION = "diagnostic";

const FAMILY_SETS = Object.freeze({
  baseline: Object.freeze([
    Object.freeze({
      familyId: "ws-research-probe-baseline-a-v1",
      sourceId: "ws-original-research-probe-carriers-v1",
      words: Object.freeze(["calm", "blue", "fern", "gold", "mist", "pine", "lake", "dawn", "soft", "wind", "leaf", "star", "wood", "sand", "rain", "hill", "moon", "path"]),
    }),
    Object.freeze({
      familyId: "ws-research-probe-baseline-b-v1",
      sourceId: "ws-original-research-probe-carriers-v1",
      words: Object.freeze(["warm", "teal", "moss", "glow", "haze", "firs", "pond", "morn", "mild", "gale", "reed", "nova", "bark", "dune", "drip", "rise", "road", "tide"]),
    }),
  ]),
  followup: Object.freeze([
    Object.freeze({
      familyId: "ws-research-probe-followup-a-v1",
      sourceId: "ws-original-research-probe-carriers-v1",
      words: Object.freeze(["cool", "navy", "sage", "beam", "fogs", "palm", "pool", "noon", "slow", "gust", "stem", "dusk", "rock", "clay", "dewy", "vale", "wave", "lane"]),
    }),
    Object.freeze({
      familyId: "ws-research-probe-followup-b-v1",
      sourceId: "ws-original-research-probe-carriers-v1",
      words: Object.freeze(["mild", "aqua", "herb", "lamp", "vapor".slice(0, 4), "yews", "mere", "evee", "easy", "bree".slice(0, 4), "twig", "dark", "slab", "silt", "drop", "glen", "surf", "walk"]),
    }),
  ]),
});

const hashIndex = (value, modulo) => {
  let hash = 2166136261;
  for (const character of String(value ?? "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return modulo > 0 ? hash % modulo : 0;
};

function validateFamily(family, phase) {
  if (!family || typeof family.familyId !== "string" || typeof family.sourceId !== "string") throw new TypeError("Practice Research probe material family is invalid");
  if (!Array.isArray(family.words) || family.words.length < 12) throw new TypeError("Practice Research probe material requires bounded carrier words");
  for (const word of family.words) {
    if (!/^[a-z]{4}$/.test(word)) throw new TypeError(`Practice Research ${phase} carrier material must use four-letter lowercase ASCII words`);
  }
}

for (const [phase, families] of Object.entries(FAMILY_SETS)) for (const family of families) validateFamily(family, phase);
const baselineIds = new Set(FAMILY_SETS.baseline.map((family) => family.familyId));
if (FAMILY_SETS.followup.some((family) => baselineIds.has(family.familyId))) throw new TypeError("Practice Research baseline and follow-up material families must be disjoint");

export const PRACTICE_RESEARCH_PROBE_MATERIAL_FAMILIES = FAMILY_SETS;

export function selectPracticeResearchProbeMaterial({ target, phase } = {}) {
  if (!target?.statId || !target?.entityKey) throw new TypeError("Practice Research probe material requires a canonical target");
  if (!Object.hasOwn(FAMILY_SETS, phase)) throw new TypeError("Practice Research probe material phase must be baseline or followup");
  const families = FAMILY_SETS[phase];
  const family = families[hashIndex(target.statId, families.length)];
  const materialHash = hashPracticeContent(JSON.stringify({
    materialVersion: PRACTICE_RESEARCH_PROBE_MATERIAL_VERSION,
    partition: PRACTICE_RESEARCH_PROBE_PARTITION,
    familyId: family.familyId,
    sourceId: family.sourceId,
    words: family.words,
  }));
  return Object.freeze({
    materialVersion: PRACTICE_RESEARCH_PROBE_MATERIAL_VERSION,
    partition: PRACTICE_RESEARCH_PROBE_PARTITION,
    familyId: family.familyId,
    sourceId: family.sourceId,
    materialHash,
    words: family.words,
  });
}
