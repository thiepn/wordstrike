import { PRACTICE_WEAKNESS_BOSS_GAMEPLAY_VERSION, PRACTICE_WEAKNESS_BOSS_PHASES, PRACTICE_WEAKNESS_BOSS_QUOTAS } from "./practiceWeaknessBossConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const VALID_HITS = new Set(["clean-hit", "recovered-hit", "unresolved-hit"]);

function phaseDefinition(phaseId) {
  return PRACTICE_WEAKNESS_BOSS_PHASES.find((phase) => phase.id === phaseId) ?? null;
}

export function createPracticeWeaknessBossGameplayState({ entityType } = {}) {
  const quotas = PRACTICE_WEAKNESS_BOSS_QUOTAS[entityType];
  if (!quotas) throw new TypeError("Weakness Boss gameplay requires a supported target type");
  return freezeDeep({
    gameplayVersion: PRACTICE_WEAKNESS_BOSS_GAMEPLAY_VERSION,
    entityType,
    bossHp: 100,
    defeated: false,
    phaseProgress: Object.freeze(Object.fromEntries(PRACTICE_WEAKNESS_BOSS_PHASES.map((phase) => [phase.id, 0]))),
    battle: Object.freeze({
      targetOpportunityCount: 0,
      cleanHitCount: 0,
      recoveredHitCount: 0,
      unresolvedHitCount: 0,
      cleanTargetStreak: 0,
      maxCleanTargetStreak: 0,
    }),
  });
}

export function advancePracticeWeaknessBossOpportunity(state, {
  phaseId,
  hitState = "clean-hit",
  targetOpportunity = true,
} = {}) {
  if (!state || state.defeated || targetOpportunity !== true) return state;
  if (!VALID_HITS.has(hitState)) throw new TypeError("Weakness Boss hit state is invalid");
  const quotas = PRACTICE_WEAKNESS_BOSS_QUOTAS[state.entityType];
  const phase = phaseDefinition(phaseId);
  const quota = quotas?.[phaseId];
  if (!phase || !Number.isInteger(quota) || quota < 1) throw new TypeError("Weakness Boss phase is invalid");
  const priorCount = Number(state.phaseProgress?.[phaseId] ?? 0);
  if (priorCount >= quota) return state;
  const completed = priorCount + 1;
  const phaseDamage = phase.hpAllocation / quota;
  const bossHp = Math.max(0, Number(state.bossHp) - phaseDamage);
  const isBattle = phase.acquisitionDoseEligible === true;
  const battle = { ...state.battle };
  if (isBattle) {
    battle.targetOpportunityCount += 1;
    if (hitState === "clean-hit") {
      battle.cleanHitCount += 1;
      battle.cleanTargetStreak += 1;
      battle.maxCleanTargetStreak = Math.max(battle.maxCleanTargetStreak, battle.cleanTargetStreak);
    } else {
      if (hitState === "recovered-hit") battle.recoveredHitCount += 1;
      else battle.unresolvedHitCount += 1;
      battle.cleanTargetStreak = 0;
    }
  }
  const phaseProgress = { ...state.phaseProgress, [phaseId]: completed };
  const protocolComplete = PRACTICE_WEAKNESS_BOSS_PHASES.every((entry) => phaseProgress[entry.id] >= quotas[entry.id]);
  return freezeDeep({
    ...state,
    bossHp: protocolComplete ? 0 : bossHp,
    defeated: protocolComplete,
    phaseProgress,
    battle,
  });
}

export function getPracticeWeaknessBossDisplayedHp(state) {
  return Math.max(0, Math.min(100, Number(state?.bossHp ?? 100)));
}

export function getPracticeWeaknessBossBattleSummary(state) {
  const battle = state?.battle ?? {};
  const attempts = Number(battle.targetOpportunityCount || 0);
  const clean = Number(battle.cleanHitCount || 0);
  return freezeDeep({
    targetOpportunityCount: attempts,
    cleanHitCount: clean,
    recoveredHitCount: Number(battle.recoveredHitCount || 0),
    unresolvedHitCount: Number(battle.unresolvedHitCount || 0),
    battleFirstPassAccuracy: attempts > 0 ? clean / attempts : null,
    maxCleanTargetStreak: Number(battle.maxCleanTargetStreak || 0),
  });
}
