import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);
const replaceOnce = (source, search, replacement, label) => {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`PL11 retention patch missing anchor: ${label}`);
  if (source.indexOf(search, index + search.length) >= 0) throw new Error(`PL11 retention patch ambiguous anchor: ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + search.length);
};
const replaceRegex = (source, regex, replacement, label) => {
  const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
  const matches = [...source.matchAll(new RegExp(regex.source, flags))];
  if (matches.length !== 1) throw new Error(`PL11 retention patch expected one ${label}, found ${matches.length}`);
  return source.replace(regex, replacement);
};

{
  const file = "js/practiceLab/practiceRetention.js";
  let source = read(file);
  const replacement = [
    'function skillDeletes(records, reviewItems = []) {',
    '  const caps = { bigram: PRACTICE_LIMITS.bigramStats, trigram: PRACTICE_LIMITS.trigramStats, word: PRACTICE_LIMITS.wordStats };',
    '  const linked = new Set(reviewItems.map((record) => `${record.profileId}\\0${record.contextId}\\0${record.entityType}\\0${record.entityKey}`));',
    '  const identity = (record) => `${record.profileId}\\0${record.contextId}\\0${record.entityType}\\0${record.entityKey}`;',
    '  const deletions = [];',
    '  const compare = (a, b) => (',
    '    (a.confidenceScore || 0) - (b.confidenceScore || 0)',
    '    || (a.evidence?.observation?.targetedSessionCount || 0) - (b.evidence?.observation?.targetedSessionCount || 0)',
    '    || (a.evidence?.opportunities?.count || 0) - (b.evidence?.opportunities?.count || 0)',
    '    || time(a.lastObservedAt || a.updatedAt) - time(b.lastObservedAt || b.updatedAt)',
    '    || (a.priority || 0) - (b.priority || 0)',
    '    || String(a.statId).localeCompare(String(b.statId))',
    '  );',
    '  for (const [type, cap] of Object.entries(caps)) {',
    '    const group = records.filter((record) => record.entityType === type);',
    '    if (group.length <= cap) continue;',
    '    const candidates = group.filter((record) => !linked.has(identity(record))).sort(compare);',
    '    deletions.push(...candidates.slice(0, Math.min(candidates.length, group.length - cap)).map((record) => record.statId));',
    '  }',
    '  const patterns = records.filter((record) => ["punctuation-transition", "number-pattern", "symbol-pattern"].includes(record.entityType));',
    '  if (patterns.length > PRACTICE_LIMITS.patternStats) {',
    '    const candidates = patterns.filter((record) => !linked.has(identity(record))).sort(compare);',
    '    deletions.push(...candidates.slice(0, Math.min(candidates.length, patterns.length - PRACTICE_LIMITS.patternStats)).map((record) => record.statId));',
    '  }',
    '  return [...new Set(deletions)];',
    '}',
    '',
    'function reviewDeletes',
  ].join('\n');
  source = replaceRegex(source, /function skillDeletes\(records\) \{[\s\S]*?\n\}\n\nfunction reviewDeletes/, replacement, "retention skill delete function");
  source = replaceOnce(source, '    skillStats: skillDeletes(skillStats),', '    skillStats: skillDeletes(skillStats, reviewItems),', "retention review-linked skill call");
  write(file, source);
}

{
  const file = "js/practiceLab/practiceDefaults.js";
  let source = read(file);
  source = replaceOnce(source, '    metricsSnapshot: {},', '    metricsSnapshot: { skillEvidenceTrackerSnapshot: null },', "default checkpoint tracker null");
  write(file, source);
}

console.log("PL11 retention/default integration patch applied");
