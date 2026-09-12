import { PRACTICE_WEAKNESS_BOSS_MIN_QUALITY_COVERAGE, PRACTICE_WEAKNESS_BOSS_RESULT_VERSION, PRACTICE_WEAKNESS_BOSS_THEME_VERSION } from "./practiceWeaknessBossConstants.js";
import { getPracticeWeaknessBossBattleSummary } from "./practiceWeaknessBossGameplay.js";
import { extractPracticeLearningPhaseOpportunities } from "./practiceLearningObservation.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const finite = Number.isFinite;
const finiteOrNull = (value) => finite(value) ? Number(value) : null;
const identity = (type, key) => `${type}\u0000${key}`;

function compactProbe(probe) {
  if (!probe) return null;
  const quality = finiteOrNull(probe.quality);
  const qualityCoverage = finiteOrNull(probe.qualityCoverage ?? probe.availableQualityWeight);
  const errorRate = finiteOrNull(probe.firstPassErrorRate);
  return freezeDeep({
    quality,
    qualityCoverage,
    opportunityCount: Number.isInteger(probe.opportunityCount) ? probe.opportunityCount : 0,
    firstPassAccuracy: finiteOrNull(probe.firstPassAccuracy ?? probe.accuracy) ?? (errorRate == null ? null : 1 - errorRate),
    normalizedResidualMedianMs: finiteOrNull(probe.normalizedResidualMedianMs),
    disfluencyRate: finiteOrNull(probe.disfluencyRate),
    launchResidualMedianMs: finiteOrNull(probe.launchResidualMedianMs),
    launchDisfluencyRate: finiteOrNull(probe.launchDisfluencyRate),
    internalResidualMedianMs: finiteOrNull(probe.internalResidualMedianMs),
    internalDisfluencyRate: finiteOrNull(probe.internalDisfluencyRate),
  });
}

function probeQualityAvailable(probe) {
  return finite(probe?.quality)
    && finite(probe?.qualityCoverage)
    && probe.qualityCoverage + 1e-12 >= PRACTICE_WEAKNESS_BOSS_MIN_QUALITY_COVERAGE
    && Number(probe?.opportunityCount || 0) > 0;
}

function maxCleanStreak(records) {
  let current = 0;
  let maximum = 0;
  for (const record of records) {
    if (record?.correct === true) {
      current += 1;
      maximum = Math.max(maximum, current);
    } else current = 0;
  }
  return maximum;
}

function probeFromObservation(observation, side) {
  if (!observation) return null;
  const entry = side === "opening";
  const metrics = entry ? observation.metrics?.entry : observation.metrics?.exit;
  return {
    quality: entry ? observation.entryQuality : observation.exitQuality,
    qualityCoverage: entry ? observation.phaseCoverage?.entryQualityCoverage : observation.phaseCoverage?.exitQualityCoverage,
    opportunityCount: entry ? observation.phaseCoverage?.entryOpportunityCount : observation.phaseCoverage?.exitOpportunityCount,
    firstPassErrorRate: metrics?.firstPassErrorRate,
    disfluencyRate: metrics?.disfluencyRate,
    normalizedResidualMedianMs: metrics?.normalizedResidualMedianMs,
    launchResidualMedianMs: metrics?.launchResidualMedianMs,
    launchDisfluencyRate: metrics?.launchDisfluencyRate,
    internalResidualMedianMs: metrics?.internalResidualMedianMs,
    internalDisfluencyRate: metrics?.internalDisfluencyRate,
  };
}

export function analyzePracticeWeaknessBossResult({
  plan,
  gameplay,
  openingProbe = null,
  finalProbe = null,
  completed = false,
} = {}) {
  if (!plan?.target) throw new TypeError("Weakness Boss analysis requires an immutable plan target");
  const opening = compactProbe(openingProbe);
  const final = compactProbe(finalProbe);
  const immediateQualityDelta = probeQualityAvailable(opening) && probeQualityAvailable(final)
    ? final.quality - opening.quality
    : null;
  const battle = getPracticeWeaknessBossBattleSummary(gameplay);
  const defeated = completed === true && gameplay?.defeated === true;
  return freezeDeep({
    resultVersion: PRACTICE_WEAKNESS_BOSS_RESULT_VERSION,
    target: {
      entityType: plan.target.entityType,
      statId: plan.target.statId,
      entityKey: plan.target.entityKey,
    },
    boss: {
      archetype: plan.bossTheme?.name ?? null,
      archetypeId: plan.bossTheme?.id ?? null,
      themeVersion: PRACTICE_WEAKNESS_BOSS_THEME_VERSION,
    },
    clearStatus: defeated ? "defeated" : "incomplete",
    openingProbe: opening,
    battle: {
      doseOpportunities: Number(plan.acquisitionDose?.opportunities || 0),
      ...battle,
    },
    finalProbe: final,
    immediateQualityDelta,
    immediateQualityDeltaLabel: "Final probe vs opening probe in this encounter.",
    acquisitionDoseStatus: defeated ? "committed" : "not-committed",
    masteryClaim: false,
  });
}

export function analyzePracticeWeaknessBossFoundationResult({ plan, contentPlan, foundationAnalysis, sessionSnapshot, segmenter = null } = {}) {
  if (!plan?.target || !contentPlan || !foundationAnalysis) throw new TypeError("Weakness Boss foundation analysis requires plan, content and foundation evidence");
  const acquisition = (foundationAnalysis.learning?.observationDeltas ?? []).find((delta) => delta?.kind === "acquisition" && delta?.statId === plan.target.statId) ?? null;
  const observation = acquisition?.observation ?? null;
  const ranges = contentPlan.metadata?.weaknessBoss?.phaseRanges ?? [];
  const battleRanges = ranges.filter((range) => range?.acquisitionDoseEligible === true);
  const recordsByEntity = extractPracticeLearningPhaseOpportunities({
    profileId: sessionSnapshot?.profileId,
    contextId: sessionSnapshot?.contextId,
    contentPlan,
    normalizedTransitions: foundationAnalysis.normalization?.normalizedTransitions ?? [],
    segmenter,
  });
  const allTargetRecords = recordsByEntity.get(identity(plan.target.entityType, plan.target.entityKey)) ?? [];
  const battleRecords = allTargetRecords.filter((record) => battleRanges.some((range) => Number.isInteger(record?.textPosition) && record.textPosition >= range.startIndex && record.textPosition < range.endIndex));
  const clean = battleRecords.filter((record) => record.correct === true).length;
  const total = battleRecords.length;
  const completed = acquisition?.observation?.doseUnits === 1 && total === Number(plan.acquisitionDose?.opportunities || 0);
  const gameplay = {
    defeated: completed,
    battle: {
      targetOpportunityCount: total,
      cleanHitCount: clean,
      recoveredHitCount: 0,
      unresolvedHitCount: Math.max(0, total - clean),
      cleanTargetStreak: 0,
      maxCleanTargetStreak: maxCleanStreak(battleRecords),
    },
  };
  return analyzePracticeWeaknessBossResult({
    plan,
    gameplay,
    openingProbe: probeFromObservation(observation, "opening"),
    finalProbe: probeFromObservation(observation, "final"),
    completed,
  });
}
