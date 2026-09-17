import { FLOW_CATEGORIES, FLOW_DIFFICULTIES, FLOW_SESSION_LENGTHS } from "./flowConfig.js";
import { FLOW_PASSAGE_CATALOG } from "./flowCatalog.js";
import { FLOW_LONGFORM_SERIES } from "./flowLongformContent.js";
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
  Object.freeze({ id: "precision", title: "Precision", description: "Normal punctuation, apostrophes, and exact character control.", preferredTags: Object.freeze(["apostrophes", "commas", "periods"]) }),
  Object.freeze({ id: "complexity", title: "Complexity", description: "Longer structures, denser punctuation, and harder transitions.", preferredTags: Object.freeze(["semicolons", "parentheses", "long-sentences"]) }),
  Object.freeze({ id: "pressure", title: "Pressure", description: "Numbers, symbols, and mixed punctuation raise precision demands.", preferredTags: Object.freeze(["numbers", "symbols", "mixed-punctuation"]) }),
  Object.freeze({ id: "final-flow", title: "Final Flow", description: "A sustained closing section at the run's highest complexity.", preferredTags: Object.freeze([]) }),
]);

const RUN_PROFILES = Object.freeze({
  quick: Object.freeze({ chapterIndexes: Object.freeze([0]) }),
  standard: Object.freeze({ chapterIndexes: Object.freeze([0, 1, 5]) }),
  long: Object.freeze({ chapterIndexes: Object.freeze([0, 1, 2, 3, 5]) }),
});

const SPRINT_CHAPTER_INDEXES = Object.freeze({
  quick: Object.freeze([0]),
  standard: Object.freeze([0, 5]),
  long: Object.freeze([0, 2, 5]),
});

const LONGFORM_SECTION_COUNTS = Object.freeze({ quick: 1, standard: 3, long: 5 });

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

function quoteCount(passage) {
  if (Number.isFinite(passage?.punctuation?.quotes)) return passage.punctuation.quotes;
  return (String(passage?.text || "").match(/"/g) || []).length;
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

  const quotesRequested = category === "dialogue"
    || category === "quotes"
    || modifierBiases.dialogue
    || adaptiveWeakness?.key === "quotes";
  if (!quotesRequested) {
    score -= quoteCount(passage) * 95;
    if (category === "mixed" && ["dialogue", "quotes"].includes(passage.category)) score -= 260;
  }

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
        title: passage.title || null,
        adaptiveFocus: passage.adaptiveFocus || null,
      }));
      cursor = endIndex + 1;
    }
  }
  return Object.freeze(segments);
}

function createDefaultLongformPlan({ safeLength, seed }) {
  const sectionCount = LONGFORM_SECTION_COUNTS[safeLength];
  const series = FLOW_LONGFORM_SERIES[hashSeed(`${seed}:${safeLength}:longform`) % FLOW_LONGFORM_SERIES.length];
  const passages = Object.freeze(series.sections.slice(0, sectionCount));
  const chapters = Object.freeze([
    Object.freeze({
      index: 0,
      templateIndex: 0,
      id: `longform-${series.id}`,
      title: series.title,
      description: `${sectionCount} connected section${sectionCount === 1 ? "" : "s"} from one continuous story.`,
      difficulty: "natural",
      passages,
      wordCount: passages.reduce((sum, passage) => sum + passage.wordCount, 0),
    }),
  ]);
  const segments = createSegments(chapters);
  const fullText = segments.map(({ text }) => text).join("");
  const cadenceExcludedAfterIndexes = Object.freeze(segments.slice(0, -1).map(({ endIndex }) => endIndex));

  return Object.freeze({
    id: `flow-${safeLength}-longform-${hashSeed(`${seed}:${series.id}`).toString(16)}`,
    seed: String(seed),
    category: "mixed",
    difficulty: "natural",
    sessionLength: safeLength,
    modifiers: Object.freeze([]),
    targetMinutes: FLOW_SESSION_LENGTHS[safeLength]?.targetMinutes ?? 5,
    chapterCount: 1,
    passageCount: segments.length,
    repeatedPassageCount: 0,
    wordCount: chapters[0].wordCount,
    coherent: true,
    continuous: true,
    seriesId: series.id,
    seriesTitle: series.title,
    adaptive: Object.freeze({
      enabled: false,
      targetedPassageCount: 0,
      normalPassageCount: segments.length,
      targetRatio: 0,
      weaknesses: Object.freeze([]),
    }),
    chapters,
    segments,
    fullText,
    cadenceExcludedAfterIndexes,
  });
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

  const defaultLongform = catalog === FLOW_PASSAGE_CATALOG
    && safeCategory === "mixed"
    && safeDifficulty === "natural"
    && modifierIds.length === 0
    && normalizedAdaptive.weaknesses.length === 0;
  if (defaultLongform) return createDefaultLongformPlan({ safeLength, seed });

  const profile = RUN_PROFILES[safeLength];
  const chapterIndexes = modifierBiases.sprint ? SPRINT_CHAPTER_INDEXES[safeLength] : profile.chapterIndexes;
  const totalPassages = chapterIndexes.length;
  const adaptiveSchedule = createAdaptiveFocusSchedule(totalPassages, normalizedAdaptive);
  const adaptiveBySlot = new Map(adaptiveSchedule.map(({ slot, weakness }) => [slot, weakness]));
  const usage = new Map();
  let previousId = null;
  let slot = 0;

  const chapters = chapterIndexes.map((templateIndex, runChapterIndex) => {
    const template = FLOW_CHAPTER_TEMPLATES[templateIndex];
    const targetDifficulty = chapterDifficulty(safeDifficulty, templateIndex);
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
    usage.set(selected.id, (usage.get(selected.id) || 0) + 1);
    previousId = selected.id;
    slot += 1;

    return Object.freeze({
      index: runChapterIndex,
      templateIndex,
      id: template.id,
      title: template.title,
      description: template.description,
      difficulty: targetDifficulty,
      passages: Object.freeze([plannedPassage]),
      wordCount: plannedPassage.wordCount,
    });
  });

  const segments = createSegments(chapters);
  const fullText = segments.map(({ text }) => text).join("");
  const cadenceExcludedAfterIndexes = Object.freeze(segments.slice(0, -1).map(({ endIndex }) => endIndex));
  const uniqueIds = new Set(segments.map(({ passageId }) => passageId));
  const baseMinutes = FLOW_SESSION_LENGTHS[safeLength]?.targetMinutes ?? 5;
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
    coherent: false,
    continuous: false,
    seriesId: null,
    seriesTitle: null,
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
