import {
  PRACTICE_ASSESSMENT_BLOCKS,
  PRACTICE_ASSESSMENT_BLUEPRINT_VERSION,
  PRACTICE_ASSESSMENT_DIAGNOSTIC_FORM_VERSION,
  PRACTICE_ASSESSMENT_DIAGNOSTIC_MATCH_POLICY,
  PRACTICE_ASSESSMENT_LIMITS,
  getPracticeAssessmentMinimumFormGraphemes,
} from "./practiceAssessmentConstants.js";
import { hashPracticeContent } from "./practiceIds.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clone = (value) => JSON.parse(JSON.stringify(value));

export function validatePracticeAssessmentDiagnosticArtifact(artifact) {
  const errors = [];
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return { valid: false, errors: [{ path: "artifact", code: "TYPE" }] };
  if (artifact.blueprintVersion !== PRACTICE_ASSESSMENT_BLUEPRINT_VERSION) errors.push({ path: "blueprintVersion", code: "VERSION" });
  if (artifact.formVersion !== PRACTICE_ASSESSMENT_DIAGNOSTIC_FORM_VERSION) errors.push({ path: "formVersion", code: "VERSION" });
  if (artifact.matchPolicyVersion !== PRACTICE_ASSESSMENT_DIAGNOSTIC_MATCH_POLICY.version) errors.push({ path: "matchPolicyVersion", code: "VERSION" });
  if (artifact.partition !== "diagnostic") errors.push({ path: "partition", code: "PARTITION" });
  if (typeof artifact.language !== "string" || !artifact.language) errors.push({ path: "language", code: "REQUIRED" });
  if (!["draft", "ready"].includes(artifact.status)) errors.push({ path: "status", code: "ENUM" });
  if (!Array.isArray(artifact.formSets)) errors.push({ path: "formSets", code: "TYPE" });
  const ids = new Set();
  for (const [setIndex, set] of (artifact.formSets ?? []).entries()) {
    const block = PRACTICE_ASSESSMENT_BLOCKS.find((entry) => entry.blockId === set.blockId && entry.blockKind === "diagnostic");
    if (!block) errors.push({ path: `formSets.${setIndex}.blockId`, code: "UNKNOWN_BLOCK" });
    if (!["draft", "ready"].includes(set.status)) errors.push({ path: `formSets.${setIndex}.status`, code: "ENUM" });
    if (!Array.isArray(set.forms)) errors.push({ path: `formSets.${setIndex}.forms`, code: "TYPE" });
    for (const [formIndex, form] of (set.forms ?? []).entries()) {
      if (typeof form.formId !== "string" || !form.formId) errors.push({ path: `formSets.${setIndex}.forms.${formIndex}.formId`, code: "REQUIRED" });
      else if (ids.has(form.formId)) errors.push({ path: `formSets.${setIndex}.forms.${formIndex}.formId`, code: "DUPLICATE" });
      else ids.add(form.formId);
      if (form.partition !== "diagnostic") errors.push({ path: `formSets.${setIndex}.forms.${formIndex}.partition`, code: "PARTITION" });
      if (block && Number(form.graphemeCount) < getPracticeAssessmentMinimumFormGraphemes(block.durationMs)) errors.push({ path: `formSets.${setIndex}.forms.${formIndex}.graphemeCount`, code: "CAPACITY" });
      if (typeof form.contentHash !== "string" || !form.contentHash.startsWith("sha256-")) errors.push({ path: `formSets.${setIndex}.forms.${formIndex}.contentHash`, code: "HASH" });
      if (Object.hasOwn(form, "text")) errors.push({ path: `formSets.${setIndex}.forms.${formIndex}.text`, code: "RAW_CONTENT_FORBIDDEN" });
    }
    if (set.status === "ready" && (set.forms?.length ?? 0) < PRACTICE_ASSESSMENT_LIMITS.minimumReadyDiagnosticVariantsPerBlock) errors.push({ path: `formSets.${setIndex}.forms`, code: "INSUFFICIENT_VARIANTS" });
  }
  if (artifact.status === "ready" && errors.length === 0 && (artifact.formSets ?? []).some((set) => set.status !== "ready")) errors.push({ path: "status", code: "INCONSISTENT_READY" });
  return { valid: errors.length === 0, errors };
}

export function createPracticeAssessmentDiagnosticRegistry({ artifacts = [] } = {}) {
  const byLanguage = new Map();
  const registerArtifact = (input) => {
    const validation = validatePracticeAssessmentDiagnosticArtifact(input);
    if (!validation.valid) {
      const error = new TypeError("Practice assessment diagnostic artifact failed validation");
      error.code = "PRACTICE_ASSESSMENT_DIAGNOSTIC_INVALID";
      error.details = validation.errors;
      throw error;
    }
    const artifact = freezeDeep(clone(input));
    if (byLanguage.has(artifact.language)) throw new TypeError(`Duplicate Practice assessment diagnostic language: ${artifact.language}`);
    byLanguage.set(artifact.language, artifact);
    return artifact;
  };
  artifacts.forEach(registerArtifact);
  return Object.freeze({
    registerArtifact,
    getArtifact(language) { return byLanguage.get(language) ?? null; },
    getFormSet(language, blockId) { return byLanguage.get(language)?.formSets?.find((set) => set.blockId === blockId) ?? null; },
    isBlockReady(language, blockId) { return this.getFormSet(language, blockId)?.status === "ready"; },
    selectForm({ language, blockId, exposureCounts = {}, profileId = "" }) {
      const set = this.getFormSet(language, blockId);
      if (!set || set.status !== "ready") return null;
      const candidates = [...set.forms].sort((a, b) => {
        const delta = Number(exposureCounts[a.formId] ?? 0) - Number(exposureCounts[b.formId] ?? 0);
        if (delta) return delta;
        const ah = hashPracticeContent(`${profileId}|${blockId}|${a.formId}`);
        const bh = hashPracticeContent(`${profileId}|${blockId}|${b.formId}`);
        return ah.localeCompare(bh) || a.formId.localeCompare(b.formId);
      });
      return candidates[0] ?? null;
    },
    listArtifacts() { return [...byLanguage.values()].sort((a, b) => a.language.localeCompare(b.language)); },
  });
}
