import { hashPracticeContent } from "./practiceIds.js";
import { PRACTICE_TREATMENT_REGISTRY_VERSION } from "./practiceTreatmentConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => { out[key] = canonical(value[key]); return out; }, {});
};
const durationVariant = (configuration) => Number.isFinite(configuration?.durationMs) ? `duration-${configuration.durationMs}` : null;
const wordVariant = (configuration) => Number.isFinite(configuration?.wordCount) ? `words-${configuration.wordCount}` : null;
const oneDose = () => "one-dose";
const fixed = (value) => () => value;
const metronomeDimensions = (configuration = {}) => {
  if (!Number.isFinite(configuration.durationMs) || !["audio", "visual"].includes(configuration.cueMode)) return null;
  return Object.freeze({ durationMs: configuration.durationMs, cueMode: configuration.cueMode });
};

const DEFINITIONS = Object.freeze({
  "weak-keys": Object.freeze({ title: "Weak Keys", treatmentClass: "targeted", outcomeDomain: "entity-target", variant: oneDose }),
  "combination-repair": Object.freeze({ title: "Combination Repair", treatmentClass: "targeted", outcomeDomain: "entity-target", variant: oneDose }),
  "problem-words": Object.freeze({ title: "Problem Words", treatmentClass: "targeted", outcomeDomain: "entity-target", variant: oneDose }),
  "accuracy-control": Object.freeze({ title: "Accuracy & Recovery", treatmentClass: "targeted", outcomeDomain: "entity-target", variant: oneDose }),
  "weakness-boss": Object.freeze({ title: "Weakness Boss", treatmentClass: "targeted", outcomeDomain: "entity-target", variant: fixed("one-boss-dose-v1") }),
  "real-text": Object.freeze({ title: "Real Text Practice", treatmentClass: "broad", outcomeDomain: "cold-natural-text", variant: durationVariant }),
  "common-words": Object.freeze({ title: "Common Words Practice", treatmentClass: "broad", outcomeDomain: "common-words", variant: wordVariant, requiredFlow: "practice" }),
  "consistency-trainer": Object.freeze({ title: "Consistency Trainer", treatmentClass: "hybrid", outcomeDomain: "consistency", variant: durationVariant }),
  "metronome-typing": Object.freeze({ title: "Metronome Typing", treatmentClass: "broad", outcomeDomain: "metronome-cadence", variant: durationVariant, responseDimensions: metronomeDimensions }),
  "read-ahead": Object.freeze({ title: "Read-Ahead", treatmentClass: "broad", outcomeDomain: "read-ahead", variant: durationVariant }),
  "endurance": Object.freeze({ title: "Endurance Practice", treatmentClass: "broad", outcomeDomain: "endurance", variant: durationVariant, requiredFlow: "practice" }),
  "punctuation-capitals": Object.freeze({ title: "Punctuation & Capitals Practice", treatmentClass: "broad", outcomeDomain: "punctuation", variant: durationVariant, requiredFlow: "practice" }),
  "numbers-symbols": Object.freeze({ title: "Numbers & Symbols Practice", treatmentClass: "broad", outcomeDomain: "numbers-symbols", variant: durationVariant, requiredFlow: "practice" }),
  "pace-ladder": Object.freeze({ title: "Pace Ladder", treatmentClass: "hybrid", outcomeDomain: "control-frontier", variant: fixed("ladder-v1") }),
  "burst-sprints": Object.freeze({ title: "Burst Sprints", treatmentClass: "hybrid", outcomeDomain: "burst", variant: fixed("six-sprint-v1") }),
});

export const PRACTICE_TREATMENT_EXCLUDED_EXPERIMENT_IDS = Object.freeze([
  "full-assessment", "common-words-check", "endurance-check", "punctuation-capitals-check", "numbers-symbols-check",
  "real-text-cold-transfer", "benchmark", "cold-transfer", "daily-coach-review", "retention-review", "custom-text",
  "research-target-probe",
]);

