import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRACTICE_CORPUS_PARTITIONS } from '../js/practiceLab/practiceCorpusConstants.js';
import { PRACTICE_INDEX_SHARD_POLICY } from '../js/practiceLab/practiceIndexConstants.js';
import { derivePracticeIndexShardId } from '../js/practiceLab/practiceIndexSharding.js';
import { buildPracticeIndexesFromCorpus } from './lib/practiceIndexBuildCore.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const practiceRoot = path.join(root, 'data/practice');
const manifestsRoot = path.join(practiceRoot, 'manifests');
const hashText = (value) => `sha256-${createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

const names = (await readdir(manifestsRoot)).filter((name) => name.endsWith('.manifest.json')).sort();
for (const manifestName of names) {
  const corpusManifest = JSON.parse(await readFile(path.join(manifestsRoot, manifestName), 'utf8'));
  const stem = `${corpusManifest.language}-v${corpusManifest.corpusVersion}`;
  const partitionArtifacts = {};
  for (const partition of PRACTICE_CORPUS_PARTITIONS) {
    partitionArtifacts[partition] = JSON.parse(await readFile(path.join(practiceRoot, partition, `${stem}.json`), 'utf8'));
  }
  const build = buildPracticeIndexesFromCorpus({ corpusManifest, partitionArtifacts, hashText });
  for (const partition of PRACTICE_CORPUS_PARTITIONS) {
    const annotations = build.assembledByPartition[partition].annotations;
    const ranked = annotations.map((record) => ({ contentId: record.contentId, bytes: bytes(record), graphemeCount: record.graphemeCount }))
      .sort((a, b) => b.bytes - a.bytes || a.contentId.localeCompare(b.contentId));
    console.log(`GC3 PL7 capacity ${partition}: annotations=${annotations.length} maxSingle=${ranked[0]?.bytes ?? 0} content=${ranked[0]?.contentId ?? 'none'} graphemes=${ranked[0]?.graphemeCount ?? 0}`);
    console.log(`  topSingles=${ranked.slice(0, 5).map((entry) => `${entry.contentId}:${entry.bytes}`).join(', ')}`);
    for (const shardCount of [16, 32, 64, 128]) {
      const policy = { ...PRACTICE_INDEX_SHARD_POLICY, shardCount };
      const buckets = new Map();
      for (const record of annotations) {
        const shardId = derivePracticeIndexShardId({ indexType: 'annotations', entityType: 'content', entityKey: record.contentId, policy });
        const current = buckets.get(shardId) ?? { records: [], approximateBytes: 256 };
        current.records.push(record.contentId);
        current.approximateBytes += bytes(record) + 2;
        buckets.set(shardId, current);
      }
      const max = [...buckets.entries()].map(([shardId, value]) => ({ shardId, ...value }))
        .sort((a, b) => b.approximateBytes - a.approximateBytes || a.shardId - b.shardId)[0];
      console.log(`  shards=${shardCount} maxApprox=${max?.approximateBytes ?? 0} bucket=${max?.shardId ?? 'none'} records=${max?.records.join('|') ?? ''}`);
    }
  }
}
