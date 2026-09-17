import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Check families rather than individual diagnostic segments: a sentence may
// cross a segment boundary, and partition-only checks miss internal reuse.
export function findRepeatedEditorialSentences(families, minimumLength = 60) {
  const seen = new Map();
  for (const family of families) {
    const text = family.items.map(item => item.text).join(' ').normalize('NFKC').replace(/\s+/g, ' ');
    for (const sentence of text.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g) ?? []) {
      const normalized = sentence.trim().toLowerCase();
      if (normalized.length < minimumLength) continue;
      const entries = seen.get(normalized) ?? new Map();
      entries.set(family.familyId, { familyId: family.familyId, partition: family.partition });
      seen.set(normalized, entries);
    }
  }
  return [...seen].filter(([, families]) => families.size > 1)
    .map(([sentence, families]) => ({ sentence, families: [...families.values()] }));
}

export async function auditPracticeEditorialContent() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const families = [];
  for (const partition of ['training', 'transfer', 'benchmark', 'diagnostic', 'research-holdout']) {
    const corpus = JSON.parse(await readFile(path.join(root, `data/practice/${partition}/en-v1.json`), 'utf8'));
    const groups = new Map();
    for (const item of corpus.items) {
      if (!groups.has(item.familyId)) groups.set(item.familyId, { familyId: item.familyId, partition, items: [] });
      groups.get(item.familyId).items.push(item);
    }
    for (const family of groups.values()) family.items.sort((a, b) => a.contentId.localeCompare(b.contentId));
    families.push(...groups.values());
  }
  const repeated = findRepeatedEditorialSentences(families);
  if (repeated.length) throw new Error(`Editorial family independence failed: ${JSON.stringify(repeated)}`);
  return { status: 'PASS', familyCount: families.length, repeatedLongSentences: 0, minimumSentenceCharacters: 60, scope: 'within and across all five partitions' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await auditPracticeEditorialContent(), null, 2));
}
