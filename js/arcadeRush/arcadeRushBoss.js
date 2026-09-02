import { createSeededRandom } from "../random.js";
import { ARCADE_RUSH_STARTING_INTEGRITY } from "./arcadeRushContract.js";
import { ARCADE_RUSH_BOSS_TARGET_DURATION_MS } from "./arcadeRushConfig.js";

export const ARCADE_RUSH_BOSS_PORT_METHODS = Object.freeze([
  "createEncounter",
  "handleInput",
  "update",
  "getSnapshot",
  "finalize",
]);

export const ARCADE_RUSH_BOSS_ID = "core-breaker";
export const ARCADE_RUSH_BOSS_VERSION = 1;
export const ARCADE_RUSH_BOSS_PLAN_STATUS = "CORE_BREAKER_V1";
export const ARCADE_RUSH_BOSS_MAX_HP = 8;
export const ARCADE_RUSH_BOSS_ATTACK_INTERVAL_MS = 7_500;

export const ARCADE_RUSH_BOSS_PHRASES = Object.freeze([
  "break the signal",
  "hold the line",
  "system failure",
  "final protocol",
  "lock the core",
  "shatter the circuit",
  "override sequence",
  "defend the reactor",
  "cut the feedback",
  "stabilize the grid",
  "restore the channel",
  "end the cascade",
]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function snapshot(value) {
  return deepFreeze(JSON.parse(JSON.stringify(value)));
}

function validSeed(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
}

function validIntegrity(value) {
  return Number.isSafeInteger(value)
    && value >= 1
    && value <= ARCADE_RUSH_STARTING_INTEGRITY;
}

function validPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function phraseWordCount(phrase) {
  return String(phrase || "").trim().split(/\s+/).filter(Boolean).length;
}

function currentPhrase(encounter) {
  if (!encounter?.phraseSequence?.length) return "";
  return encounter.phraseSequence[
    encounter.phraseCursor % encounter.phraseSequence.length
  ] || "";
}

function advancePhrase(encounter) {
  encounter.phraseCursor = (
    encounter.phraseCursor + 1
  ) % encounter.phraseSequence.length;
  encounter.typedIndex = 0;
}

function normalizeKey(event) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === "Backspace") return "Backspace";
  if (event.key === "Spacebar") return " ";
  if (typeof event.key !== "string" || event.key.length !== 1) return null;
  return event.key.toLowerCase();
}

function bossEvent(encounter, extra = {}) {
  return snapshot({
    handled: false,
    correct: false,
    phraseCompleted: false,
    bossDefeated: encounter?.phase === "DEFEATED",
    failed: encounter?.phase === "FAILED",
    ...extra,
    phase: encounter?.phase ?? null,
    hp: encounter?.hp ?? null,
    integrityRemaining: encounter?.integrityRemaining ?? null,
  });
}

export function generateArcadeRushBossPhraseSequence(seed) {
  if (!validSeed(seed)) return null;
  const random = createSeededRandom(seed || 1);
  const phrases = [...ARCADE_RUSH_BOSS_PHRASES];
  for (let index = phrases.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [phrases[index], phrases[swapIndex]] = [phrases[swapIndex], phrases[index]];
  }
  return Object.freeze(phrases);
}

export function isCoreBreakerEncounter(value) {
  return Boolean(
    value
    && value.id === ARCADE_RUSH_BOSS_ID
    && value.bossVersion === ARCADE_RUSH_BOSS_VERSION
    && validSeed(value.seed)
    && validPositiveInteger(value.maxHp)
    && Number.isSafeInteger(value.hp)
    && value.hp >= 0
    && value.hp <= value.maxHp
    && Number.isSafeInteger(value.integrityRemaining)
    && value.integrityRemaining >= 0
    && value.integrityRemaining <= ARCADE_RUSH_STARTING_INTEGRITY
    && Array.isArray(value.phraseSequence)
    && value.phraseSequence.length === ARCADE_RUSH_BOSS_PHRASES.length
    && ["ACTIVE", "DEFEATED", "FAILED"].includes(value.phase),
  );
}

