import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const req=(ok,msg)=>{if(!ok)throw new Error(`Practice release-content validation failed: ${msg}`)};
const BENCH=6, TRANSFER=16, REAL=16;
const BLOCKS=['diagnostic-core-keys','diagnostic-word-launch','diagnostic-combinations','diagnostic-punctuation-capitals','diagnostic-numbers-symbols','diagnostic-lexical-extended','diagnostic-combinations-extended','diagnostic-mixed'];
const [bench,transfer,real,assess,benchCorpus,transferCorpus,trainingCorpus,diagCorpus,sources]=await Promise.all([
 read('data/practice/evaluation/en-v1/benchmark/WS-BENCH-EN-1.manifest.json'),read('data/practice/evaluation/en-v1/transfer/WS-TRANSFER-EN-1.manifest.json'),read('data/practice/real-text/en-v1/WS-REALTEXT-EN-1.manifest.json'),read('data/practice/assessment/en-v1/diagnostic-forms-v1.manifest.json'),read('data/practice/benchmark/en-v1.json'),read('data/practice/transfer/en-v1.json'),read('data/practice/training/en-v1.json'),read('data/practice/diagnostic/en-v1.json'),read('data/practice/provenance/sources.json')]);
const sourceMap=new Map(sources.sources.map(s=>[s.sourceId,s]));
const corpusMaps=new Map([['benchmark',new Map(benchCorpus.items.map(x=>[x.contentId,x]))],['transfer',new Map(transferCorpus.items.map(x=>[x.contentId,x]))],['training',new Map(trainingCorpus.items.map(x=>[x.contentId,x]))],['diagnostic',new Map(diagCorpus.items.map(x=>[x.contentId,x]))]]);
function validateRecords(records,partition,label){
 const families=new Set();
 for(const r of records){
  const ids=r.orderedContentIds??r.contentIds??[r.contentId]; const currentFamilies=new Set();
  for(const [i,id] of ids.entries()){
   const c=corpusMaps.get(partition).get(id);req(c,`${label} ${id} missing canonical corpus binding`);
   req(c.partition===partition&&c.reviewStatus==='approved',`${label} wrong partition or unapproved source`);
   const expected=r.contentHashes?.[id]??r.segmentHashes?.[i]??r.contentHash;
   req(c.contentHash===expected,`${label} hash mismatch for ${id}`);currentFamilies.add(c.familyId);
   const source=sourceMap.get(c.sourceId);req(source?.usageApproval==='practice-display-approved',`${label} source not approved`);
  }
  for(const f of currentFamilies){req(!families.has(f),`${label} reuses family across forms`);families.add(f);}
 }
}
req(bench.status==='ready',`Benchmark status ${bench.status}`);req(bench.forms.length===BENCH,`Benchmark expected ${BENCH}, got ${bench.forms.length}`);validateRecords(bench.forms,'benchmark','Benchmark');
req(transfer.status==='ready',`Transfer status ${transfer.status}`);req(transfer.units.length===TRANSFER,`Transfer expected ${TRANSFER}, got ${transfer.units.length}`);validateRecords(transfer.units,'transfer','Transfer');
req(real.status==='ready',`Real Text status ${real.status}`);req(real.units.length===REAL,`Real Text expected ${REAL}, got ${real.units.length}`);validateRecords(real.units,'training','Real Text');req(real.units.reduce((s,x)=>s+(x.graphemeCount||0),0)>=22000,'Real Text aggregate capacity below 10-minute engineering floor');
req(assess.status==='ready','Assessment diagnostic artifact not ready');req(assess.formSets.length===BLOCKS.length,'Assessment set count must be exactly 8');for(const blockId of BLOCKS){const set=assess.formSets.find(s=>s.blockId===blockId);req(set&&set.status==='ready',`${blockId} not ready`);req(set.forms.length>=2,`${blockId} has fewer than 2 variants`);validateRecords(set.forms,'diagnostic',blockId);}
const all=[...bench.forms,...transfer.units,...real.units,...assess.formSets.flatMap(s=>s.forms)];req(new Set(all.map(x=>x.contentHash??x.formHash??x.unitHash)).size===all.length,'cross-family duplicate content hash');
console.log(JSON.stringify({benchmark:{ready:bench.forms.length,required:BENCH},transfer:{ready:transfer.units.length,required:TRANSFER},realText:{ready:real.units.length,required:REAL},assessment:{readySets:assess.formSets.filter(s=>s.status==='ready').length,requiredSets:8,minVariants:2},status:'PASS'},null,2));
