const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const OUTCOME_LABELS = Object.freeze({
  "same-protocol-retest": "Later baseline retest",
  "retention-review": "Retention review",
  "cold-transfer": "Cold transfer",
  ability: "Later ability observation",
  consistency: "Later consistency observation",
  "control-frontier": "Later control-frontier observation",
});
const DELAY_LABELS = Object.freeze({ "next-day": "Next day / ≤3 days", short: "4–14 days", long: ">14 days" });
const PATTERN_LABELS = Object.freeze({
  insufficient: "Not enough evidence",
  "positive-signal": "Positive observed signal",
  "little-signal": "Little observed signal",
  "negative-signal": "Negative observed signal",
  mixed: "Mixed observed signal",
});
const DEPTH_LABELS = Object.freeze({ insufficient: "Insufficient", low: "Low", medium: "Medium", high: "High" });

function titleFor(episode) {
  return episode?.treatment?.experimentId
    ? episode.treatment.experimentId.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
    : "Practice treatment";
}

function formatTarget(episode, state) {
  const type = episode?.treatment?.targetEntityType ?? state?.targetEntityType ?? null;
  const key = episode?.treatment?.targetEntityKey ?? null;
  if (!type) return "General protocol";
  if (!key) return type;
  return `${type}: ${key}`;
}

function valueLabel(summary, unit) {
  if (!Number.isFinite(summary?.median)) return "—";
  if (unit === "quality-points") return `${summary.median >= 0 ? "+" : ""}${summary.median.toFixed(1)} quality pts`;
  if (unit === "percentage-points") return `${summary.median >= 0 ? "+" : ""}${summary.median.toFixed(1)} pp`;
  if (unit === "percent") return `${summary.median >= 0 ? "+" : ""}${summary.median.toFixed(1)}%`;
  return String(summary.median.toFixed(2));
}

function episodeMap(episodes) {
  const latest = new Map();
  for (const episode of episodes ?? []) {
    const key = episode?.treatment?.treatmentFamilyKey;
    if (!key) continue;
    const previous = latest.get(key);
    if (!previous || String(episode.updatedAt ?? episode.createdAt).localeCompare(String(previous.updatedAt ?? previous.createdAt)) > 0) latest.set(key, episode);
  }
  return latest;
}

function cardFromState(state, episode) {
  const summary = state.summary ?? {};
  return freezeDeep({
    id: state.treatmentResponseStateId,
    treatmentFamilyKey: state.treatmentFamilyKey,
    treatmentTitle: titleFor(episode),
    protocolVariant: episode?.treatment?.protocolVariant ?? null,
    targetEntityType: episode?.treatment?.targetEntityType ?? state.targetEntityType ?? null,
    targetLabel: formatTarget(episode, state),
    outcomeKey: state.outcomeKey,
    outcomeLabel: OUTCOME_LABELS[state.outcomeKey] ?? state.outcomeKey,
    delayBucket: state.delayBucket,
    delayLabel: DELAY_LABELS[state.delayBucket] ?? state.delayBucket,
    pattern: summary.responsePattern ?? "insufficient",
    patternLabel: PATTERN_LABELS[summary.responsePattern] ?? "Not enough evidence",
    evidenceDepth: summary.evidenceDepth ?? "insufficient",
    evidenceDepthLabel: DEPTH_LABELS[summary.evidenceDepth] ?? "Insufficient",
    medianLabel: valueLabel(summary, state.responseUnit),
    sampleCount: summary.count ?? 0,
    distinctDays: summary.distinctDays ?? 0,
    distinctTargets: summary.distinctTargets ?? 0,
    manualCount: summary.manualCount ?? 0,
    coachCount: summary.coachCount ?? 0,
    contaminatedEpisodeCount: summary.contaminatedEpisodeCount ?? 0,
    hybridOnly: summary.hybridOnly === true,
    practicalThreshold: summary.practicalThreshold ?? null,
    updatedAt: state.updatedAt ?? null,
  });
}

function recentEpisodeRow(episode) {
  const observed = (episode.outcomes ?? []).filter((outcome) => outcome.status === "observed").length;
  const contaminated = (episode.outcomes ?? []).filter((outcome) => outcome.status === "contaminated").length;
  const pending = (episode.outcomes ?? []).filter((outcome) => outcome.status === "pending").length;
  return freezeDeep({
    id: episode.treatmentEpisodeId,
    treatmentTitle: titleFor(episode),
    targetLabel: formatTarget(episode, null),
    assignmentKind: episode.assignmentKind ?? "manual",
    status: episode.status,
    completedAt: episode.treatment?.completedAt ?? null,
    observed,
    contaminated,
    pending,
  });
}

export function buildPracticeTreatmentResponseViewModel({ states = [], episodes = [], status = "ready", errorCode = null } = {}) {
  const latestByFamily = episodeMap(episodes);
  const cards = states
    .map((state) => cardFromState(state, latestByFamily.get(state.treatmentFamilyKey)))
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2, insufficient: 3 };
      return (rank[a.evidenceDepth] ?? 4) - (rank[b.evidenceDepth] ?? 4)
        || b.sampleCount - a.sampleCount
        || String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
  const recentEpisodes = [...episodes]
    .sort((a, b) => String(b.treatment?.completedAt ?? b.updatedAt ?? b.createdAt).localeCompare(String(a.treatment?.completedAt ?? a.updatedAt ?? a.createdAt)))
    .slice(0, 12)
    .map(recentEpisodeRow);
  const trackingCount = episodes.filter((episode) => episode.status === "tracking").length;
  return freezeDeep({
    kind: "treatment-response-progress",
    title: "Progress",
    sectionTitle: "Treatment Response",
    status,
    errorCode,
    cards,
    recentEpisodes,
    trackingCount,
    hasEvidence: cards.some((card) => card.sampleCount > 0),
    doctrine: "Treatment Response summarizes associations in your recorded Practice history. It does not prove that a treatment caused a later change, and practice outside WordStrike is not observed.",
    emptyTitle: "No delayed response evidence yet",
    emptyDescription: trackingCount > 0
      ? "One or more completed treatments are waiting for a compatible later observation. Same-session Check results are intentionally not counted here."
      : "Complete eligible Practice treatments and later compatible measurements to build response evidence over time.",
    backLabel: "Back to Practice Lab",
  });
}
