import { createSeededRandom, shuffleSeeded } from "../random.js";
import {
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_WAVE_COUNT,
} from "./arcadeRushContract.js";
import {
  ARCADE_RUSH_BOSS_TARGET_DURATION_MS,
  ARCADE_RUSH_GENERATOR_VERSION,
  ARCADE_RUSH_TOTAL_PLANNED_WORDS,
  ARCADE_RUSH_WAVE_PROFILES,
  getArcadeRushWaveProfile,
} from "./arcadeRushConfig.js";
import {
  ARCADE_RUSH_BOSS_ID,
  ARCADE_RUSH_BOSS_PLAN_STATUS,
  ARCADE_RUSH_BOSS_VERSION,
} from "./arcadeRushBoss.js";

const EDGES = Object.freeze(["top", "right", "bottom", "left"]);
const SOURCE_NAMES = Object.freeze(["common", "low", "mid", "high", "difficult"]);

function cloneSerializable(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function toWord(entry) {
  return typeof entry === "string" ? entry : entry?.word;
}

function validWords(entries) {
  return [...new Set((entries || [])
    .map(toWord)
    .filter((word) => typeof word === "string" && /^[a-z]{2,12}$/.test(word)))];
}

function tierWords(campaignBank, tier) {
  return validWords(campaignBank?.tiers?.[String(tier)] || campaignBank?.tiers?.[tier]);
}

function mergeWords(...lists) {
  return [...new Set(lists.flat())];
}

export function isArcadeRushSeed(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
}

export function hashArcadeRushLabel(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 1;
}

export function deriveArcadeRushDomainSeed(seed, label) {
  if (!isArcadeRushSeed(seed) || typeof label !== "string" || !label) return null;
  return hashArcadeRushLabel(`wordstrike-arcade-rush-g${ARCADE_RUSH_GENERATOR_VERSION}:${seed}:${label}`);
}

export function createArcadeRushVocabulary({ commonWords = [], campaignBank = {} } = {}) {
  const common = validWords(commonWords);
  const tier1 = tierWords(campaignBank, 1);
  const tier2 = tierWords(campaignBank, 2);
  const tier3 = tierWords(campaignBank, 3);
  const tier4 = tierWords(campaignBank, 4);
  const tier5 = tierWords(campaignBank, 5);
  const vocabulary = {
    common,
    low: mergeWords(tier1, tier2),
    mid: mergeWords(tier2, tier3),
    high: mergeWords(tier3, tier4),
    difficult: mergeWords(tier4, tier5),
  };
  return Object.freeze(Object.fromEntries(
    Object.entries(vocabulary).map(([source, words]) => [source, Object.freeze(words)]),
  ));
}

export function isArcadeRushVocabulary(value) {
  return Boolean(
    value &&
    SOURCE_NAMES.every((source) => (
      Array.isArray(value[source]) &&
      value[source].length > 0 &&
      value[source].every((word) => typeof word === "string" && /^[a-z]{2,12}$/.test(word))
    )),
  );
}

function weightedPick(candidates, targetLength, random) {
  const weights = candidates.map((word) => {
    const distance = word.length - targetLength;
    return 1 / (1 + distance * distance * 0.7);
  });
  let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < candidates.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return candidates[index];
  }
  return candidates.at(-1) || null;
}

function sourceSchedule(profile, seed) {
  const schedule = Object.entries(profile.sourceCounts)
    .flatMap(([source, count]) => Array.from({ length: count }, () => source));
  return shuffleSeeded(schedule, deriveArcadeRushDomainSeed(seed, `wave-${profile.wave}-sources`));
}

function targetLengthForEntry(profile, random) {
  const jitterValues = [-1, -0.5, 0, 0, 0, 0.5, 1];
  const jitter = jitterValues[Math.floor(random() * jitterValues.length)];
  return Math.max(
    profile.minWordLength,
    Math.min(profile.maxWordLength, profile.targetAverageWordLength + jitter),
  );
}

function eligibleWords(vocabulary, source, profile) {
  return vocabulary[source].filter((word) => (
    word.length >= profile.minWordLength && word.length <= profile.maxWordLength
  ));
}

function pointTierForWord(word, wave) {
  const lengthTier = word.length <= 4 ? 1
    : word.length <= 6 ? 2
      : word.length <= 8 ? 3
        : word.length <= 10 ? 4
          : 5;
  const waveFloor = Math.min(5, Math.max(1, Math.ceil(Number(wave) / 2)));
  return Math.max(lengthTier, waveFloor);
}

