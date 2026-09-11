export function comparePracticeTreatmentResponseProfiles(a, b) {
  if (!a || !b) return "insufficient";
  if (a.contextId !== b.contextId
    || a.targetEntityType !== b.targetEntityType
    || a.outcomeKey !== b.outcomeKey
    || a.delayBucket !== b.delayBucket
    || a.responseModelVersion !== b.responseModelVersion
    || a.responseUnit !== b.responseUnit) return "insufficient";
  const aSummary = a.summary ?? {}; const bSummary = b.summary ?? {};
  if ((aSummary.count ?? 0) < 5 || (bSummary.count ?? 0) < 5) return "insufficient";
  if (a.targetEntityType && ((aSummary.distinctTargets ?? 0) < 2 || (bSummary.distinctTargets ?? 0) < 2)) return "insufficient";
  if (!Number.isFinite(aSummary.median) || !Number.isFinite(bSummary.median)) return "insufficient";
  const threshold = Math.max(aSummary.practicalThreshold ?? 0, bSummary.practicalThreshold ?? 0);
  const difference = aSummary.median - bSummary.median;
  if (Math.abs(difference) < threshold) return "similar-observed";
  if (["mixed", "insufficient"].includes(aSummary.responsePattern) || ["mixed", "insufficient"].includes(bSummary.responsePattern)) return "mixed";
  return difference > 0 ? "A-higher-observed" : "B-higher-observed";
}
