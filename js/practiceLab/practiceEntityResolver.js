import { createSkillStatId } from "./practiceIds.js";
import { analyzePracticeText, normalizePracticeTarget } from "./practiceTextAnalysis.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const identity = (type, key) => `${type}\u0000${key}`;

export function createPracticeEntityResolver({
  contentPlan,
  profileId,
  contextId,
  language = null,
  segmenter = null,
  allowWordEntities = true,
} = {}) {
  if (!contentPlan || typeof contentPlan.text !== "string") throw new TypeError("Practice entity resolver requires a content plan");
  const resolvedLanguage = language ?? contentPlan.metadata?.language ?? "en";
  const analysis = analyzePracticeText({ text: contentPlan.text, language: resolvedLanguage, segmenter });
  const wordByPosition = Array(analysis.graphemeCount).fill(null);
  for (const word of analysis.words) {
    for (let p = word.startIndex; p < word.endIndex; p += 1) wordByPosition[p] = word;
  }
  const directTargetKeys = new Set();
  const directTargetsByType = { key: 0, bigram: 0, trigram: 0, word: 0 };
  for (const target of contentPlan.targetEntities ?? []) {
    if (!["key", "bigram", "trigram", "word"].includes(target?.entityType)) continue;
    if (target.entityType === "word" && !allowWordEntities) continue;
    let key;
    try { key = normalizePracticeTarget({ entityType: target.entityType, entityKey: target.entityKey, language: resolvedLanguage, segmenter }); }
    catch { continue; }
    const id = identity(target.entityType, key);
    if (!directTargetKeys.has(id)) directTargetsByType[target.entityType] += 1;
    directTargetKeys.add(id);
  }

  const entity = (entityType, entityKey) => freezeDeep({
    entityType,
    entityKey,
    statId: createSkillStatId(profileId, contextId, entityType, entityKey),
    directTarget: directTargetKeys.has(identity(entityType, entityKey)),
  });

  const resolveAtPosition = (position) => {
    if (!Number.isInteger(position) || position < 0 || position >= analysis.graphemes.length) return freezeDeep([]);
    const entities = [entity("key", analysis.graphemes[position])];
    if (position >= 1) entities.push(entity("bigram", analysis.graphemes.slice(position - 1, position + 1).join("")));
    if (position >= 2) entities.push(entity("trigram", analysis.graphemes.slice(position - 2, position + 1).join("")));
    const word = wordByPosition[position];
    if (allowWordEntities && word?.lexicalKey) entities.push(entity("word", word.lexicalKey));
    return freezeDeep(entities);
  };

  return Object.freeze({
    analysis,
    directTargetKeys,
    directTargetsByType: freezeDeep(directTargetsByType),
    resolveAtPosition,
    resolveWordAtPosition(position) {
      const word = Number.isInteger(position) ? wordByPosition[position] : null;
      return word ? freezeDeep({ ...word }) : null;
    },
    isDirectTarget(entityType, entityKey) {
      return directTargetKeys.has(identity(entityType, entityKey));
    },
  });
}
