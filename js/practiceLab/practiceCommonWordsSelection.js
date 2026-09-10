import {
  PRACTICE_COMMON_WORD_BANDS,
  PRACTICE_COMMON_WORD_MICROBLOCK_SIZE,
  PRACTICE_COMMON_WORD_PRACTICE_SIZES,
  PRACTICE_COMMON_WORDS_PER_BAND_PER_MICROBLOCK,
} from "./practiceCommonWordsConstants.js";

const hash = (value) => {
  let state = 2166136261;
  for (const char of String(value)) { state ^= char.codePointAt(0); state = Math.imul(state, 16777619) >>> 0; }
  return state >>> 0;
};
const statKey = (stat) => stat?.entityType === "word" ? stat.entityKey : null;
const exposure = (stat) => Object.freeze({
  opportunities: Math.max(0, Number(stat?.evidence?.opportunities?.count ?? stat?.opportunityCount ?? 0) || 0),
  sessionCount: Math.max(0, Number(stat?.evidence?.observation?.sessionCount ?? stat?.sessionCount ?? 0) || 0),
  lastObservedAt: stat?.lastObservedAt ?? stat?.evidence?.observation?.lastObservedAt ?? null,
});
const time = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;

export function buildPracticeCommonWordExposureMap(skillStats = []) {
  const map = new Map();
  for (const stat of Array.isArray(skillStats) ? skillStats : []) {
    const key = statKey(stat);
    if (key && !map.has(key)) map.set(key, exposure(stat));
  }
  return map;
}

function coverageComparator(sessionId, exposureMap) {
  return (left, right) => {
    const a = exposureMap.get(left.lexicalKey) ?? { opportunities: 0, lastObservedAt: null };
    const b = exposureMap.get(right.lexicalKey) ?? { opportunities: 0, lastObservedAt: null };
    const unseen = Number(a.opportunities > 0) - Number(b.opportunities > 0);
    if (unseen) return unseen;
    const count = a.opportunities - b.opportunities;
    if (count) return count;
    const observed = time(a.lastObservedAt) - time(b.lastObservedAt);
    if (observed) return observed;
    return hash(`${sessionId}|${left.lexicalKey}`) - hash(`${sessionId}|${right.lexicalKey}`) || left.lexicalKey.localeCompare(right.lexicalKey);
  };
}

function interleaveMicroblock(block, sessionId, blockIndex) {
  const byBand = new Map(PRACTICE_COMMON_WORD_BANDS.map((band) => [band, block.filter((word) => word.band === band).slice().sort((a, b) => hash(`${sessionId}|${blockIndex}|${a.lexicalKey}`) - hash(`${sessionId}|${blockIndex}|${b.lexicalKey}`))]));
  const rotation = hash(`${sessionId}|block|${blockIndex}`) % PRACTICE_COMMON_WORD_BANDS.length;
  const bandOrder = PRACTICE_COMMON_WORD_BANDS.map((_, index) => PRACTICE_COMMON_WORD_BANDS[(index + rotation) % PRACTICE_COMMON_WORD_BANDS.length]);
  if (hash(`${sessionId}|reverse|${blockIndex}`) % 2) bandOrder.reverse();
  const output = [];
  for (let round = 0; round < PRACTICE_COMMON_WORDS_PER_BAND_PER_MICROBLOCK; round += 1) {
    for (const band of bandOrder) output.push(byBand.get(band)[round]);
  }
  return output;
}

export function selectPracticeCommonWords({ bank, skillStats = [], wordCount = 160, sessionId } = {}) {
  if (!PRACTICE_COMMON_WORD_PRACTICE_SIZES.includes(wordCount)) throw new TypeError("Common Words word count must be 80, 160, or 240");
  if (!sessionId) throw new TypeError("Common Words selection requires sessionId");
  const words = Array.isArray(bank?.words) ? bank.words : [];
  const exposureMap = buildPracticeCommonWordExposureMap(skillStats);
  const perBand = wordCount / PRACTICE_COMMON_WORD_BANDS.length;
  const selectedByBand = new Map();
  for (const band of PRACTICE_COMMON_WORD_BANDS) {
    const candidates = words.filter((word) => word.band === band).slice().sort(coverageComparator(sessionId, exposureMap));
    if (candidates.length < perBand) throw Object.assign(new Error(`Common Words bank lacks ${band} coverage`), { code: "COMMON_WORDS_BANK_INSUFFICIENT" });
    selectedByBand.set(band, candidates.slice(0, perBand));
  }
  const ordered = [];
  const blocks = wordCount / PRACTICE_COMMON_WORD_MICROBLOCK_SIZE;
  for (let blockIndex = 0; blockIndex < blocks; blockIndex += 1) {
    const block = [];
    for (const band of PRACTICE_COMMON_WORD_BANDS) {
      const start = blockIndex * PRACTICE_COMMON_WORDS_PER_BAND_PER_MICROBLOCK;
      block.push(...selectedByBand.get(band).slice(start, start + PRACTICE_COMMON_WORDS_PER_BAND_PER_MICROBLOCK));
    }
    ordered.push(...interleaveMicroblock(block, sessionId, blockIndex));
  }
  if (new Set(ordered.map((word) => word.lexicalKey)).size !== wordCount) throw new Error("Common Words plan contains a duplicate lexical key");
  const preSession = Object.fromEntries(ordered.map((word) => [word.lexicalKey, exposureMap.get(word.lexicalKey) ?? { opportunities: 0, sessionCount: 0, lastObservedAt: null }]));
  return Object.freeze({ words: Object.freeze(ordered.map((word) => Object.freeze({ ...word }))), exposureMap, preSession: Object.freeze(preSession) });
}
