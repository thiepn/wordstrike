import {
  FLOW_CORPUS_V2_DOCUMENTS,
  FLOW_CORPUS_V2_THEMES,
  createFlowCorpusExcerpt,
  selectFlowCorpusDocuments,
} from "./flowCorpusV2.js?v=20260923a";
import { loadFlowCorpusHistory } from "./flowCorpusHistory.js?v=20260923a";

export const FLOW_V3_DEFAULT_THEME = "mixed";
export const FLOW_V3_STREAM_DOCUMENT_COUNT = 10;
export const FLOW_V3_DEFAULT_SESSION_PRESET = "standard";
export const FLOW_V3_SESSION_PRESETS = Object.freeze({
  quick: Object.freeze({ id: "quick", label: "Quick", minutes: 2, durationMs: 120_000 }),
  standard: Object.freeze({ id: "standard", label: "Flow", minutes: 3, durationMs: 180_000 }),
  deep: Object.freeze({ id: "deep", label: "Deep", minutes: 5, durationMs: 300_000 }),
  endless: Object.freeze({ id: "endless", label: "Endless", minutes: null, durationMs: null }),
});
export const FLOW_V3_THEME_IDS = Object.freeze([
  FLOW_V3_DEFAULT_THEME,
  ...FLOW_CORPUS_V2_THEMES.map((theme) => theme.id),
]);

