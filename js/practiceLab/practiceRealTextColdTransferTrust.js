const bindings = new WeakMap();

export function registerPracticeTrustedRealTextColdTransferBinding(contentPlan, binding) {
  if (!contentPlan || typeof contentPlan !== "object") throw new TypeError("Cold Transfer trust requires content plan object");
  if (binding == null) { bindings.delete(contentPlan); return contentPlan; }
  if (binding.kind !== "cold-transfer" || !binding.poolId || !binding.unitId || !binding.reservationId || !binding.contentBindingHash || binding.sessionId == null) throw new TypeError("Cold Transfer binding is invalid");
  bindings.set(contentPlan, Object.freeze({ ...binding }));
  return contentPlan;
}

export function getPracticeTrustedRealTextColdTransferBinding(contentPlan) {
  return contentPlan && typeof contentPlan === "object" ? bindings.get(contentPlan) ?? null : null;
}
