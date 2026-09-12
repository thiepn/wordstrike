import { buildPracticeLearningAnalysis, extractPracticeLearningPhaseOpportunities } from "./practiceLearningObservation.js";
import { buildPracticePhaseQuality } from "./practiceLearningQuality.js";
import { getPracticeTrustedWeaknessBossBinding } from "./practiceWeaknessBossTrust.js";
import { PRACTICE_WEAKNESS_BOSS_QUOTAS } from "./practiceWeaknessBossConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const finite = Number.isFinite;
const identity = (type, key) => `${type}\u0000${key}`;
const inRange = (record, range) => Number.isInteger(record?.textPosition)
  && record.textPosition >= range.startIndex
  && record.textPosition < range.endIndex;

function phaseQuality(entityType, records, policy) {
  const built = buildPracticePhaseQuality(entityType, records, policy);
  return {
    quality: finite(built?.quality) ? built.quality : null,
    coverage: finite(built?.availableQualityWeight) ? built.availableQualityWeight : 0,
    metrics: built?.metrics ?? null,
  };
}

export function buildPracticeWeaknessBossLearningAnalysis(options = {}) {
  const base = buildPracticeLearningAnalysis(options);
  const binding = getPracticeTrustedWeaknessBossBinding(options.contentPlan);
  if (!binding || options.evidenceRole !== "training" || options.retentionMeasurementKind != null) return base;
  const metadata = options.contentPlan?.metadata?.weaknessBoss;
  const ranges = metadata?.phaseRanges ?? [];
  const openingRange = ranges.find((range) => range?.id === "opening-probe");
  const finalRange = ranges.find((range) => range?.id === "final-probe");
  const battleRanges = ranges.filter((range) => range?.acquisitionDoseEligible === true);
  const quotas = PRACTICE_WEAKNESS_BOSS_QUOTAS[binding.target.entityType];
  if (!openingRange || !finalRange || battleRanges.length !== 3 || !quotas) return base;

  const phaseMap = extractPracticeLearningPhaseOpportunities({
    profileId: options.profileId,
    contextId: options.contextId,
    contentPlan: options.contentPlan,
    normalizedTransitions: options.foundationAnalysis?.normalization?.normalizedTransitions ?? [],
    segmenter: options.segmenter,
    maxDirectTargets: options.policy?.phase?.maxDirectTargets,
  });
  const records = phaseMap.get(identity(binding.target.entityType, binding.target.entityKey)) ?? [];
  const openingRecords = records.filter((record) => inRange(record, openingRange));
  const finalRecords = records.filter((record) => inRange(record, finalRange));
  const battleRecords = records.filter((record) => battleRanges.some((range) => inRange(record, range)));
  const fullProtocolObserved = openingRecords.length === quotas["opening-probe"]
    && finalRecords.length === quotas["final-probe"]
    && battleRecords.length === quotas.battle;

  const originalAcquisition = base.observationDeltas.find((delta) => delta.kind === "acquisition"
    && delta.entityType === binding.target.entityType
    && delta.entityKey === binding.target.entityKey) ?? null;
  const retained = base.observationDeltas.filter((delta) => delta !== originalAcquisition);
  if (!originalAcquisition || !fullProtocolObserved || options.phaseContinuityComplete === false) {
    const acquisitionObservationCount = retained.filter((delta) => delta.kind === "acquisition").length;
    const transferObservationCount = retained.filter((delta) => delta.kind === "transfer").length;
    return freezeDeep({
      ...base,
      summary: {
        ...base.summary,
        acquisitionObservationCount,
        transferObservationCount,
        completePhaseObservationCount: Math.max(0, Number(base.summary.completePhaseObservationCount || 0) - Number(originalAcquisition?.observation?.phaseCoverage?.status === "complete")),
        partialPhaseObservationCount: Math.max(0, Number(base.summary.partialPhaseObservationCount || 0) - Number(originalAcquisition?.observation?.phaseCoverage?.status !== "complete")),
        skippedCount: Number(base.summary.skippedCount || 0) + Number(Boolean(originalAcquisition)),
        learningStateUpdateCount: acquisitionObservationCount + transferObservationCount,
      },
      observationDeltas: retained,
    });
  }

  const opening = phaseQuality(binding.target.entityType, openingRecords, options.policy);
  const final = phaseQuality(binding.target.entityType, finalRecords, options.policy);
  const battle = phaseQuality(binding.target.entityType, battleRecords, options.policy);
  const completeProbeQuality = finite(opening.quality) && finite(final.quality);
  const observation = freezeDeep({
    ...originalAcquisition.observation,
    opportunityCount: quotas.battle,
    doseUnits: 1,
    wholeQuality: battle.quality,
    entryQuality: opening.quality,
    exitQuality: final.quality,
    practiceGain: completeProbeQuality ? final.quality - opening.quality : null,
    qualityCoverage: battle.coverage,
    phaseCoverage: {
      status: completeProbeQuality ? "complete" : "partial",
      entryOpportunityCount: openingRecords.length,
      exitOpportunityCount: finalRecords.length,
      entryQualityCoverage: opening.coverage,
      exitQualityCoverage: final.coverage,
      reason: completeProbeQuality ? null : "quality-coverage",
    },
    metrics: { whole: battle.metrics, entry: opening.metrics, exit: final.metrics },
  });
  const adjusted = freezeDeep({ ...originalAcquisition, observation });
  const observationDeltas = [...retained, adjusted];
  const acquisitionObservationCount = observationDeltas.filter((delta) => delta.kind === "acquisition").length;
  const transferObservationCount = observationDeltas.filter((delta) => delta.kind === "transfer").length;
  return freezeDeep({
    ...base,
    summary: {
      ...base.summary,
      acquisitionObservationCount,
      transferObservationCount,
      completePhaseObservationCount: completeProbeQuality ? Math.max(1, Number(base.summary.completePhaseObservationCount || 0)) : Number(base.summary.completePhaseObservationCount || 0),
      partialPhaseObservationCount: completeProbeQuality ? Math.max(0, Number(base.summary.partialPhaseObservationCount || 0) - 1) : Math.max(1, Number(base.summary.partialPhaseObservationCount || 0)),
      learningStateUpdateCount: acquisitionObservationCount + transferObservationCount,
    },
    observationDeltas,
  });
}
