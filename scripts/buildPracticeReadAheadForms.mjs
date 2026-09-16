import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=new URL('../data/practice/',import.meta.url),id='WS-READAHEAD-EN-1';
const read=async p=>JSON.parse(await readFile(new URL(p,base),'utf8'));
const manifest=await read('consistency/en-v1/WS-CONSISTENCY-EN-1.manifest.json');
const artifact=await read('consistency/en-v1/WS-CONSISTENCY-EN-1.forms.json');
for(const f of artifact.forms){const m=manifest.forms.find(x=>x.formId===f.formId);if(!m?.ready||m.graphemeCount<22000||m.availableModelWeight<.9||m.windowDifficultySpread>.45||((f.text.match(/\d/g)||[]).length/f.text.length)>.01||((f.text.match(/[^\p{L}\p{N}\s.,;:!?'"()\-]/gu)||[]).length/f.text.length)>.005)throw new Error('Read-Ahead form constraints not satisfied: '+f.formId);}
artifact.formSetId=id;manifest.formSetId=id;manifest.slidingWindow.maximumDifficultySpread=.45;
const text=JSON.stringify(artifact,null,2)+'\n';manifest.formsChecksum='sha256-'+createHash('sha256').update(text).digest('hex');manifest.formsPath=`data/practice/read-ahead/en-v1/${id}.forms.json`;
const folder=new URL('read-ahead/en-v1/',base);await mkdir(folder,{recursive:true});await writeFile(new URL(id+'.forms.json',folder),text);await writeFile(new URL(id+'.manifest.json',folder),JSON.stringify(manifest,null,2)+'\n');console.log('Read-Ahead: '+artifact.forms.length+' governed ready forms');
