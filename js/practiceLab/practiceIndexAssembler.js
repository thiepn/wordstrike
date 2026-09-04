import {
  PRACTICE_INDEX_COVERAGE_POLICY,
  PRACTICE_INDEX_LIMITS,
  PRACTICE_INDEX_REVERSE_PARTITIONS,
  PRACTICE_TEXT_SEGMENTATION_VERSION,
  PRACTICE_TOKENIZATION_VERSION,
} from "./practiceIndexConstants.js";
import { derivePracticeIndexShardId } from "./practiceIndexSharding.js";
import { validatePracticeEntityKey } from "./practiceValidation.js";

const compareText = (a, b) => String(a).localeCompare(String(b), "en", { sensitivity: "variant" });

function sortedSet(values) {
  return [...values].sort(compareText);
}

function canonicalPositions(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function createTargetAccumulator(entityType, entityKey) {
  return {
    entityType,
    entityKey,
    corpusOccurrenceCount: 0,
    contents: new Map(),
    families: new Set(),
    wordKeys: new Set(),
  };
}

function addContentOccurrence(accumulator, content, startIndex) {
  let ref = accumulator.contents.get(content.contentId);
  if (!ref) {
    ref = { contentId: content.contentId, familyId: content.familyId, count: 0, positions: [] };
    accumulator.contents.set(content.contentId, ref);
  }
  ref.count += 1;
  ref.positions.push(startIndex);
  accumulator.families.add(content.familyId);
  accumulator.corpusOccurrenceCount += 1;
}

function finalizeTargetAccumulator(accumulator) {
  const contents = [...accumulator.contents.values()]
    .map((ref) => ({ ...ref, positions: canonicalPositions(ref.positions) }))
    .sort((a, b) => compareText(a.contentId, b.contentId));
  return {
    entityType: accumulator.entityType,
    entityKey: accumulator.entityKey,
    corpusOccurrenceCount: accumulator.corpusOccurrenceCount,
    contentCoverageCount: contents.length,
    familyCoverageCount: accumulator.families.size,
    wordCoverageCount: accumulator.wordKeys.size,
    wordKeys: sortedSet(accumulator.wordKeys),
    contents,
  };
}

function createWordAccumulator(lexicalKey) {
  return {
    lexicalKey,
    corpusOccurrenceCount: 0,
    surfaceForms: new Map(),
    contents: new Map(),
    families: new Set(),
  };
}

function addWordOccurrence(accumulator, content, word) {
  accumulator.corpusOccurrenceCount += 1;
  accumulator.families.add(content.familyId);
  accumulator.surfaceForms.set(word.surfaceText, (accumulator.surfaceForms.get(word.surfaceText) ?? 0) + 1);
  let ref = accumulator.contents.get(content.contentId);
  if (!ref) {
    ref = { contentId: content.contentId, familyId: content.familyId, count: 0, positions: [] };
    accumulator.contents.set(content.contentId, ref);
  }
  ref.count += 1;
  ref.positions.push(word.startIndex);
}

function finalizeWordAccumulator(accumulator) {
  const surfaceForms = [...accumulator.surfaceForms.entries()]
    .map(([surfaceText, corpusOccurrenceCount]) => ({ surfaceText, corpusOccurrenceCount }))
    .sort((a, b) => compareText(a.surfaceText, b.surfaceText));
  const contents = [...accumulator.contents.values()]
    .map((ref) => ({ ...ref, positions: canonicalPositions(ref.positions) }))
    .sort((a, b) => compareText(a.contentId, b.contentId));
  return {
    entityType: "word",
    entityKey: accumulator.lexicalKey,
    lexicalKey: accumulator.lexicalKey,
    surfaceForms,
    corpusOccurrenceCount: accumulator.corpusOccurrenceCount,
    contentCoverageCount: contents.length,
    familyCoverageCount: accumulator.families.size,
    contents,
  };
}

function annotationFrom(content, analysis, corpusId) {
  return {
    contentId: content.contentId,
    familyId: content.familyId,
    sourceId: content.sourceId,
    corpusId,
    corpusVersion: content.corpusVersion,
    partition: content.partition,
    language: content.language,
    contentHash: content.contentHash,
    segmentationVersion: PRACTICE_TEXT_SEGMENTATION_VERSION,
    tokenizationVersion: PRACTICE_TOKENIZATION_VERSION,
    graphemeCount: analysis.graphemeCount,
    wordCount: analysis.wordCount,
    words: analysis.words,
    keyOccurrences: analysis.keyOccurrences,
    bigramOccurrences: analysis.bigramOccurrences,
    trigramOccurrences: analysis.trigramOccurrences,
    structuralCounts: analysis.structuralCounts,
  };
}

function contentSummaryFrom(content, analysis) {
  return {
    contentId: content.contentId,
    familyId: content.familyId,
    sourceId: content.sourceId,
    contentType: content.contentType,
    partition: content.partition,
    language: content.language,
    contentHash: content.contentHash,
    graphemeCount: analysis.graphemeCount,
    wordCount: analysis.wordCount,
    uniqueWordCount: new Set(analysis.words.map((word) => word.lexicalKey)).size,
    uppercaseCount: analysis.structuralCounts.uppercaseCount,
    digitCount: analysis.structuralCounts.digitCount,
    punctuationCount: analysis.structuralCounts.punctuationCount,
  };
}

function targetKey(entityType, entityKey) {
  return `${entityType}\u0000${entityKey}`;
}

function addRawOccurrences({ targetMap, content, analysis, invalidTargetKeys }) {
  const wordByOrdinal = new Map(analysis.words.map((word) => [word.wordOrdinal, word]));
  for (const [entityType, occurrences] of [
    ["key", analysis.keyOccurrences],
    ["bigram", analysis.bigramOccurrences],
    ["trigram", analysis.trigramOccurrences],
  ]) {
    for (const occurrence of occurrences) {
      const eligibility = validatePracticeEntityKey(entityType, occurrence.target);
      if (!eligibility.valid) {
        invalidTargetKeys.add(targetKey(entityType, occurrence.target));
        continue;
      }
      const key = targetKey(entityType, occurrence.target);
      let accumulator = targetMap.get(key);
      if (!accumulator) {
        accumulator = createTargetAccumulator(entityType, occurrence.target);
        targetMap.set(key, accumulator);
      }
      addContentOccurrence(accumulator, content, occurrence.startIndex);
      if (occurrence.contextClass === "within-word" && occurrence.wordOrdinal != null) {
        const word = wordByOrdinal.get(occurrence.wordOrdinal);
        if (word && validatePracticeEntityKey("word", word.lexicalKey).valid) accumulator.wordKeys.add(word.lexicalKey);
      }
    }
  }
}

function coverageWarningsFor(targetEntries, partition) {
  const warnings = [];
  for (const entry of targetEntries) {
    if (entry.entityType === "key" && /\s/u.test(entry.entityKey)) continue;
    if (entry.wordCoverageCount < PRACTICE_INDEX_COVERAGE_POLICY.minimumWordCoverageForWarning
      || entry.familyCoverageCount < PRACTICE_INDEX_COVERAGE_POLICY.minimumFamilyCoverageForWarning) {
      warnings.push({
        partition,
        entityType: entry.entityType,
        entityKey: entry.entityKey,
        corpusOccurrenceCount: entry.corpusOccurrenceCount,
        contentCoverageCount: entry.contentCoverageCount,
        familyCoverageCount: entry.familyCoverageCount,
        wordCoverageCount: entry.wordCoverageCount,
      });
    }
  }
  return warnings
    .sort((a, b) => a.familyCoverageCount - b.familyCoverageCount
      || a.wordCoverageCount - b.wordCoverageCount
      || compareText(a.entityType, b.entityType)
      || compareText(a.entityKey, b.entityKey))
    .slice(0, PRACTICE_INDEX_LIMITS.coverageWarnings);
}

export function assemblePracticePartitionIndexes({ corpusId, partition, records } = {}) {
  if (typeof corpusId !== "string" || !corpusId || typeof partition !== "string" || !Array.isArray(records)) throw new TypeError("Practice index assembly requires corpusId, partition, and records");
  const sortedRecords = [...records].sort((a, b) => compareText(a.content.contentId, b.content.contentId));
  const annotations = [];
  const content = [];
  const targetMap = new Map();
  const wordMap = new Map();
  const invalidTargetKeys = new Set();
  const invalidWordKeys = new Set();
  const uniqueFamilies = new Set();
  const coverage = {
    contentItems: sortedRecords.length,
    families: 0,
    graphemes: 0,
    wordOccurrences: 0,
    uniqueLexicalWords: 0,
    uniqueKeys: new Set(),
    uniqueBigrams: new Set(),
    uniqueTrigrams: new Set(),
  };

  for (const { content: item, analysis } of sortedRecords) {
    if (item.partition !== partition) throw new TypeError(`Practice content ${item.contentId} belongs to ${item.partition}, not ${partition}`);
    uniqueFamilies.add(item.familyId);
    annotations.push(annotationFrom(item, analysis, corpusId));
    content.push(contentSummaryFrom(item, analysis));
    coverage.graphemes += analysis.graphemeCount;
    coverage.wordOccurrences += analysis.wordCount;
    analysis.words.forEach((word) => coverage.uniqueLexicalWords += 0);
    analysis.keyOccurrences.forEach((occurrence) => coverage.uniqueKeys.add(occurrence.target));
    analysis.bigramOccurrences.forEach((occurrence) => coverage.uniqueBigrams.add(occurrence.target));
    analysis.trigramOccurrences.forEach((occurrence) => coverage.uniqueTrigrams.add(occurrence.target));

    if (!PRACTICE_INDEX_REVERSE_PARTITIONS.includes(partition)) continue;
    addRawOccurrences({ targetMap, content: item, analysis, invalidTargetKeys });
    for (const word of analysis.words) {
      const eligibility = validatePracticeEntityKey("word", word.lexicalKey);
      if (!eligibility.valid) {
        invalidWordKeys.add(word.lexicalKey);
        continue;
      }
      let accumulator = wordMap.get(word.lexicalKey);
      if (!accumulator) {
        accumulator = createWordAccumulator(word.lexicalKey);
        wordMap.set(word.lexicalKey, accumulator);
      }
      addWordOccurrence(accumulator, item, word);
    }
  }

  const allLexicalWords = new Set(annotations.flatMap((annotation) => annotation.words.map((word) => word.lexicalKey)));
  coverage.families = uniqueFamilies.size;
  coverage.uniqueLexicalWords = allLexicalWords.size;
  const targetEntries = [...targetMap.values()].map(finalizeTargetAccumulator)
    .sort((a, b) => compareText(a.entityType, b.entityType) || compareText(a.entityKey, b.entityKey));
  const wordEntries = [...wordMap.values()].map(finalizeWordAccumulator).sort((a, b) => compareText(a.lexicalKey, b.lexicalKey));
  const reverseCoverage = PRACTICE_INDEX_REVERSE_PARTITIONS.includes(partition) ? {
    targetCount: targetEntries.length + wordEntries.length,
    rawTargetCount: targetEntries.length,
    wordTargetCount: wordEntries.length,
    targetsWithAtLeastThreeWords: targetEntries.filter((entry) => entry.wordCoverageCount >= 3).length,
    targetsWithAtLeastThreeFamilies: targetEntries.filter((entry) => entry.familyCoverageCount >= 3).length,
    largestTargetContentCandidateSet: targetEntries.reduce((max, entry) => Math.max(max, entry.contentCoverageCount), 0),
    largestWordContentCandidateSet: wordEntries.reduce((max, entry) => Math.max(max, entry.contentCoverageCount), 0),
  } : null;

  return {
    content,
    annotations,
    targetEntries,
    wordEntries,
    coverage: {
      contentItems: coverage.contentItems,
      families: coverage.families,
      graphemes: coverage.graphemes,
      wordOccurrences: coverage.wordOccurrences,
      uniqueLexicalWords: coverage.uniqueLexicalWords,
      uniqueKeys: coverage.uniqueKeys.size,
      uniqueBigrams: coverage.uniqueBigrams.size,
      uniqueTrigrams: coverage.uniqueTrigrams.size,
    },
    reverseCoverage,
    diagnostics: {
      invalidTargetKeyCount: invalidTargetKeys.size,
      invalidWordKeyCount: invalidWordKeys.size,
      invalidTargetKeys: sortedSet(invalidTargetKeys).slice(0, 50),
      invalidWordKeys: sortedSet(invalidWordKeys).slice(0, 50),
      coverageWarnings: coverageWarningsFor(targetEntries, partition),
    },
  };
}

export function shardPracticeIndexEntries({ entries, indexType, entryKey } = {}) {
  if (!Array.isArray(entries) || typeof entryKey !== "function") throw new TypeError("Practice shard assembly requires entries and entryKey");
  const shards = new Map();
  for (const entry of entries) {
    const { entityType, entityKey } = entryKey(entry);
    const shardId = derivePracticeIndexShardId({ indexType, entityType, entityKey });
    if (!shards.has(shardId)) shards.set(shardId, []);
    shards.get(shardId).push(entry);
  }
  for (const values of shards.values()) values.sort((a, b) => {
    const left = entryKey(a);
    const right = entryKey(b);
    return compareText(left.entityType, right.entityType) || compareText(left.entityKey, right.entityKey);
  });
  return new Map([...shards.entries()].sort(([a], [b]) => a - b));
}
