const bindings = new WeakMap();
export function registerPracticePaceLadderBinding(contentPlan, binding) { if (!contentPlan || typeof contentPlan !== "object") throw new TypeError("Pace Ladder binding requires content plan"); const frozen = Object.freeze({ ...binding, experimentId: "pace-ladder", partition: "diagnostic", evidenceRole: "diagnostic" }); bindings.set(contentPlan, frozen); return frozen; }
export function getPracticeTrustedPaceLadderBinding(contentPlan) { return bindings.get(contentPlan) ?? null; }
