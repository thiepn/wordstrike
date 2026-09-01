export const ARCADE_RUSH_BOSS_PORT_METHODS = Object.freeze([
  "createEncounter",
  "handleInput",
  "update",
  "getSnapshot",
  "finalize",
]);

export function isArcadeRushBossPort(value) {
  return Boolean(
    value && typeof value === "object" &&
    ARCADE_RUSH_BOSS_PORT_METHODS.every((method) => typeof value[method] === "function"),
  );
}

export function createArcadeRushBossPort(value) {
  if (!isArcadeRushBossPort(value)) return null;
  return Object.freeze(Object.fromEntries(
    ARCADE_RUSH_BOSS_PORT_METHODS.map((method) => [method, value[method]]),
  ));
}
