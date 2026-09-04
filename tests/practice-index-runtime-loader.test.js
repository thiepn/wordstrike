import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createPracticeIndexLoader } from "../js/practiceLab/practiceIndexLoader.js";

const hashText = async (value) => `sha256-${createHash("sha256").update(String(value), "utf8").digest("hex")}`;

async function manifestAndTargets() {
  const manifest = JSON.parse(await readFile(new URL("../data/practice/indexes/en-v1/manifest.json", import.meta.url), "utf8"));
  const shardIds = manifest.generatedPartitions.training.targetShards;
  assert.ok(shardIds.length >= 2, "foundation corpus should exercise more than one target shard");
  const targets = [];
  for (const shardId of shardIds.slice(0, 2)) {
    const width = String(Math.max(2, String(manifest.shardCount - 1).length));
    void width;
    const name = String(shardId).padStart(2, "0");
    const artifact = JSON.parse(await readFile(new URL(`../data/practice/indexes/en-v1/training/targets/target-${name}.json`, import.meta.url), "utf8"));
    targets.push({ shardId, entry: artifact.entries[0] });
  }
  return { manifest, targets };
}

function repoFetch(counter, failFirstUrl = null) {
  let failed = false;
  return async (url) => {
    counter.count += 1;
    counter.urls.push(url);
    if (failFirstUrl && url === failFirstUrl && !failed) {
      failed = true;
      return { ok: false, status: 503, async text() { return ""; } };
    }
    try {
      const text = await readFile(new URL(`../${url}`, import.meta.url), "utf8");
      return { ok: true, status: 200, async text() { return text; } };
    } catch {
      return { ok: false, status: 404, async text() { return ""; } };
    }
  };
}

test("loader lazily fetches only the requested shard and reuses bounded cache", async () => {
  const { manifest, targets } = await manifestAndTargets();
  const counter = { count: 0, urls: [] };
  const loader = createPracticeIndexLoader({ fetchImpl: repoFetch(counter), hashText, maxCacheEntries: 4 });
  assert.equal(counter.count, 0);
  const first = await loader.loadTargetShard({ manifest, partition: "training", entityType: targets[0].entry.entityType, entityKey: targets[0].entry.entityKey });
  assert.equal(first.shardId, targets[0].shardId);
  assert.equal(counter.count, 1);
  await loader.loadTargetShard({ manifest, partition: "training", entityType: targets[0].entry.entityType, entityKey: targets[0].entry.entityKey });
  assert.equal(counter.count, 1);
  await loader.loadTargetShard({ manifest, partition: "training", entityType: targets[1].entry.entityType, entityKey: targets[1].entry.entityKey });
  assert.equal(counter.count, 2);
  assert.ok(loader.getCacheSize() <= 4);
});

test("concurrent same-shard requests deduplicate the underlying fetch", async () => {
  const { manifest, targets } = await manifestAndTargets();
  const counter = { count: 0, urls: [] };
  const loader = createPracticeIndexLoader({ fetchImpl: repoFetch(counter), hashText });
  const query = { manifest, partition: "training", entityType: targets[0].entry.entityType, entityKey: targets[0].entry.entityKey };
  const [left, right] = await Promise.all([loader.loadTargetShard(query), loader.loadTargetShard(query)]);
  assert.equal(left.shardId, right.shardId);
  assert.equal(counter.count, 1);
});

test("failed shard loads are retryable and do not poison cache", async () => {
  const { manifest, targets } = await manifestAndTargets();
  const shardName = String(targets[0].shardId).padStart(2, "0");
  const failingUrl = `data/practice/indexes/en-v1/training/targets/target-${shardName}.json`;
  const counter = { count: 0, urls: [] };
  const loader = createPracticeIndexLoader({ fetchImpl: repoFetch(counter, failingUrl), hashText });
  const query = { manifest, partition: "training", entityType: targets[0].entry.entityType, entityKey: targets[0].entry.entityKey };
  await assert.rejects(loader.loadTargetShard(query), (error) => error.code === "INDEX_NOT_FOUND");
  const recovered = await loader.loadTargetShard(query);
  assert.equal(recovered.shardId, targets[0].shardId);
  assert.equal(counter.count, 2);
});
