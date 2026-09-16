import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
      items: family.items.map((item) => ({
        contentId: item.contentId,
        contentType: 'paragraph',
        text: item.text,
        reviewStatus: 'approved',
        metadata: { tags: item.tags ?? [] },
      })),
    })),
  };
  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}

console.log(`GC3 authored sources normalized to canonical PL6 release ${canonical.corpusId}|${canonical.language}|${canonical.corpusVersion} created ${canonical.createdAt}`);
