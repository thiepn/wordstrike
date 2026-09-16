import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=['gc3-benchmark-en-v1.source.json','gc3-transfer-en-v1.source.json','gc3-realtext-en-v1.source.json','gc3-assessment-en-v1.source.json'];
for(const file of files){
 const p=path.join(root,'data/practice/authoring',file); const old=JSON.parse(await readFile(p,'utf8'));
 const normalized={schemaVersion:1,corpusId:'practice-en-v1',language:'en',corpusVersion:1,partitionPolicyVersion:1,status:'foundation',createdAt:'2026-09-04T00:00:00.000Z',families:old.families.map(f=>({familyId:f.familyId,sourceId:f.sourceId,partitionLock:f.partition,items:f.items.map(i=>({contentId:i.contentId,contentType:'paragraph',text:i.text,reviewStatus:'approved',metadata:{tags:i.tags??[]}}))}))};
 await writeFile(p,JSON.stringify(normalized,null,2)+'\n','utf8');
}
console.log('GC3 authored sources normalized to canonical PL6 schema');