function hashSeed(value) {
  const input = String(value ?? "flow-v3");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeFlowV3Theme(value) {
  return FLOW_V3_THEME_IDS.includes(value) ? value : FLOW_V3_DEFAULT_THEME;
}

export function normalizeFlowV3SessionPreset(value) {
  return Object.hasOwn(FLOW_V3_SESSION_PRESETS, value)
    ? value
    : FLOW_V3_DEFAULT_SESSION_PRESET;
}

function createSegments(documents) {
  const segments = [];
  let cursor = 0;
  let segmentIndex = 0;
  documents.forEach((document, documentIndex) => {
    document.passages.forEach((passage, paragraphIndex) => {
      const startIndex = cursor;
      const endIndex = startIndex + passage.text.length - 1;
      const isLast = documentIndex === documents.length - 1
        && paragraphIndex === document.passages.length - 1;
      const separatorIndex = isLast ? null : endIndex + 1;
      segments.push(Object.freeze({
        index: segmentIndex,
        chapterIndex: 0,
        passageIndex: segmentIndex,
        passageId: passage.id,
        startIndex,
        endIndex,
        separatorIndex,
        text: passage.text,
        title: passage.title || null,
        documentIndex,
        paragraphIndex,
        documentTitle: document.title,
        seriesId: document.seriesId,
        adaptiveFocus: null,
      }));
      cursor = endIndex + 1 + (separatorIndex == null ? 0 : 1);
      segmentIndex += 1;
    });
  });
  return Object.freeze(segments);
}

export function createFlowStreamPlanV3({
  seed = "flow-v3-public",
  theme = FLOW_V3_DEFAULT_THEME,
  sessionPreset = FLOW_V3_DEFAULT_SESSION_PRESET,
  history = null,
  documentCount = FLOW_V3_STREAM_DOCUMENT_COUNT,
} = {}) {
  const safeTheme = normalizeFlowV3Theme(theme);
  const safeSessionPreset = normalizeFlowV3SessionPreset(sessionPreset);
  const sessionProfile = FLOW_V3_SESSION_PRESETS[safeSessionPreset];
  const storedHistory = history || loadFlowCorpusHistory();
  const pool = safeTheme === FLOW_V3_DEFAULT_THEME
    ? FLOW_CORPUS_V2_DOCUMENTS
    : FLOW_CORPUS_V2_DOCUMENTS.filter((document) => document.theme === safeTheme);
  const requestedCount = Math.round(Number(documentCount) || FLOW_V3_STREAM_DOCUMENT_COUNT);
  const themedCount = safeTheme === FLOW_V3_DEFAULT_THEME
    ? requestedCount
    : Math.min(5, requestedCount);
  const safeCount = Math.max(1, Math.min(themedCount, pool.length));
  const sources = selectFlowCorpusDocuments({
    seed: String(seed) + ":" + safeTheme + ":stream",
    count: safeCount,
    recentDocumentIds: storedHistory.recentDocumentIds,
    targetDifficulty: "mixed",
    documents: pool,
  });

  const documents = Object.freeze(sources.map((source, documentIndex) => {
    const excerpt = createFlowCorpusExcerpt(source, {
      seed: String(seed) + ":" + safeTheme + ":full:" + documentIndex,
      paragraphCount: source.paragraphs.length,
      recentExcerptIds: storedHistory.recentExcerptIds,
    });
    return Object.freeze({
      index: documentIndex,
      documentId: source.id,
      seriesId: source.id,
      title: source.title,
      theme: source.theme,
      themeLabel: source.themeLabel,
      difficulty: source.difficulty,
      typabilityScore: source.typabilityScore,
      excerptId: excerpt.id,
      excerptStartParagraph: excerpt.startParagraph,
      passages: excerpt.passages,
      paragraphCount: excerpt.passages.length,
      wordCount: excerpt.wordCount,
    });
  }));

  const segments = createSegments(documents);
  const fullText = segments.map((segment) => (
    segment.separatorIndex == null ? segment.text : segment.text + " "
  )).join("");
  const wordCount = documents.reduce((sum, document) => sum + document.wordCount, 0);
  const ids = Object.freeze(documents.map((document) => document.documentId));
  const titles = Object.freeze(documents.map((document) => document.title));
  const excerptIds = Object.freeze(documents.map((document) => document.excerptId));
  const themes = Object.freeze([...new Set(documents.map((document) => document.theme))]);

  return Object.freeze({
    id: "flow-v3-stream-" + hashSeed(String(seed) + ":" + ids.join("+")).toString(16),
    gameplayVersion: 3,
    corpusVersion: 2,
    structure: "continuous-stream",
    seed: String(seed),
    theme: safeTheme,
    category: safeTheme,
    difficulty: "mixed",
    sessionLength: "flow",
    sessionPreset: safeSessionPreset,
    modifiers: Object.freeze([]),
    targetMinutes: sessionProfile.minutes,
    targetDurationMs: sessionProfile.durationMs,
    chapterCount: 1,
    passageCount: segments.length,
    paragraphCount: segments.length,
    documentCount: documents.length,
    repeatedPassageCount: 0,
    wordCount,
    coherent: true,
    continuous: true,
    stream: true,
    seriesId: ids[0] || null,
    seriesTitle: titles[0] || "Flow",
    seriesIds: ids,
    seriesTitles: titles,
    corpusDocumentIds: ids,
    corpusExcerptIds: excerptIds,
    corpusThemes: themes,
    recentAvoidance: Object.freeze({
      documentIdsConsidered: Object.freeze([...(storedHistory.recentDocumentIds || [])]),
      excerptIdsConsidered: Object.freeze([...(storedHistory.recentExcerptIds || [])]),
    }),
    documents,
    chapters: Object.freeze([Object.freeze({
      index: 0,
      templateIndex: 0,
      id: "flow-v3-stream",
      title: "Flow",
      description: "Continuous text stream.",
      difficulty: "mixed",
      passages: Object.freeze(documents.flatMap((document) => document.passages)),
      wordCount,
    })]),
    segments,
    fullText,
    cadenceExcludedAfterIndexes: Object.freeze([]),
  });
}

export function resolveFlowStreamPlanV3(searchLike = "") {
  const params = searchLike instanceof URLSearchParams ? searchLike : new URLSearchParams(searchLike);
  if (params.get("flowRelease") !== "1" || params.get("mode") !== "flow" || params.get("flowRun") !== "1") {
    return null;
  }
  return createFlowStreamPlanV3({
    seed: params.get("flowSeed") || "flow-v3-public",
    theme: params.get("flowTheme") || FLOW_V3_DEFAULT_THEME,
    sessionPreset: params.get("flowLength") || FLOW_V3_DEFAULT_SESSION_PRESET,
  });
}
