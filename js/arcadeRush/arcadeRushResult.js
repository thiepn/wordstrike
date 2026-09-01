import {
  ARCADE_RUSH_MODE_DATA_FIELDS,
  ARCADE_RUSH_MODE_ID,
  ARCADE_RUSH_REQUIRED_RESULT_FIELDS,
} from "./arcadeRushContract.js";

function own(value, field) {
  return Boolean(value && Object.hasOwn(value, field));
}

export function getMissingArcadeRushResultFields(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return Object.freeze([...ARCADE_RUSH_REQUIRED_RESULT_FIELDS]);
  }
  return Object.freeze(ARCADE_RUSH_REQUIRED_RESULT_FIELDS.filter((field) => !own(result, field)));
}

export function getMissingArcadeRushModeDataFields(modeData) {
  if (!modeData || typeof modeData !== "object" || Array.isArray(modeData)) {
    return Object.freeze([...ARCADE_RUSH_MODE_DATA_FIELDS]);
  }
  return Object.freeze(ARCADE_RUSH_MODE_DATA_FIELDS.filter((field) => !own(modeData, field)));
}

export function isArcadeRushResultContract(result) {
  return Boolean(
    result &&
    result.modeId === ARCADE_RUSH_MODE_ID &&
    getMissingArcadeRushResultFields(result).length === 0 &&
    getMissingArcadeRushModeDataFields(result.modeData).length === 0,
  );
}
