import {
  PRACTICE_NUMBERS_PRIMARY_CATEGORIES,
  PRACTICE_PUNCTUATION_PRIMARY_CATEGORIES,
  PRACTICE_SPECIAL_DOMAIN_ANNOTATION_VERSION,
} from "./practiceSpecialDomainConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const DOMAIN_CATEGORIES = Object.freeze({
  "punctuation-capitals": PRACTICE_PUNCTUATION_PRIMARY_CATEGORIES,
  "numbers-symbols": PRACTICE_NUMBERS_PRIMARY_CATEGORIES,
});

export function canonicalizePracticeSpecialDomainAnnotations(annotations = {}) {
  const derived = {};
  for (const key of Object.keys(annotations.derived ?? {}).sort()) {
    derived[key] = (annotations.derived[key] ?? []).map((item) => ({
      startIndex: item.startIndex,
      endIndex: item.endIndex,
      kind: item.kind,
      ...(item.tokenId == null ? {} : { tokenId: item.tokenId }),
    }));
  }
  return {
    version: annotations.version,
    formHash: annotations.formHash,
    primary: (annotations.primary ?? []).map((item) => ({
      expectedIndex: item.expectedIndex,
      domain: item.domain,
      category: item.category,
    })),
    derived,
  };
}

export function validatePracticeSpecialDomainAnnotations({ annotations, domain, graphemeCount } = {}) {
  const errors = [];
  const allowed = DOMAIN_CATEGORIES[domain] ?? [];
  if (!annotations || annotations.version !== PRACTICE_SPECIAL_DOMAIN_ANNOTATION_VERSION) errors.push("ANNOTATION_VERSION");
  if (typeof annotations?.formHash !== "string" || !annotations.formHash) errors.push("FORM_HASH");
  if (!Array.isArray(annotations?.primary)) errors.push("PRIMARY_ARRAY");
  const seen = new Set();
  for (const item of annotations?.primary ?? []) {
    if (!Number.isInteger(item.expectedIndex) || item.expectedIndex < 0 || item.expectedIndex >= graphemeCount) errors.push("PRIMARY_RANGE");
    if (item.domain !== domain || !allowed.includes(item.category)) errors.push("PRIMARY_CATEGORY");
    if (seen.has(item.expectedIndex)) errors.push("PRIMARY_DUPLICATE");
    seen.add(item.expectedIndex);
  }
  for (const [kind, values] of Object.entries(annotations?.derived ?? {})) {
    if (!Array.isArray(values)) { errors.push("DERIVED_ARRAY"); continue; }
    for (const item of values) {
      if (!Number.isInteger(item.startIndex) || !Number.isInteger(item.endIndex) || item.startIndex < 0 || item.endIndex <= item.startIndex || item.endIndex > graphemeCount) errors.push(`DERIVED_RANGE:${kind}`);
      if (item.kind !== kind) errors.push(`DERIVED_KIND:${kind}`);
    }
  }
  return freezeDeep({ valid: errors.length === 0, errors: [...new Set(errors)] });
}

export function getPracticeSpecialDomainPrimaryCounts(annotations = {}) {
  const counts = {};
  for (const item of annotations.primary ?? []) counts[item.category] = (counts[item.category] ?? 0) + 1;
  return freezeDeep(counts);
}
