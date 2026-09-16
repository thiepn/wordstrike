import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const registryPath=path.join(root,'data/practice/provenance/sources.json');
const registry=JSON.parse(await readFile(registryPath,'utf8'));
const specs=[
 ['ws-original-gc3-benchmark-en-v1','GC3 Benchmark English Original Source v1','authoring/gc3-benchmark-en-v1.source.json'],
 ['ws-original-gc3-transfer-en-v1','GC3 Transfer English Original Source v1','authoring/gc3-transfer-en-v1.source.json'],
 ['ws-original-gc3-realtext-en-v1','GC3 Real Text English Original Source v1','authoring/gc3-realtext-en-v1.source.json'],
 ['ws-original-gc3-assessment-en-v1','GC3 Assessment English Original Source v1','authoring/gc3-assessment-en-v1.source.json']
];
for(const [sourceId,title,snapshotPath] of specs){
 const bytes=await readFile(path.join(root,'data/practice',snapshotPath));
 const checksum='sha256-'+createHash('sha256').update(bytes).digest('hex');
 const entry={sourceId,title,sourceType:'wordstrike-original',upstream:null,license:{name:'WordStrike-authored original corpus material',spdx:null,url:null,attributionRequired:false,notes:'GC3 release-critical prose authored for WordStrike and reviewed for local Practice display.'},retrievedAt:null,sourceChecksum:checksum,snapshotPath,usageApproval:'practice-display-approved',notes:'GC3 governed original content; partition and family boundaries are enforced by the canonical corpus builder.'};
 const i=registry.sources.findIndex(x=>x.sourceId===sourceId); if(i>=0) registry.sources[i]=entry; else registry.sources.push(entry);
}
registry.sources.sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
await writeFile(registryPath,JSON.stringify(registry,null,2)+'\n','utf8');
console.log('GC3 PL6 source registry bindings updated');
