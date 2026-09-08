const bindings = new WeakMap();

export function registerPracticeTrustedRealTextBinding(contentPlan, binding) {
  if (!contentPlan || typeof contentPlan !== "object") throw new TypeError("Real Text binding requires content plan object");
  if (binding == null) { bindings.delete(contentPlan); return contentPlan; }
  if (binding.experimentId !== "real-text" || binding.partition !== "training" || binding.evidenceRole !== "training" || binding.targetEntities?.length !== 0 || !binding.planHash) throw new TypeError("Real Text training binding is invalid");
  bindings.set(contentPlan, Object.freeze({ ...binding, targetEntities: Object.freeze([]) }));
  return contentPlan;
}

export function getPracticeTrustedRealTextBinding(contentPlan) {
  return contentPlan && typeof contentPlan === "object" ? bindings.get(contentPlan) ?? null : null;
}
