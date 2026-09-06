const retentionPurposeByContentPlan = new WeakMap();
const evaluationPurposeByContentPlan = new WeakMap();

export function registerPracticeTrustedRetentionPurpose(contentPlan, measurementKind) {
  if (!contentPlan || typeof contentPlan !== "object") throw new TypeError("Practice trusted purpose requires content plan object");
  if (measurementKind == null) {
    retentionPurposeByContentPlan.delete(contentPlan);
    return contentPlan;
  }
  if (measurementKind !== "entity-review") throw new TypeError("Unsupported Practice retention measurement kind");
  retentionPurposeByContentPlan.set(contentPlan, measurementKind);
  return contentPlan;
}

export function getPracticeTrustedRetentionPurpose(contentPlan) {
  return contentPlan && typeof contentPlan === "object" ? retentionPurposeByContentPlan.get(contentPlan) ?? null : null;
}

export function registerPracticeTrustedEvaluationPurpose(contentPlan, measurementKind) {
  if (!contentPlan || typeof contentPlan !== "object") throw new TypeError("Practice trusted evaluation purpose requires content plan object");
  if (measurementKind == null) {
    evaluationPurposeByContentPlan.delete(contentPlan);
    return contentPlan;
  }
  if (!["benchmark", "cold-transfer"].includes(measurementKind)) throw new TypeError("Unsupported Practice evaluation measurement kind");
  evaluationPurposeByContentPlan.set(contentPlan, measurementKind);
  return contentPlan;
}

export function getPracticeTrustedEvaluationPurpose(contentPlan) {
  return contentPlan && typeof contentPlan === "object" ? evaluationPurposeByContentPlan.get(contentPlan) ?? null : null;
}