function flowOf(configuration = {}, contentPlan = null) {
  return configuration.flow ?? contentPlan?.metadata?.commonWords?.flow ?? contentPlan?.metadata?.endurance?.flow
    ?? contentPlan?.metadata?.punctuationCapitals?.flow ?? contentPlan?.metadata?.numbersSymbols?.flow ?? null;
}
function versionFingerprint(configuration = {}) {
  const versions = {};
  for (const [key, value] of Object.entries(configuration)) {
    if ((/version/i.test(key) || ["policyVersion", "generatorVersion", "guideVersion", "feedbackVersion", "estimatorVersion"].includes(key))
      && (typeof value === "string" || Number.isFinite(value))) versions[key] = value;
  }
  return canonical(versions);
}
function directTarget(contentPlan) { return (contentPlan?.targetEntities ?? []).find((target) => target?.directTarget === true) ?? (contentPlan?.targetEntities ?? [])[0] ?? null; }
export function getPracticeTreatmentDefinition(experimentId) { return DEFINITIONS[experimentId] ?? null; }
export function listPracticeTreatmentDefinitions() { return Object.entries(DEFINITIONS).map(([experimentId, value]) => freezeDeep({ experimentId, ...value, variant: undefined, responseDimensions: undefined })); }
export function resolvePracticeTreatmentIdentity({ experiment, configuration = {}, contentPlan = null, coachBinding = null, researchBinding = null } = {}) {
  const experimentId = experiment?.id ?? null;
  const definition = getPracticeTreatmentDefinition(experimentId);
  if (!definition || PRACTICE_TREATMENT_EXCLUDED_EXPERIMENT_IDS.includes(experimentId)) return null;
  if (coachBinding && researchBinding) return null;
  const flow = flowOf(configuration, contentPlan);
  if (definition.requiredFlow && flow !== definition.requiredFlow) return null;
  const protocolVariant = definition.variant(configuration, contentPlan);
  if (!protocolVariant) return null;
  const responseDimensions = definition.responseDimensions ? definition.responseDimensions(configuration, contentPlan) : null;
  if (definition.responseDimensions && !responseDimensions) return null;
  const experimentVersion = experiment?.version ?? null;
  if (!Number.isFinite(experimentVersion) && typeof experimentVersion !== "string") return null;
  const target = definition.treatmentClass === "targeted" ? directTarget(contentPlan) : null;
  const versions = versionFingerprint(configuration);
  const bossEntityType = experimentId === "weakness-boss" ? target?.entityType ?? null : null;
  if (experimentId === "weakness-boss" && !["key", "bigram", "trigram", "word"].includes(bossEntityType)) return null;
  const familyInput = canonical({ experimentId, experimentVersion, versions, flow: flow ?? "default", protocolVariant, responseDimensions, ...(experimentId === "weakness-boss" ? { targetEntityType: bossEntityType } : {}) });
  const protocolInput = canonical({ registryVersion: PRACTICE_TREATMENT_REGISTRY_VERSION, ...familyInput });
  return freezeDeep({
    registryVersion: PRACTICE_TREATMENT_REGISTRY_VERSION,
    experimentId,
    experimentVersion,
    title: definition.title,
    treatmentClass: definition.treatmentClass,
    outcomeDomain: definition.outcomeDomain,
    flow: flow ?? "default",
    protocolVariant,
    protocolFingerprint: hashPracticeContent(JSON.stringify(protocolInput)),
    treatmentFamilyKey: `${experimentId}:${hashPracticeContent(JSON.stringify(familyInput))}`,
    assignmentKind: researchBinding ? "randomized" : coachBinding ? "coach" : "manual",
    targetEntityType: target?.entityType ?? null,
    targetEntityKey: target?.entityKey ?? null,
    doseDescriptor: protocolVariant,
    responseDimensions,
    materialVersions: versions,
  });
}
export function isPracticeTreatmentSession(input = {}) { return resolvePracticeTreatmentIdentity(input) != null; }