export function createCoreBreakerEncounter({
  boss,
  seed = boss?.seed,
  integrityRemaining,
} = {}) {
  if (
    boss?.id !== ARCADE_RUSH_BOSS_ID
    || boss?.status !== ARCADE_RUSH_BOSS_PLAN_STATUS
    || boss?.bossVersion !== ARCADE_RUSH_BOSS_VERSION
    || !validSeed(seed)
    || !validIntegrity(integrityRemaining)
  ) {
    return null;
  }
  const phraseSequence = generateArcadeRushBossPhraseSequence(seed);
  if (!phraseSequence) return null;
  const duration = validPositiveInteger(boss?.targetDurationMs)
    ? boss.targetDurationMs
    : ARCADE_RUSH_BOSS_TARGET_DURATION_MS;

  return {
    id: ARCADE_RUSH_BOSS_ID,
    bossVersion: ARCADE_RUSH_BOSS_VERSION,
    seed,
    phase: "ACTIVE",
    finalized: false,
    maxHp: ARCADE_RUSH_BOSS_MAX_HP,
    hp: ARCADE_RUSH_BOSS_MAX_HP,
    durationRemainingMs: duration,
    attackRemainingMs: Math.min(ARCADE_RUSH_BOSS_ATTACK_INTERVAL_MS, duration),
    integrityRemaining,
    phraseSequence: [...phraseSequence],
    phraseCursor: 0,
    typedIndex: 0,
    successfulPhrases: 0,
    failedPhrases: 0,
    attacksLanded: 0,
    totalDamage: 0,
    correctKeystrokes: 0,
    incorrectKeystrokes: 0,
    totalKeystrokes: 0,
    correctCharacters: 0,
    missedCharacters: 0,
    completedWords: 0,
    missedWords: 0,
    timedOut: false,
    outcome: null,
  };
}

export function getCoreBreakerSnapshot(encounter) {
  if (!isCoreBreakerEncounter(encounter)) return null;
  const phrase = currentPhrase(encounter);
  return snapshot({
    id: encounter.id,
    bossVersion: encounter.bossVersion,
    seed: encounter.seed,
    phase: encounter.phase,
    finalized: encounter.finalized,
    maxHp: encounter.maxHp,
    hp: encounter.hp,
    durationRemainingMs: encounter.durationRemainingMs,
    attackRemainingMs: encounter.attackRemainingMs,
    integrityRemaining: encounter.integrityRemaining,
    phraseSequence: [...encounter.phraseSequence],
    phraseCursor: encounter.phraseCursor,
    currentPhrase: phrase,
    typedIndex: encounter.typedIndex,
    typedText: phrase.slice(0, encounter.typedIndex),
    successfulPhrases: encounter.successfulPhrases,
    failedPhrases: encounter.failedPhrases,
    attacksLanded: encounter.attacksLanded,
    totalDamage: encounter.totalDamage,
    correctKeystrokes: encounter.correctKeystrokes,
    incorrectKeystrokes: encounter.incorrectKeystrokes,
    totalKeystrokes: encounter.totalKeystrokes,
    correctCharacters: encounter.correctCharacters,
    missedCharacters: encounter.missedCharacters,
    completedWords: encounter.completedWords,
    missedWords: encounter.missedWords,
    timedOut: encounter.timedOut,
    outcome: encounter.outcome,
  });
}

function completeCurrentPhrase(encounter) {
  const phrase = currentPhrase(encounter);
  encounter.successfulPhrases += 1;
  encounter.completedWords += phraseWordCount(phrase);
  encounter.hp = Math.max(0, encounter.hp - 1);
  if (encounter.hp <= 0) {
    encounter.phase = "DEFEATED";
    encounter.outcome = "boss-defeated";
    return;
  }
  advancePhrase(encounter);
  encounter.attackRemainingMs = Math.min(
    ARCADE_RUSH_BOSS_ATTACK_INTERVAL_MS,
    encounter.durationRemainingMs,
  );
}

function missCurrentPhrase(encounter, damage) {
  const phrase = currentPhrase(encounter);
  encounter.missedCharacters += Math.max(0, phrase.length - encounter.typedIndex);
  encounter.missedWords += phraseWordCount(phrase);
  encounter.failedPhrases += 1;
  encounter.attacksLanded += 1;
  const appliedDamage = Math.min(
    encounter.integrityRemaining,
    Math.max(0, Number.isSafeInteger(damage) ? damage : 0),
  );
  encounter.integrityRemaining = Math.max(
    0,
    encounter.integrityRemaining - appliedDamage,
  );
  encounter.totalDamage += appliedDamage;
  encounter.typedIndex = 0;
  if (encounter.integrityRemaining <= 0) {
    encounter.phase = "FAILED";
    encounter.outcome = "core-destroyed";
    encounter.attackRemainingMs = 0;
    return appliedDamage;
  }
  advancePhrase(encounter);
  encounter.attackRemainingMs = Math.min(
    ARCADE_RUSH_BOSS_ATTACK_INTERVAL_MS,
    encounter.durationRemainingMs,
  );
  return appliedDamage;
}

