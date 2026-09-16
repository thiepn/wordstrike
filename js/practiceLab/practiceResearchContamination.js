import { PRACTICE_RESEARCH_CONTAMINATION_VERSION } from "./practiceResearchConstants.js";

const severity = Object.freeze({ none: 0, background: 1, uncertain: 2, material: 3 });

export function classifyPracticeResearchContaminationEvent(event, assignment) {
  if (!event) return "none";
  if (event.kind === "custom-text") return "uncertain";
  if (event.kind === "retention-review" && event.statId === assignment?.target?.statId) return "material";
  if (event.kind === "research-treatment" && event.statId === assignment?.target?.statId) return "material";
  if (event.kind === "direct-target-practice" && event.statId === assignment?.target?.statId) return "material";
  if (event.relation === "same-target" || event.relation === "related-frozen-lower-level") return "material";
  if (event.kind === "broad-real-text" || event.kind === "unrelated-target-practice") return "background";
  return event.level && severity[event.level] != null ? event.level : "background";
}

export function auditPracticeResearchContamination(assignment, events = []) {
  let level = "none";
  const classified = events.map((event) => {
    const classification = classifyPracticeResearchContaminationEvent(event, assignment);
    if (severity[classification] > severity[level]) level = classification;
    return Object.freeze({ kind: event.kind ?? "practice", classification, sessionId: event.sessionId ?? null, observedAt: event.observedAt ?? event.completedAtUtc ?? null });
  });
  return Object.freeze({ contaminationVersion: PRACTICE_RESEARCH_CONTAMINATION_VERSION, level, events: Object.freeze(classified.slice(0, 64)) });
}

export function isPracticeResearchPrimaryContaminationEligible(contamination) { return ["none", "background"].includes(contamination?.level ?? "none"); }
