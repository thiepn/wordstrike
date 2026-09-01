export const ARCADE_RUSH_UI_PORT_METHODS = Object.freeze([
  "renderReady",
  "renderHud",
  "renderWaveTransition",
  "renderBossIntro",
  "renderResults",
  "clearGameplay",
]);

export function isArcadeRushUiPort(value) {
  return Boolean(
    value && typeof value === "object" &&
    ARCADE_RUSH_UI_PORT_METHODS.every((method) => typeof value[method] === "function"),
  );
}

export function createArcadeRushUiPort(value) {
  if (!isArcadeRushUiPort(value)) return null;
  return Object.freeze(Object.fromEntries(
    ARCADE_RUSH_UI_PORT_METHODS.map((method) => [method, value[method]]),
  ));
}
