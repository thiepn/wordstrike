import { ARCADE_RUSH_SCORE_COMPONENT_FIELDS } from "./arcadeRushContract.js";

function validPoints(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function createEmptyArcadeRushScoreBreakdown() {
  return Object.freeze(Object.fromEntries(
    ARCADE_RUSH_SCORE_COMPONENT_FIELDS.map((field) => [field, 0]),
  ));
}

export function normalizeArcadeRushScoreBreakdown(value = {}) {
  const normalized = {};
  for (const field of ARCADE_RUSH_SCORE_COMPONENT_FIELDS) {
    const points = value[field] ?? 0;
    if (!validPoints(points)) return null;
    normalized[field] = points;
  }
  return Object.freeze(normalized);
}

export function sumArcadeRushScoreComponents(value = {}) {
  const normalized = normalizeArcadeRushScoreBreakdown(value);
  if (!normalized) return null;
  const total = Object.values(normalized).reduce((sum, points) => sum + points, 0);
  return Number.isSafeInteger(total) ? total : null;
}
