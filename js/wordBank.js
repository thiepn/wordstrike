import {
  buildBossWordPools,
  EMERGENCY_BOSS_WORDS,
  validateBossLongVocabulary,
  validateBossWordPools,
} from "./bossGenerator.js";
import { AUDITED_FALLBACK_WORDS } from "./auditedFallbackWords.js";
import { createSeededRandom, mixSeed, shuffleSeeded } from "./random.js";

let commonGameplaySourcePromise = null;

function validateCommonGameplaySource(source) {
  const words = source?.words;
  const tiers = source?.tiers;
  const tierKeys = Object.keys(tiers || {}).sort();
  const normalizedWords = Array.isArray(words)
    ? words.map((entry) => typeof entry === "string" ? entry : entry?.word)
    : [];
  const flattenedTiers = tierKeys.flatMap((key) => tiers[key] || []);
  const approvedWords = new Set(normalizedWords);
  if (
    source?.schemaVersion !== 2 ||
    source?.filtering?.manualReviewArtifact !== "data/commonGameplayWords.manual-review.json" ||
    !Array.isArray(words) ||
    words.length !== 3000 ||
    !tiers ||
    tierKeys.join(",") !== "1,2,3,4,5" ||
    tierKeys.some((key) => !Array.isArray(tiers[key]) || tiers[key].length !== 600) ||
    approvedWords.size !== 3000 ||
    normalizedWords.some((word) => typeof word !== "string" || !/^[a-z]{2,12}$/.test(word)) ||
    new Set(flattenedTiers).size !== 3000 ||
    flattenedTiers.some((word) => !approvedWords.has(word))
  ) {
    throw new Error("Invalid manually audited common vocabulary");
  }
  return source;
}

async function fetchCommonGameplaySource() {
  const response = await fetch(new URL("../data/commonGameplayWords.json", import.meta.url));
  if (!response.ok) throw new Error(`Common vocabulary request failed: ${response.status}`);
  return validateCommonGameplaySource(await response.json());
}

function loadCommonGameplaySource() {
  if (!commonGameplaySourcePromise) {
    commonGameplaySourcePromise = fetchCommonGameplaySource().catch((error) => {
      commonGameplaySourcePromise = null;
      throw error;
    });
  }
  return commonGameplaySourcePromise;
}

function fallbackCampaignBank() {
  return {
    schemaVersion: 0,
    source: "audited-fallback",
    theme: "fallback",
    tiers: { 1: [...AUDITED_FALLBACK_WORDS] },
  };
}

function fallbackCommonWordBank() {
  return {
    schemaVersion: 0,
    source: "audited-fallback",
    words: [...AUDITED_FALLBACK_WORDS],
  };
}

export async function loadWordBank() {
  try {
    return await loadCommonGameplaySource();
  } catch (error) {
    console.warn("Using fallback word bank.", error);
    return fallbackCampaignBank();
  }
}

export async function loadCommonWordBank() {
  try {
    const source = await loadCommonGameplaySource();
    return {
      schemaVersion: source.schemaVersion ?? 1,
      source: source.source,
      words: source.words.map((entry) => typeof entry === "string" ? entry : entry.word),
    };
  } catch (error) {
    console.warn("Using fallback common vocabulary.", error);
    return fallbackCommonWordBank();
  }
}

