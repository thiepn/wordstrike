import { hashPracticeContent } from "./practiceIds.js";
import { createPracticeContentPlan, createPracticeSegmenter } from "./practiceSessionContract.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.keys(value).sort().reduce((out, key) => { out[key] = canonical(value[key]); return out; }, {}) : value;
const stableHash = (value) => hashPracticeContent(JSON.stringify(canonical(value)));

export function selectPracticeSustainedForm({ sessionId, contextLanguage = "en", formSet, selectionVersion = 1 } = {}) {
  if (!sessionId || !formSet?.manifest?.formSetId || !formSet.forms?.length) throw new TypeError("Sustained form selection requires session and ready form set");
  const rows = formSet.forms.map((form) => ({ form, rank: hashPracticeContent(`${selectionVersion}|${sessionId}|${contextLanguage}|${formSet.manifest.formSetId}|${formSet.manifest.formSetVersion}|${form.formId}`) }));
  rows.sort((a, b) => a.rank.localeCompare(b.rank) || a.form.formId.localeCompare(b.form.formId));
  return rows[0].form;
}

export function buildPracticeSustainedPlan({ version = 1, policyVersion = 1, sessionId, profileId, contextId, language = "en", experimentId, flow, durationMs, analysisStartMs, windowMs, formSet, form, extra = {} } = {}) {
  const body = { version, policyVersion, sessionId, profileId, contextId, language, experimentId, flow, durationMs, analysisStartMs, windowMs, formSetId: formSet.manifest.formSetId, formSetVersion: formSet.manifest.formSetVersion, formId: form.formId, formHash: form.formHash, formSchemaVersion: form.formSchemaVersion, generatorVersion: form.generatorVersion, partition: form.partition, targetEntities: [], resumable: false, ...extra };
  return freezeDeep({ ...body, planHash: stableHash(body) });
}

export function buildPracticeSustainedContentPlan({ plan, form, sourceType } = {}) {
  if (!plan || !form || plan.formId !== form.formId || plan.formHash !== form.formHash) throw new TypeError("Sustained content plan requires matching plan/form");
  const segment = createPracticeSegmenter(); const graphemes = segment(form.text);
  return createPracticeContentPlan({
    contentId: `practice-content_${plan.experimentId}-${plan.flow}-${plan.planHash}`.replace(/[^a-z0-9._-]/gi, "-"),
    contentGeneratorVersion: plan.generatorVersion,
    text: form.text,
    units: [{ unitId: `${plan.experimentId}-${plan.flow}-text`, type: "paragraph", startIndex: 0, endIndex: graphemes.length, text: form.text, metadata: { formId: form.formId } }],
    targetEntities: [],
    completion: { mode: "duration", value: plan.durationMs },
    metadata: { sourceType, partition: plan.partition, language: plan.language, flow: plan.flow, formSetId: plan.formSetId, formSetVersion: plan.formSetVersion, formId: plan.formId, formHash: plan.formHash, planHash: plan.planHash, evaluationProtected: false, coldTransfer: false },
  });
}
