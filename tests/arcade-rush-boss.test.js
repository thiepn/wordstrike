import assert from "node:assert/strict";
import {
  ARCADE_RUSH_BOSS_ATTACK_INTERVAL_MS,
  ARCADE_RUSH_BOSS_ID,
  ARCADE_RUSH_BOSS_MAX_HP,
  ARCADE_RUSH_BOSS_PHRASES,
  ARCADE_RUSH_BOSS_PLAN_STATUS,
  ARCADE_RUSH_BOSS_TARGET_DURATION_MS,
  ARCADE_RUSH_BOSS_VERSION,
  createArcadeRushBossPort,
  createCoreBreakerBossPort,
  createCoreBreakerEncounter,
  finalizeCoreBreakerEncounter,
  generateArcadeRushBossPhraseSequence,
  getCoreBreakerSnapshot,
  handleCoreBreakerInput,
  isArcadeRushBossPort,
  isCoreBreakerEncounter,
  updateCoreBreakerEncounter,
} from "../js/arcadeRush/index.js";

function bossPlan(seed = 1234) {
  return {
    id: ARCADE_RUSH_BOSS_ID,
    bossVersion: ARCADE_RUSH_BOSS_VERSION,
    seed,
    targetDurationMs: ARCADE_RUSH_BOSS_TARGET_DURATION_MS,
    status: ARCADE_RUSH_BOSS_PLAN_STATUS,
  };
}

function typePhrase(encounter) {
  const phrase = getCoreBreakerSnapshot(encounter).currentPhrase;
  let finalEvent = null;
  for (const key of phrase) {
    finalEvent = handleCoreBreakerInput(encounter, { key });
    assert.equal(finalEvent.handled, true);
  }
  return finalEvent;
}

assert.equal(ARCADE_RUSH_BOSS_ID, "core-breaker");
assert.equal(ARCADE_RUSH_BOSS_VERSION, 1);
assert.equal(ARCADE_RUSH_BOSS_MAX_HP, 8);
assert.equal(ARCADE_RUSH_BOSS_ATTACK_INTERVAL_MS, 7_500);
assert.equal(ARCADE_RUSH_BOSS_TARGET_DURATION_MS, 45_000);
assert.equal(ARCADE_RUSH_BOSS_PHRASES.length >= ARCADE_RUSH_BOSS_MAX_HP, true);

const sequenceA = generateArcadeRushBossPhraseSequence(123456);
const sequenceB = generateArcadeRushBossPhraseSequence(123456);
const sequenceC = generateArcadeRushBossPhraseSequence(123457);
assert.deepEqual(sequenceB, sequenceA);
assert.notDeepEqual(sequenceC, sequenceA);
assert.equal(new Set(sequenceA).size, ARCADE_RUSH_BOSS_PHRASES.length);
assert.equal(Object.isFrozen(sequenceA), true);

const builtInPort = createCoreBreakerBossPort();
assert.equal(isArcadeRushBossPort(builtInPort), true);
assert.equal(Object.isFrozen(builtInPort), true);
assert.equal(createArcadeRushBossPort({}), null);

// Completing eight deterministic phrases defeats Core Breaker and locks the result.
{
  const encounter = createCoreBreakerEncounter({
    boss: bossPlan(2001),
    integrityRemaining: 5,
  });
  assert.equal(isCoreBreakerEncounter(encounter), true);
  for (let phrase = 0; phrase < ARCADE_RUSH_BOSS_MAX_HP; phrase += 1) {
    const event = typePhrase(encounter);
    assert.equal(event.phraseCompleted, true);
  }
  const defeated = getCoreBreakerSnapshot(encounter);
  assert.equal(defeated.phase, "DEFEATED");
  assert.equal(defeated.hp, 0);
  assert.equal(defeated.integrityRemaining, 5);
  assert.equal(defeated.successfulPhrases, ARCADE_RUSH_BOSS_MAX_HP);
  assert.equal(defeated.failedPhrases, 0);
  assert.equal(defeated.outcome, "boss-defeated");
  const before = defeated.durationRemainingMs;
  updateCoreBreakerEncounter(encounter, 10_000);
  assert.equal(getCoreBreakerSnapshot(encounter).durationRemainingMs, before);
  const finalized = finalizeCoreBreakerEncounter(encounter);
  assert.equal(finalized.finalized, true);
  assert.equal(finalizeCoreBreakerEncounter(encounter).finalized, true);
}

