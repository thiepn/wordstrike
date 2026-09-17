import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { createPracticeTargetWorkerClient } from '../js/practiceLab/practiceTargetWorkerClient.js';

// Run the actual browser worker module against shipped corpus files. Only the
// transport and fetch are adapted; composition and validation are unchanged.
test('real corpus target preparation runs off-thread and returns a startable plan', { timeout: 60000 }, async () => {
  const original = globalThis.Worker;
  const root = new URL('../', import.meta.url).href;
  globalThis.Worker = class {
    constructor(url) {
      this.worker = new NodeWorker(`
        const {parentPort}=require('node:worker_threads');
        const {readFile}=require('node:fs/promises');
        globalThis.self=globalThis;
        globalThis.postMessage=data=>parentPort.postMessage(data);
        globalThis.fetch=async url=>{const text=await readFile(url instanceof URL ? url : new URL(url, ${JSON.stringify(root)}),'utf8');return {ok:true,text:async()=>text,json:async()=>JSON.parse(text)}};
        const ready=import(${JSON.stringify(url.href)});
        parentPort.on('message',async data=>{await ready;self.onmessage({data});});
      `, { eval: true });
      this.worker.on('message', data => this.onmessage?.({ data }));
      this.worker.on('error', error => this.onerror?.(error));
    }
    postMessage(data) { this.worker.postMessage(data); }
    terminate() { return this.worker.terminate(); }
  };
  const context = { contextId: 'worker-test', fingerprint: 'worker-test', dataLocale: 'en', keyboardLayout: 'unknown', inputMethod: 'physical-keyboard', hardwareProfileId: null };
  const client = createPracticeTargetWorkerClient({ kind: 'WeakKeys', options: {}, withContext: task => task(context) });
  let ticks = 0;
  const timer = setInterval(() => ticks++, 10);
  try {
    const availability = await client.inspectTarget({ entityKey: 'e' });
    assert.equal(availability.status, 'ready');
    assert.ok(ticks > 10, 'UI event loop must continue during composition');
    const prepared = await client.prepare({ entityKey: 'e', sessionId: 'worker-preparation-test' });
    assert.ok(prepared.contentPlan.text.length > 80);
    assert.equal(prepared.context.contextId, context.contextId);
    for (const [kind, target] of [['ProblemWords', { entityKey: 'the' }], ['AccuracyRecovery', { entityType: 'key', entityKey: 'e' }]]) {
      const other = createPracticeTargetWorkerClient({ kind, options: {}, withContext: task => task(context) });
      try {
        const ready = await other.inspectTarget(target);
        assert.equal(ready.status, 'ready', `${kind}: ${JSON.stringify(ready)}`);
        const session = await other.prepare({ ...target, sessionId: `worker-${kind}` });
        assert.ok(session.contentPlan.text.length > 10);
      } finally { other.clear(); }
    }
  } finally { clearInterval(timer); client.clear(); globalThis.Worker = original; }
});