export async function loadBossWordBank() {
  try {
    const [typingSource, longResponse] = await Promise.all([
      loadCommonGameplaySource(),
      fetch(new URL("../data/bossCommonLongWords.json", import.meta.url)),
    ]);
    if (!longResponse.ok) throw new Error(`Boss vocabulary request failed: ${longResponse.status}`);
    const longSource = await longResponse.json();
    const longValidation = validateBossLongVocabulary(longSource);
    if (!longValidation.valid) {
      throw new Error(`Invalid curated boss vocabulary: ${longValidation.errors.join("; ")}`);
    }
    const typingWords = typingSource.words.map(
      (entry) => typeof entry === "string" ? entry : entry.word,
    );
    const pools = buildBossWordPools({
      typingWords,
      longWords: longValidation.words,
    });
    const poolValidation = validateBossWordPools(pools);
    if (!poolValidation.valid) {
      throw new Error(`Invalid boss pools: ${poolValidation.errors.join("; ")}`);
    }
    return {
      schemaVersion: 1,
      source: "common-gameplay-v2+curated-long",
      typingWords,
      longWords: [...longValidation.words],
      pools,
      words: Object.values(pools).flat().map(({ word, source }) => ({ word, source })),
    };
  } catch (error) {
    console.warn("Using recognizable emergency boss vocabulary.", error);
    const typingWords = EMERGENCY_BOSS_WORDS.filter((word) => word.length <= 10);
    const longWords = EMERGENCY_BOSS_WORDS.filter((word) => word.length >= 9);
    const pools = buildBossWordPools({ typingWords, longWords });
    return {
      schemaVersion: 1,
      source: "emergency",
      typingWords,
      longWords,
      pools,
      words: Object.values(pools).flat().map(({ word, source }) => ({ word, source })),
    };
  }
}

function isValidWord(word) {
  return typeof word === "string" && /^[a-z]+$/.test(word);
}

export function createNormalWordAttempt(bank, config, attemptSeed) {
  const tiers = Object.keys(bank?.tiers || {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const tierDistance = (tier) => Math.abs(tier - config.wordTier);
  const orderedTiers = [...tiers].sort(
    (a, b) => tierDistance(a) - tierDistance(b) || a - b,
  );
  const exactLength = (word) => (
    word.length >= config.minWordLength &&
    word.length <= config.maxWordLength
  );
  const pool = [];
  const seen = new Set();
  const addWords = (words, tier, requireLength = true) => {
    for (const word of words || []) {
      if (
        isValidWord(word) &&
        (!requireLength || exactLength(word)) &&
        !seen.has(word)
      ) {
        seen.add(word);
        pool.push({ word, tier });
      }
    }
  };

  for (const tier of orderedTiers) {
    addWords(bank.tiers[String(tier)] || bank.tiers[tier], tier);
  }
  if (pool.length < config.wordCount) {
    for (const tier of orderedTiers) {
      addWords(bank.tiers[String(tier)] || bank.tiers[tier], tier, false);
      if (pool.length >= config.wordCount) break;
    }
  }
  if (!pool.length) addWords(AUDITED_FALLBACK_WORDS, config.wordTier, false);

  const targetLength = Number.isFinite(config.targetAverageWordLength)
    ? config.targetAverageWordLength
    : (config.minWordLength + config.maxWordLength) / 2;
  const random = createSeededRandom(mixSeed(attemptSeed, 0x51ec7));
  const available = [...pool];
  const selectedWords = [];
  while (selectedWords.length < config.wordCount && available.length) {
    const weights = available.map(({ word, tier }) => {
      const lengthDistance = Math.abs(word.length - targetLength);
      const tierDistanceFromTarget = Math.abs(tier - config.wordTier);
      return (
        1 / (1 + lengthDistance * lengthDistance * 0.55)
      ) * (
        1 / (1 + tierDistanceFromTarget * 1.5)
      );
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = random() * totalWeight;
    let selectedIndex = weights.length - 1;
    for (let index = 0; index < weights.length; index += 1) {
      roll -= weights[index];
      if (roll <= 0) {
        selectedIndex = index;
        break;
      }
    }
    selectedWords.push(available.splice(selectedIndex, 1)[0].word);
  }
  while (selectedWords.length < config.wordCount) {
    selectedWords.push(pool[selectedWords.length % pool.length].word);
  }
  const spawnQueue = shuffleSeeded(
    selectedWords,
    mixSeed(attemptSeed, 0x5a17e),
  );
  return { selectedWords, spawnQueue };
}

export function selectWordsForLevel(bank, config, attemptSeed) {
  return createNormalWordAttempt(bank, config, attemptSeed).spawnQueue;
}
