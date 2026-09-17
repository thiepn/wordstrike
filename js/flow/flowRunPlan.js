import { FLOW_CATEGORIES, FLOW_DIFFICULTIES, FLOW_SESSION_LENGTHS } from "./flowConfig.js";
import { FLOW_PASSAGE_CATALOG } from "./flowCatalog.js";
import {
  createAdaptiveFocusSchedule,
  getAdaptivePassageFit,
  normalizeFlowWeaknessProfile,
  parseFlowWeaknessProfile,
} from "./flowAdaptive.js";
import {
  getFlowModifierContentBiases,
  normalizeFlowModifierIds,
} from "./flowModifiers.js";

const DIFFICULTY_RANK = Object.freeze({ smooth: 0, natural: 1, advanced: 2, expert: 3 });

export const FLOW_CHAPTER_TEMPLATES = Object.freeze([
  Object.freeze({ id: "settle-in", title: "Settle In", description: "Simple language and an easy opening rhythm.", preferredTags: Object.freeze(["common-words", "conversation"]) }),
  Object.freeze({ id: "momentum", title: "Momentum", description: "Longer phrasing with fewer natural stopping points.", preferredTags: Object.freeze(["commas", "narrative"]) }),
  Object.freeze({ id: "precision", title: "Precision", description: "More punctuation, dialogue, and exact character control.", preferredTags: Object.freeze(["quotes", "apostrophes", "commas"]) }),
  Object.freeze({ id: "complexity", title: "Complexity", description: "Longer structures, denser punctuation, and harder transitions.", preferredTags: Object.freeze(["semicolons", "parentheses", "long-sentences"]) }),
  Object.freeze({ id: "pressure", title: "Pressure", description: "Numbers, symbols, and mixed punctuation raise precision demands.", preferredTags: Object.freeze(["numbers", "symbols", "mixed-punctuation"]) }),
  Object.freeze({ id: "final-flow", title: "Final Flow", description: "A sustained closing section at the run's highest complexity.", preferredTags: Object.freeze([]) }),
]);

const RUN_PROFILES = Object.freeze({
  quick: Object.freeze({ chapterIndexes: Object.freeze([0, 2, 5]), passagesPerChapter: 2 }),
  standard: Object.freeze({ chapterIndexes: Object.freeze([0, 1, 2, 3, 4, 5]), passagesPerChapter: 2 }),
  long: Object.freeze({ chapterIndexes: Object.freeze([0, 1, 2, 3, 4, 5]), passagesPerChapter: 4 }),
});

const DIFFICULTY_LADDERS = Object.freeze({
  smooth: Object.freeze(["smooth", "smooth", "smooth", "smooth", "smooth", "smooth"]),
  natural: Object.freeze(["smooth", "natural", "natural", "natural", "natural", "natural"]),
  advanced: Object.freeze(["smooth", "natural", "natural", "advanced", "advanced", "advanced"]),
  expert: Object.freeze(["natural", "natural", "advanced", "advanced", "expert", "expert"]),
});

