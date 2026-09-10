import { hashPracticeContent } from "./practiceIds.js";
import { PRACTICE_PACE_LADDER_FORM_SET_ID, PRACTICE_PACE_LADDER_FORM_SET_VERSION } from "./practicePaceLadderConstants.js";

const DEFAULT_URL = "./data/practice/pace-ladder/en-v1/WS-PACE-EN-1.forms.json";
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
function hash32(text) { let hash = 0x811c9dc5; for (const ch of String(text)) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; } return hash >>> 0; }

export async function loadPracticePaceLadderForms({ fetchImpl = globalThis.fetch, url = DEFAULT_URL } = {}) {
  if (typeof fetchImpl !== "function") throw Object.assign(new Error("Pace Ladder forms cannot be loaded"), { code: "PACE_LADDER_CONTENT_UNAVAILABLE" });
  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response?.ok) throw Object.assign(new Error("Pace Ladder forms are unavailable"), { code: "PACE_LADDER_CONTENT_UNAVAILABLE" });
  const artifact = await response.json();
  if (artifact?.status !== "ready" || artifact.formSetId !== PRACTICE_PACE_LADDER_FORM_SET_ID || artifact.formSetVersion !== PRACTICE_PACE_LADDER_FORM_SET_VERSION || !Array.isArray(artifact.forms) || artifact.forms.length < 3) throw Object.assign(new Error("Pace Ladder form set is not ready"), { code: "PACE_LADDER_CONTENT_UNAVAILABLE" });
  return freezeDeep({ ...artifact, forms: [...artifact.forms].sort((a, b) => a.formId.localeCompare(b.formId)) });
}

export function selectPracticePaceLadderForm({ artifact, profileId, contextId, runOrdinal = 0 } = {}) {
  if (!artifact?.forms?.length || !profileId || !contextId || !Number.isInteger(runOrdinal) || runOrdinal < 0) throw new TypeError("Pace Ladder form selection requires immutable identity inputs");
  const index = hash32(`${profileId}|${contextId}|${runOrdinal}`) % artifact.forms.length;
  const form = artifact.forms[index];
  return freezeDeep({
    formSetId: artifact.formSetId,
    formSetVersion: artifact.formSetVersion,
    formId: form.formId,
    formFamilyId: form.familyIds?.[0] ?? `pace-family-${index + 1}`,
    formOrdinal: index + 1,
    text: form.text,
    formHash: hashPracticeContent(form.text),
    typability: form.typability ?? null,
    partition: "diagnostic",
  });
}
