export const ARCADE_RUSH_RUNTIME_PORTS = Object.freeze({
  clock: Object.freeze(["now"]),
  scheduler: Object.freeze(["requestFrame", "cancelFrame"]),
  renderer: Object.freeze([
    "clearWords",
    "createWord",
    "updateWord",
    "removeWord",
    "flashDamage",
  ]),
  input: Object.freeze([
    "handleKey",
    "reconcileTargeting",
    "resetTargeting",
  ]),
  world: Object.freeze([
    "createTrajectory",
    "projectTrajectory",
    "advanceTrajectory",
    "updateSeparation",
  ]),
  session: Object.freeze([
    "begin",
    "complete",
    "getCurrent",
    "markActive",
    "markResultPersisted",
    "setState",
  ]),
});

export function isArcadeRushRuntimePorts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(ARCADE_RUSH_RUNTIME_PORTS).every(([group, methods]) => (
    value[group] && typeof value[group] === "object" &&
    methods.every((method) => typeof value[group][method] === "function")
  ));
}

export function createArcadeRushRuntimePorts(value) {
  if (!isArcadeRushRuntimePorts(value)) return null;
  return Object.freeze(Object.fromEntries(
    Object.entries(ARCADE_RUSH_RUNTIME_PORTS).map(([group, methods]) => [
      group,
      Object.freeze(Object.fromEntries(methods.map((method) => [method, value[group][method]]))),
    ]),
  ));
}