function hashSeed(value) {
  const input = String(value ?? "flow-phase5");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededJitter(seed, passageId, slot) {
  return (hashSeed(`${seed}:${slot}:${passageId}`) % 10000) / 10000;
}

function chapterDifficulty(selectedDifficulty, templateIndex) {
  return DIFFICULTY_LADDERS[selectedDifficulty]?.[templateIndex] ?? "natural";
}

function tagBonus(passage, tags, perTag) {
  let bonus = 0;
  for (const tag of tags) if (passage.tags.includes(tag)) bonus += perTag;
  return bonus;
}

function candidateScore(passage, {
  category,
  targetDifficulty,
  preferredTags,
  modifierBiases,
  adaptiveWeakness,
  usageCount,
  previousId,
  seed,
  slot,
}) {
  const targetRank = DIFFICULTY_RANK[targetDifficulty];
  const rank = DIFFICULTY_RANK[passage.difficulty];
  let score = 900 - ((targetRank - rank) * 110);
  if (category !== "mixed" && passage.category === category) score += 340;
  for (const tag of preferredTags) if (passage.tags.includes(tag)) score += 55;

  if (modifierBiases.dialogue) {
    if (passage.category === "dialogue") score += 650;
    score += tagBonus(passage, ["quotes", "apostrophes", "conversation"], 105);
  }
  if (modifierBiases.symbols) {
    if (passage.category === "numbers-symbols") score += 650;
    score += tagBonus(passage, ["numbers", "symbols", "mixed-punctuation"], 115);
  }
  if (modifierBiases.longform) {
    score += Math.min(260, (passage.wordCount || 0) * 6);
    score += tagBonus(passage, ["long-sentences", "semicolons", "parentheses"], 80);
  }

  if (adaptiveWeakness) {
    const fit = getAdaptivePassageFit(passage, adaptiveWeakness);
    score += fit > 0 ? 900 + (fit * 1.6) : -500;
  }

  score -= usageCount * 1400;
  if (passage.id === previousId) score -= 5000;
  score += seededJitter(seed, passage.id, slot);
  return score;
}

function selectPassage(catalog, context) {
  const targetRank = DIFFICULTY_RANK[context.targetDifficulty];
  const eligible = catalog.filter((passage) => DIFFICULTY_RANK[passage.difficulty] <= targetRank);
  const pool = eligible.length ? eligible : catalog;
  return [...pool].sort((left, right) => {
    const leftScore = candidateScore(left, { ...context, usageCount: context.usage.get(left.id) || 0 });
    const rightScore = candidateScore(right, { ...context, usageCount: context.usage.get(right.id) || 0 });
    return rightScore - leftScore || left.id.localeCompare(right.id);
  })[0] || null;
}

function createSegments(chapters) {
  const segments = [];
  let cursor = 0;
  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex += 1) {
    const chapter = chapters[chapterIndex];
    for (let passageIndex = 0; passageIndex < chapter.passages.length; passageIndex += 1) {
      const passage = chapter.passages[passageIndex];
      const startIndex = cursor;
      const endIndex = cursor + passage.text.length - 1;
      segments.push(Object.freeze({
        index: segments.length,
        chapterIndex,
        passageIndex,
        passageId: passage.id,
        startIndex,
        endIndex,
        text: passage.text,
        adaptiveFocus: passage.adaptiveFocus || null,
      }));
      cursor = endIndex + 1;
    }
  }
  return Object.freeze(segments);
}

