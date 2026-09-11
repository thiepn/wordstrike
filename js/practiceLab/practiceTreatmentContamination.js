import { PRACTICE_TREATMENT_CONTAMINATION_POLICY_VERSION } from "./practiceTreatmentConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function unique(values) { return [...new Set(values.filter(Boolean))]; }

export function classifyPracticeTreatmentContamination({ episode, interveningTreatmentEpisodes = [], interveningSessions = [], outcomeKey = null, auditedAt = new Date().toISOString() } = {}) {
  if (!episode) return freezeDeep({ policyVersion: PRACTICE_TREATMENT_CONTAMINATION_POLICY_VERSION, level: "uncertain", reasons: ["episode-missing"], auditedAt });
  const reasons = [];
  let level = "none";
  const raise = (next, reason) => {
    const rank = { none: 0, background: 1, uncertain: 2, material: 3 };
    if (rank[next] > rank[level]) level = next;
    reasons.push(reason);
  };

  for (const session of interveningSessions) {
    if (session?.experimentId === "custom-text") raise("uncertain", "custom-text-overlap-unknown");
    else if (session?.sessionId !== episode.treatment?.treatmentSessionId) raise("background", "other-recorded-practice");
  }

  const targeted = episode.treatment?.treatmentClass === "targeted";
  const directStatId = episode.treatment?.targetStatId ?? null;
  const related = new Set(episode.treatmentContext?.relatedTargetIds ?? []);
  for (const later of interveningTreatmentEpisodes) {
    if (!later || later.treatmentEpisodeId === episode.treatmentEpisodeId || !later.treatment?.exposureStartedAt) continue;
    if (targeted) {
      const laterTarget = later.treatment?.targetStatId ?? null;
      if (laterTarget && laterTarget === directStatId) raise("material", "same-target-practiced-again");
      else if (laterTarget && related.has(laterTarget)) raise("material", "related-explanatory-target-practiced");
      else raise("background", "unrelated-target-practice");
    } else if (later.treatment?.outcomeDomain === episode.treatment?.outcomeDomain) {
      raise("material", later.status === "invalid" ? "same-outcome-domain-incomplete-treatment" : "same-outcome-domain-treatment");
    } else {
      raise("background", later.status === "invalid" ? "different-domain-incomplete-treatment" : "different-outcome-domain-practice");
    }
  }

  if (targeted && outcomeKey === "cold-transfer") {
    for (const session of interveningSessions) {
      const targetIds = session?.targetStatIds ?? [];
      if (session?.experimentId === "retention-review" && targetIds.includes(directStatId)) raise("material", "same-target-retention-review-before-transfer");
    }
  }

  return freezeDeep({
    policyVersion: PRACTICE_TREATMENT_CONTAMINATION_POLICY_VERSION,
    level,
    reasons: unique(reasons),
    auditedAt,
    caveat: level === "none" ? "No relevant intervening WordStrike Practice exposure was recorded; outside practice remains unobserved." : null,
  });
}
