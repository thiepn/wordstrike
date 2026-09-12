import { PRACTICE_WEAKNESS_BOSS_MIN_QUALITY_COVERAGE, PRACTICE_WEAKNESS_BOSS_RESULT_VERSION, PRACTICE_WEAKNESS_BOSS_THEME_VERSION } from "./practiceWeaknessBossConstants.js";
import { getPracticeWeaknessBossBattleSummary } from "./practiceWeaknessBossGameplay.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const finite = Number.isFinite;
const finiteOrNull = (value) => finite(value) ? Number(value) : null;

function compactProbe(probe) {
  if (!probe) return null;
  const quality = finiteOrNull(probe.quality);
  const qualityCoverage = finiteOrNull(probe.qualityCoverage ?? probe.availableQualityWeight);
  return freezeDeep({
    quality,
    qualityCoverage,
    opportunityCount: Number.isInteger(probe.opportunityCount) ? probe.opportunityCount : 0,
    firstPassAccuracy: finiteOrNull(probe.firstPassAccuracy ?? probe.accuracy),
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