function applyTimeoutStrike(encounter) {
  encounter.timedOut = true;
  encounter.durationRemainingMs = 0;
  encounter.attackRemainingMs = 0;
  missCurrentPhrase(encounter, encounter.integrityRemaining);
  encounter.phase = "FAILED";
  encounter.outcome = "core-destroyed";
}

export function handleCoreBreakerInput(encounter, event) {
  if (!isCoreBreakerEncounter(encounter) || encounter.finalized || encounter.phase !== "ACTIVE") {
    return bossEvent(encounter);
  }
  const key = normalizeKey(event);
  if (key == null) return bossEvent(encounter);

  if (key === "Backspace") {
    if (encounter.typedIndex > 0) encounter.typedIndex -= 1;
    return bossEvent(encounter, { handled: true, backspace: true });
  }

  const phrase = currentPhrase(encounter);
  const expected = phrase[encounter.typedIndex] ?? "";
  encounter.totalKeystrokes += 1;
  if (key !== expected) {
    encounter.incorrectKeystrokes += 1;
    return bossEvent(encounter, {
      handled: true,
      correct: false,
      expected,
      received: key,
    });
  }

  encounter.correctKeystrokes += 1;
  encounter.correctCharacters += 1;
  encounter.typedIndex += 1;
  const phraseCompleted = encounter.typedIndex >= phrase.length;
  if (phraseCompleted) completeCurrentPhrase(encounter);

  return bossEvent(encounter, {
    handled: true,
    correct: true,
    phraseCompleted,
    bossDefeated: encounter.phase === "DEFEATED",
  });
}

export function updateCoreBreakerEncounter(encounter, deltaMs) {
  if (!isCoreBreakerEncounter(encounter) || encounter.finalized || encounter.phase !== "ACTIVE") {
    return getCoreBreakerSnapshot(encounter);
  }
  let remaining = Math.max(0, Math.round(Number(deltaMs) || 0));
  while (remaining > 0 && encounter.phase === "ACTIVE") {
    const step = Math.min(
      remaining,
      encounter.durationRemainingMs,
      encounter.attackRemainingMs,
    );
    encounter.durationRemainingMs = Math.max(
      0,
      encounter.durationRemainingMs - step,
    );
    encounter.attackRemainingMs = Math.max(
      0,
      encounter.attackRemainingMs - step,
    );
    remaining -= step;

    if (encounter.durationRemainingMs <= 0) {
      applyTimeoutStrike(encounter);
      break;
    }
    if (encounter.attackRemainingMs <= 0) {
      missCurrentPhrase(encounter, 1);
    }
  }
  return getCoreBreakerSnapshot(encounter);
}

export function finalizeCoreBreakerEncounter(encounter) {
  if (
    !isCoreBreakerEncounter(encounter)
    || encounter.phase === "ACTIVE"
  ) {
    return null;
  }
  encounter.finalized = true;
  return getCoreBreakerSnapshot(encounter);
}

export function isArcadeRushBossPort(value) {
  return Boolean(
    value && typeof value === "object" &&
    ARCADE_RUSH_BOSS_PORT_METHODS.every((method) => typeof value[method] === "function"),
  );
}

export function createArcadeRushBossPort(value) {
  if (!isArcadeRushBossPort(value)) return null;
  return Object.freeze(Object.fromEntries(
    ARCADE_RUSH_BOSS_PORT_METHODS.map((method) => [method, value[method]]),
  ));
}

export function createCoreBreakerBossPort() {
  return createArcadeRushBossPort({
    createEncounter: createCoreBreakerEncounter,
    handleInput: handleCoreBreakerInput,
    update: updateCoreBreakerEncounter,
    getSnapshot: getCoreBreakerSnapshot,
    finalize: finalizeCoreBreakerEncounter,
  });
}