export function createFlowRunPlan({
  category = "mixed",
  difficulty = "natural",
  sessionLength = "standard",
  seed = "phase5-default",
  modifiers = [],
  adaptiveProfile = null,
  catalog = FLOW_PASSAGE_CATALOG,
} = {}) {
  if (!Array.isArray(catalog) || !catalog.length) throw new TypeError("Flow run planner requires at least one passage");
  const safeCategory = FLOW_CATEGORIES.includes(category) ? category : "mixed";
  const safeDifficulty = FLOW_DIFFICULTIES.includes(difficulty) ? difficulty : "natural";
  const safeLength = Object.hasOwn(RUN_PROFILES, sessionLength) ? sessionLength : "standard";
  const modifierIds = normalizeFlowModifierIds(modifiers);
  const modifierBiases = getFlowModifierContentBiases(modifierIds);
  const normalizedAdaptive = normalizeFlowWeaknessProfile(adaptiveProfile);
  const profile = RUN_PROFILES[safeLength];
  const passagesPerChapter = modifierBiases.sprint ? 1 : profile.passagesPerChapter;
  const totalPassages = profile.chapterIndexes.length * passagesPerChapter;
  const adaptiveSchedule = createAdaptiveFocusSchedule(totalPassages, normalizedAdaptive);
  const adaptiveBySlot = new Map(adaptiveSchedule.map(({ slot, weakness }) => [slot, weakness]));
  const usage = new Map();
  let previousId = null;
  let slot = 0;

  const chapters = profile.chapterIndexes.map((templateIndex, runChapterIndex) => {
    const template = FLOW_CHAPTER_TEMPLATES[templateIndex];
    const targetDifficulty = chapterDifficulty(safeDifficulty, templateIndex);
    const passages = [];
    for (let passageIndex = 0; passageIndex < passagesPerChapter; passageIndex += 1) {
      const adaptiveWeakness = adaptiveBySlot.get(slot) || null;
      const selected = selectPassage(catalog, {
        category: safeCategory,
        targetDifficulty,
        preferredTags: template.preferredTags,
        modifierBiases,
        adaptiveWeakness,
        previousId,
        seed,
        slot,
        usage,
      });
      const plannedPassage = adaptiveWeakness
        ? Object.freeze({
            ...selected,
            adaptiveFocus: Object.freeze({
              key: adaptiveWeakness.key,
              label: adaptiveWeakness.label,
              score: adaptiveWeakness.score,
            }),
          })
        : selected;
      passages.push(plannedPassage);
      usage.set(selected.id, (usage.get(selected.id) || 0) + 1);
      previousId = selected.id;
      slot += 1;
    }
    return Object.freeze({
      index: runChapterIndex,
      templateIndex,
      id: template.id,
      title: template.title,
      description: template.description,
      difficulty: targetDifficulty,
      passages: Object.freeze(passages),
      wordCount: passages.reduce((sum, passage) => sum + passage.wordCount, 0),
    });
  });

  const segments = createSegments(chapters);
  const fullText = segments.map(({ text }) => text).join("");
  const cadenceExcludedAfterIndexes = Object.freeze(segments.slice(0, -1).map(({ endIndex }) => endIndex));
  const uniqueIds = new Set(segments.map(({ passageId }) => passageId));
  const baseMinutes = FLOW_SESSION_LENGTHS[safeLength]?.targetMinutes ?? 6;
  const targetMinutes = modifierBiases.sprint ? Math.max(1, Math.round(baseMinutes * 0.6)) : baseMinutes;
  const modifierSignature = modifierIds.length ? modifierIds.join("+") : "base";
  const adaptiveSignature = normalizedAdaptive.weaknesses.length
    ? normalizedAdaptive.weaknesses.map(({ key, score }) => `${key}:${score}`).join("+")
    : "balanced";
  const targetedPassageCount = segments.filter(({ adaptiveFocus }) => adaptiveFocus).length;

  return Object.freeze({
    id: `flow-${safeLength}-${hashSeed(`${seed}:${safeCategory}:${safeDifficulty}:${modifierSignature}:${adaptiveSignature}`).toString(16)}`,
    seed: String(seed),
    category: safeCategory,
    difficulty: safeDifficulty,
    sessionLength: safeLength,
    modifiers: modifierIds,
    targetMinutes,
    chapterCount: chapters.length,
    passageCount: segments.length,
    repeatedPassageCount: segments.length - uniqueIds.size,
    wordCount: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    adaptive: Object.freeze({
      enabled: normalizedAdaptive.weaknesses.length > 0,
      targetedPassageCount,
      normalPassageCount: segments.length - targetedPassageCount,
      targetRatio: segments.length ? Number((targetedPassageCount / segments.length).toFixed(3)) : 0,
      weaknesses: normalizedAdaptive.weaknesses,
    }),
    chapters: Object.freeze(chapters),
    segments,
    fullText,
    cadenceExcludedAfterIndexes,
  });
}

export function resolveFlowRunPlan(searchLike = "") {
  const params = searchLike instanceof URLSearchParams ? searchLike : new URLSearchParams(searchLike);
  if (params.get("flowRun") !== "1") return null;
  const category = FLOW_CATEGORIES.includes(params.get("flowCategory")) ? params.get("flowCategory") : "mixed";
  const difficulty = FLOW_DIFFICULTIES.includes(params.get("flowDifficulty")) ? params.get("flowDifficulty") : "natural";
  const sessionLength = Object.hasOwn(RUN_PROFILES, params.get("flowLength")) ? params.get("flowLength") : "standard";
  const seed = params.get("flowSeed") || "phase5-default";
  const modifiers = normalizeFlowModifierIds(params.get("flowModifierIds") || "");
  const adaptiveProfile = params.get("flowAdaptive") === "1"
    ? parseFlowWeaknessProfile(params.get("flowWeaknesses") || "")
    : null;
  return createFlowRunPlan({ category, difficulty, sessionLength, seed, modifiers, adaptiveProfile });
}