// An expired attack advances the phrase and removes one Core Integrity.
{
  const encounter = createCoreBreakerEncounter({
    boss: bossPlan(2002),
    integrityRemaining: 2,
  });
  const firstPhrase = getCoreBreakerSnapshot(encounter).currentPhrase;
  handleCoreBreakerInput(encounter, { key: firstPhrase[0] });
  updateCoreBreakerEncounter(encounter, ARCADE_RUSH_BOSS_ATTACK_INTERVAL_MS);
  const afterFirstHit = getCoreBreakerSnapshot(encounter);
  assert.equal(afterFirstHit.integrityRemaining, 1);
  assert.equal(afterFirstHit.failedPhrases, 1);
  assert.equal(afterFirstHit.attacksLanded, 1);
  assert.equal(afterFirstHit.totalDamage, 1);
  assert.equal(afterFirstHit.missedWords > 0, true);
  assert.notEqual(afterFirstHit.currentPhrase, firstPhrase);
  updateCoreBreakerEncounter(encounter, ARCADE_RUSH_BOSS_ATTACK_INTERVAL_MS);
  const failed = getCoreBreakerSnapshot(encounter);
  assert.equal(failed.phase, "FAILED");
  assert.equal(failed.integrityRemaining, 0);
  assert.equal(failed.outcome, "core-destroyed");
  assert.equal(finalizeCoreBreakerEncounter(encounter).finalized, true);
}

// Total boss timeout is converted into a final Core-destroying strike, not a separate failure reason.
{
  const encounter = createCoreBreakerEncounter({
    boss: bossPlan(2003),
    integrityRemaining: 5,
  });
  updateCoreBreakerEncounter(encounter, ARCADE_RUSH_BOSS_TARGET_DURATION_MS);
  const timedOut = getCoreBreakerSnapshot(encounter);
  assert.equal(timedOut.phase, "FAILED");
  assert.equal(timedOut.timedOut, true);
  assert.equal(timedOut.integrityRemaining, 0);
  assert.equal(timedOut.outcome, "core-destroyed");
  assert.equal(timedOut.totalDamage, 5);
}

// Backspace is supported and does not create an artificial no-backspace modifier.
{
  const encounter = createCoreBreakerEncounter({
    boss: bossPlan(2004),
    integrityRemaining: 5,
  });
  const phrase = getCoreBreakerSnapshot(encounter).currentPhrase;
  handleCoreBreakerInput(encounter, { key: phrase[0] });
  assert.equal(getCoreBreakerSnapshot(encounter).typedIndex, 1);
  const backspace = handleCoreBreakerInput(encounter, { key: "Backspace" });
  assert.equal(backspace.handled, true);
  assert.equal(getCoreBreakerSnapshot(encounter).typedIndex, 0);
}

// Chronological arbitration: a killing final key before the deadline wins; timeout first locks failure.
{
  const encounter = createCoreBreakerEncounter({
    boss: bossPlan(2005),
    integrityRemaining: 5,
  });
  for (let count = 0; count < ARCADE_RUSH_BOSS_MAX_HP - 1; count += 1) {
    typePhrase(encounter);
  }
  encounter.durationRemainingMs = 1;
  encounter.attackRemainingMs = 1;
  const phrase = getCoreBreakerSnapshot(encounter).currentPhrase;
  for (const key of phrase) handleCoreBreakerInput(encounter, { key });
  assert.equal(getCoreBreakerSnapshot(encounter).phase, "DEFEATED");
  updateCoreBreakerEncounter(encounter, 1);
  assert.equal(getCoreBreakerSnapshot(encounter).phase, "DEFEATED");

  const timed = createCoreBreakerEncounter({
    boss: bossPlan(2006),
    integrityRemaining: 5,
  });
  timed.durationRemainingMs = 1;
  timed.attackRemainingMs = 1;
  updateCoreBreakerEncounter(timed, 1);
  assert.equal(getCoreBreakerSnapshot(timed).phase, "FAILED");
  assert.equal(handleCoreBreakerInput(timed, { key: "a" }).handled, false);
}

console.log("Arcade Rush AR5 Core Breaker deterministic boss tests passed.");
