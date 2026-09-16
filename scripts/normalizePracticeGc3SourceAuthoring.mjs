import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { derivePracticeIndexShardId } from '../js/practiceLab/practiceIndexSharding.js';
const loads = new Map();
function boundedItems(family) {
  const partition = family.partition;
  if (!loads.has(partition)) loads.set(partition, Array(16).fill(0));
  const weights = loads.get(partition);
  return family.items.flatMap(item => {
    const chunks = []; let remaining = item.text;
    while (partition === 'diagnostic' && remaining.length > 650) {
      const cut = remaining.lastIndexOf(' ', 650);
      chunks.push(remaining.slice(0, cut)); remaining = remaining.slice(cut + 1);
    }
    if (chunks.length && remaining.length < 300) chunks[chunks.length - 1] += " " + remaining; else chunks.push(remaining);
    return chunks.map((text, ordinal) => {
      const wanted = weights.indexOf(Math.min(...weights));
      let salt = 0, contentId;
      do { contentId = `${item.contentId}_s${String(ordinal).padStart(3, '0')}_${salt++}`; }
      while (derivePracticeIndexShardId({indexType:'annotations', entityType:'content', entityKey:contentId}) !== wanted);
      weights[wanted] += text.length;
      return {...item, text, contentId, tags:[...(item.tags || []), `segment:${ordinal}`]};
    });
  });
}
const root = fileURLToPath(new URL('../', import.meta.url));
const authoringRoot = path.join(root, 'data/practice/authoring');
const canonical = JSON.parse(await readFile(path.join(authoringRoot, 'en-v1.source.json'), 'utf8'));
const files = [
  'gc3-benchmark-en-v1.source.json',
  'gc3-transfer-en-v1.source.json',
  'gc3-realtext-en-v1.source.json',
  'gc3-assessment-en-v1.source.json',
];

for (const file of files) {
  const filePath = path.join(authoringRoot, file);
  const authored = JSON.parse(await readFile(filePath, 'utf8'));
  const normalized = {
    schemaVersion: canonical.schemaVersion,
    corpusId: canonical.corpusId,
    language: canonical.language,
    corpusVersion: canonical.corpusVersion,
    partitionPolicyVersion: canonical.partitionPolicyVersion,
    status: canonical.status,
    createdAt: canonical.createdAt,
    families: authored.families.map((family) => ({
      familyId: family.familyId,
      sourceId: family.sourceId,
      partitionLock: family.partition,
      items: boundedItems(family).map((item) => ({
        contentId: item.contentId,
        contentType: 'passage',
        text: item.text,
        reviewStatus: 'approved',
        metadata: { tags: item.tags ?? [] },
      })),
    })),
  };
  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}

console.log(`GC3 authored sources normalized to canonical PL6 release ${canonical.corpusId}|${canonical.language}|${canonical.corpusVersion} created ${canonical.createdAt}`);
