export const FLOW_MODE_ID = "flow";

export const FLOW_CATEGORIES = Object.freeze([
  "mixed",
  "everyday",
  "stories",
  "dialogue",
  "professional",
  "academic",
  "quotes",
  "numbers-symbols",
]);

export const FLOW_DIFFICULTIES = Object.freeze([
  "smooth",
  "natural",
  "advanced",
  "expert",
]);

export const FLOW_SESSION_LENGTHS = Object.freeze({
  quick: Object.freeze({ id: "quick", targetMinutes: 2 }),
  standard: Object.freeze({ id: "standard", targetMinutes: 5 }),
  long: Object.freeze({ id: "long", targetMinutes: 8 }),
});

export const FLOW_DEFAULTS = Object.freeze({
  category: "mixed",
  difficulty: "natural",
  sessionLength: "standard",
});

export function normalizeFlowOptions(options = {}) {
  const category = FLOW_CATEGORIES.includes(options.category)
    ? options.category
    : FLOW_DEFAULTS.category;
  const difficulty = FLOW_DIFFICULTIES.includes(options.difficulty)
    ? options.difficulty
    : FLOW_DEFAULTS.difficulty;
  const sessionLength = Object.hasOwn(FLOW_SESSION_LENGTHS, options.sessionLength)
    ? options.sessionLength
    : FLOW_DEFAULTS.sessionLength;

  return Object.freeze({ category, difficulty, sessionLength });
}
