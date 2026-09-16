import { FLOW_CATEGORIES, FLOW_DIFFICULTIES } from "./flowConfig.js";
import { FLOW_PASSAGE_CATALOG } from "./flowCatalog.js";
import { queryFlowPassages, selectFlowPassage } from "./flowContent.js";
import { getFlowPhase1Passage } from "./flowPassages.js";

export function getFlowPassageById(id, catalog = FLOW_PASSAGE_CATALOG) {
  if (!id) return null;
  return catalog.find((passage) => passage.id === id) || null;
}

export function resolveFlowSelection(searchLike = "") {
  const params = searchLike instanceof URLSearchParams
    ? searchLike
    : new URLSearchParams(searchLike);

  const requestedId = params.get("flowPassage");
  const requestedCategory = params.get("flowCategory");
  const requestedDifficulty = params.get("flowDifficulty");
  const requestedSeed = params.get("flowSeed") || "phase2-default";
  const catalogRequested = params.get("flowCatalog") === "1"
    || requestedId != null
    || requestedCategory != null
    || requestedDifficulty != null
    || params.has("flowSeed");

  if (!catalogRequested) {
    const passage = getFlowPhase1Passage();
    return Object.freeze({
      passage,
      source: "phase1-validation",
      category: passage.category,
      difficulty: passage.difficulty,
      seed: null,
      matchCount: 1,
    });
  }

  if (requestedId) {
    const exact = getFlowPassageById(requestedId);
    if (!exact) return null;
    return Object.freeze({
      passage: exact,
      source: "catalog-id",
      category: exact.category,
      difficulty: exact.difficulty,
      seed: requestedSeed,
      matchCount: 1,
    });
  }

  const category = FLOW_CATEGORIES.includes(requestedCategory)
    ? requestedCategory
    : "mixed";
  const difficulty = FLOW_DIFFICULTIES.includes(requestedDifficulty)
    ? requestedDifficulty
    : "natural";
  const matches = queryFlowPassages(FLOW_PASSAGE_CATALOG, { category, difficulty });
  const passage = selectFlowPassage(FLOW_PASSAGE_CATALOG, { category, difficulty }, requestedSeed);
  if (!passage) return null;

  return Object.freeze({
    passage,
    source: "catalog-filter",
    category,
    difficulty,
    seed: requestedSeed,
    matchCount: matches.length,
  });
}
