export async function reconcilePracticePhysicalTelemetry({ repository, profileId } = {}) {
  if (!repository || !profileId) return Object.freeze({ pruned: false, failedMarkers: Object.freeze([]) });
  const sessions = await repository.listPhysicalTelemetrySessions?.(profileId) ?? [];
  const failedMarkers = sessions.filter((record) => record.status === "failed").map((record) => record.sessionId);
  const pruning = await repository.prunePhysicalTelemetry?.(profileId).catch(() => null);
  return Object.freeze({ pruned: Boolean(pruning), failedMarkers: Object.freeze(failedMarkers) });
}