function pickEdge(random, recentEdges) {
  let candidates = EDGES;
  if (recentEdges.length >= 2 && recentEdges.at(-1) === recentEdges.at(-2)) {
    candidates = EDGES.filter((edge) => edge !== recentEdges.at(-1));
  }
  return candidates[Math.floor(random() * candidates.length)];
}

function createWavePlan(profile, seed, vocabulary, usedWords, globalIndexStart) {
  const schedule = sourceSchedule(profile, seed);
  const wordRandom = createSeededRandom(deriveArcadeRushDomainSeed(seed, `wave-${profile.wave}-words`));
  const lengthRandom = createSeededRandom(deriveArcadeRushDomainSeed(seed, `wave-${profile.wave}-lengths`));
  const edgeRandom = createSeededRandom(deriveArcadeRushDomainSeed(seed, `wave-${profile.wave}-edges`));
  const ratioRandom = createSeededRandom(deriveArcadeRushDomainSeed(seed, `wave-${profile.wave}-ratios`));
  const eligibleBySource = Object.fromEntries(
    Object.keys(profile.sourceCounts).map((source) => [source, eligibleWords(vocabulary, source, profile)]),
  );
  if (Object.entries(profile.sourceCounts).some(([source, count]) => eligibleBySource[source].length < count)) {
    return null;
  }

  const recentEdges = [];
  const entries = [];
  for (let waveIndex = 0; waveIndex < schedule.length; waveIndex += 1) {
    const source = schedule[waveIndex];
    const candidates = eligibleBySource[source].filter((word) => !usedWords.has(word));
    if (!candidates.length) return null;
    const targetLength = targetLengthForEntry(profile, lengthRandom);
    const word = weightedPick(candidates, targetLength, wordRandom);
    if (!word) return null;
    usedWords.add(word);
    const edge = pickEdge(edgeRandom, recentEdges);
    recentEdges.push(edge);
    if (recentEdges.length > 2) recentEdges.shift();
    entries.push(Object.freeze({
      globalIndex: globalIndexStart + waveIndex,
      waveIndex,
      wave: profile.wave,
      word,
      source,
      edge,
      edgeRatio: Number((0.08 + ratioRandom() * 0.84).toFixed(6)),
      pointTier: pointTierForWord(word, profile.wave),
      trajectoryProfile: Object.freeze({
        id: `rush-wave-${profile.wave}`,
        speedPxPerSec: profile.wordSpeedPxPerSec,
      }),
    }));
  }

  return Object.freeze({
    wave: profile.wave,
    id: profile.id,
    name: profile.name,
    wordCount: profile.wordCount,
    targetDurationMs: profile.targetDurationMs,
    profile: Object.freeze({
      minWordLength: profile.minWordLength,
      maxWordLength: profile.maxWordLength,
      targetAverageWordLength: profile.targetAverageWordLength,
      spawnIntervalMs: profile.spawnIntervalMs,
      wordSpeedPxPerSec: profile.wordSpeedPxPerSec,
      maxSimultaneousWords: profile.maxSimultaneousWords,
      targetWpm: profile.targetWpm,
    }),
    entries: Object.freeze(entries),
  });
}

export function createArcadeRushPlanEnvelope({
  seed,
  waves,
  boss,
  generatorVersion = ARCADE_RUSH_GENERATOR_VERSION,
} = {}) {
  if (
    !isArcadeRushSeed(seed) ||
    generatorVersion !== ARCADE_RUSH_GENERATOR_VERSION ||
    !Array.isArray(waves) ||
    waves.length !== ARCADE_RUSH_WAVE_COUNT
  ) {
    return null;
  }
  if (!waves.every((wave, index) => (
    wave && typeof wave === "object" && !Array.isArray(wave) && wave.wave === index + 1
  ))) {
    return null;
  }
  if (!boss || typeof boss !== "object" || Array.isArray(boss)) return null;
  const clonedWaves = cloneSerializable(waves);
  const clonedBoss = cloneSerializable(boss);
  if (!clonedWaves || !clonedBoss) return null;
  return deepFreeze({
    contractVersion: ARCADE_RUSH_CONTRACT_VERSION,
    generatorVersion,
    seed,
    waves: clonedWaves,
    boss: clonedBoss,
  });
}

export function isArcadeRushPlanEnvelope(value) {
  return Boolean(
    value &&
    value.contractVersion === ARCADE_RUSH_CONTRACT_VERSION &&
    value.generatorVersion === ARCADE_RUSH_GENERATOR_VERSION &&
    isArcadeRushSeed(value.seed) &&
    Array.isArray(value.waves) &&
    value.waves.length === ARCADE_RUSH_WAVE_COUNT &&
    value.waves.every((wave, index) => wave?.wave === index + 1) &&
    value.boss && typeof value.boss === "object" && !Array.isArray(value.boss),
  );
}

export function generateArcadeRushPlan({ seed, vocabulary } = {}) {
  if (!isArcadeRushSeed(seed) || !isArcadeRushVocabulary(vocabulary)) return null;
  const usedWords = new Set();
  const waves = [];
  let globalIndex = 0;
  for (const profile of ARCADE_RUSH_WAVE_PROFILES) {
    const wave = createWavePlan(profile, seed, vocabulary, usedWords, globalIndex);
    if (!wave) return null;
    waves.push(wave);
    globalIndex += wave.entries.length;
  }
  const boss = Object.freeze({
    id: ARCADE_RUSH_BOSS_ID,
    bossVersion: ARCADE_RUSH_BOSS_VERSION,
    generatorVersion: ARCADE_RUSH_GENERATOR_VERSION,
    seed: deriveArcadeRushDomainSeed(seed, "boss"),
    targetDurationMs: ARCADE_RUSH_BOSS_TARGET_DURATION_MS,
    status: ARCADE_RUSH_BOSS_PLAN_STATUS,
  });
  return createArcadeRushPlanEnvelope({ seed, waves, boss });
}

export function isGeneratedArcadeRushPlan(value) {
  if (!isArcadeRushPlanEnvelope(value)) return false;
  const seenWords = new Set();
  let expectedGlobalIndex = 0;
  for (let waveNumber = 1; waveNumber <= ARCADE_RUSH_WAVE_COUNT; waveNumber += 1) {
    const wave = value.waves[waveNumber - 1];
    const profile = getArcadeRushWaveProfile(waveNumber);
    if (
      !profile ||
      wave.id !== profile.id ||
      wave.wordCount !== profile.wordCount ||
      !Array.isArray(wave.entries) ||
      wave.entries.length !== profile.wordCount
    ) return false;
    const sourceCounts = {};
    for (let waveIndex = 0; waveIndex < wave.entries.length; waveIndex += 1) {
      const entry = wave.entries[waveIndex];
      if (
        entry.globalIndex !== expectedGlobalIndex ||
        entry.waveIndex !== waveIndex ||
        entry.wave !== waveNumber ||
        typeof entry.word !== "string" ||
        seenWords.has(entry.word) ||
        !Object.hasOwn(profile.sourceCounts, entry.source) ||
        !EDGES.includes(entry.edge) ||
        !Number.isFinite(entry.edgeRatio) ||
        entry.edgeRatio < 0.08 || entry.edgeRatio > 0.92 ||
        !Number.isInteger(entry.pointTier) ||
        entry.pointTier < 1 || entry.pointTier > 5 ||
        entry.word.length < profile.minWordLength ||
        entry.word.length > profile.maxWordLength ||
        entry.trajectoryProfile?.speedPxPerSec !== profile.wordSpeedPxPerSec
      ) return false;
      seenWords.add(entry.word);
      sourceCounts[entry.source] = (sourceCounts[entry.source] || 0) + 1;
      expectedGlobalIndex += 1;
    }
    for (const [source, count] of Object.entries(profile.sourceCounts)) {
      if (sourceCounts[source] !== count) return false;
    }
  }
  return Boolean(
    expectedGlobalIndex === ARCADE_RUSH_TOTAL_PLANNED_WORDS &&
    value.boss?.id === ARCADE_RUSH_BOSS_ID &&
    value.boss?.bossVersion === ARCADE_RUSH_BOSS_VERSION &&
    isArcadeRushSeed(value.boss?.seed) &&
    value.boss?.generatorVersion === ARCADE_RUSH_GENERATOR_VERSION &&
    value.boss?.status === ARCADE_RUSH_BOSS_PLAN_STATUS
  );
}
