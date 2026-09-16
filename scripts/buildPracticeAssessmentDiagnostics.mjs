import { readFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPracticeAssessmentDiagnosticRegistry } from '../js/practiceLab/practiceAssessmentDiagnostics.js';
import { PRACTICE_ASSESSMENT_LIMITS, PRACTICE_ASSESSMENT_DIAGNOSTIC_MATCH_POLICY } from '../js/practiceLab/practiceAssessmentConstants.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const validateOnly=process.argv.includes('--validate');
const unknown=process.argv.slice(2).filter(a=>a!=='--validate'); if(unknown.length) throw new Error(`Unknown assessment diagnostic build argument: ${unknown[0]}`);
const corpusFile=path.join(root,'data/practice/diagnostic/en-v1.json');
const corpusManifestFile=path.join(root,'data/practice/manifests/en-v1.manifest.json');
const modelManifestFile=path.join(root,'data/practice/models/en-v1/manifest.json');
const modelFile=path.join(root,'data/practice/models/en-v1/diagnostic.json');
const blueprintFile=path.join(root,'data/practice/assessment/en-v1/assessment-blueprint-v1.json');
const outputFile=path.join(root,'data/practice/assessment/en-v1/diagnostic-forms-v1.manifest.json');
const [corpus,corpusManifest,modelManifest,model,blueprint]=await Promise.all([corpusFile,corpusManifestFile,modelManifestFile,modelFile,blueprintFile].map(async f=>JSON.parse(await readFile(f,'utf8'))));
if(corpus.partition!=='diagnostic'||model.partition!=='diagnostic') throw new Error('PL19 diagnostic builder accepts diagnostic partition only');
if(corpus.items.some(i=>i.reviewStatus!=='approved'||i.partition!=='diagnostic')) throw new Error('PL19 diagnostic builder requires approved diagnostic-only content');
if(model.corpusChecksum!==corpusManifest.buildChecksum||model.indexChecksum!==modelManifest.indexChecksum) throw new Error('PL19 diagnostic model bindings are stale');
const modelChecksum=modelManifest.artifactChecksums.find(e=>e.path==='diagnostic.json')?.sha256??null;
if(!modelChecksum||!modelManifest.referenceChecksum) throw new Error('PL19 typability bindings are incomplete');
const byModel=new Map(model.items.map(i=>[i.contentId,i]));
const countChars=(text)=>{const m=new Map();for(const ch of text.toLowerCase())m.set(ch,(m.get(ch)||0)+1);return m;};
const blockSpecific=(block,item)=>{
 const text=item.text; const lower=text.toLowerCase(); const chars=countChars(text); const words=lower.match(/[a-z]+(?:'[a-z]+)?/g)||[];
 if(block.blockId==='diagnostic-core-keys' && [...'abcdefghijklmnopqrstuvwxyz'].some(ch=>(chars.get(ch)||0)<5)) return 'alphabetic-key-coverage';
 if(block.blockId==='diagnostic-word-launch' && (words.length<60||new Set(words).size<40)) return 'word-opportunity-coverage';
 if(block.blockId==='diagnostic-punctuation-capitals' && (!/[A-Z]/.test(text)||!/[,.!?;:'"()\[\]-]/.test(text))) return 'punctuation-capital-coverage';
 if(block.blockId==='diagnostic-numbers-symbols' && ([...'0123456789'].some(ch=>!text.includes(ch))||!/[+\-*/%$=:]/.test(text))) return 'number-symbol-coverage';
 return null;
};
const matchPair=(forms)=>{
 if(forms.length<2) return false; const p=PRACTICE_ASSESSMENT_DIAGNOSTIC_MATCH_POLICY; const [a,b]=forms;
 const da=Math.abs(a.difficultyIndex-b.difficultyIndex); const pa=Math.abs(a.relativeDifficultyPercentile-b.relativeDifficultyPercentile);
 const ld=Math.abs(a.graphemeCount-b.graphemeCount)/Math.max(a.graphemeCount,b.graphemeCount);
 return da<=p.maximumDifficultyIndexSpread && pa<=p.maximumRelativePercentileSpread && ld<=p.maximumLengthDeviationRatio;
};
const formSets=[];
for(const block of blueprint.blocks){
 const tag=`assessment:${block.blockId}`; const reasons=[];
 const candidates=corpus.items.filter(i=>i.metadata?.tags?.includes(tag)).sort((a,b)=>a.contentId.localeCompare(b.contentId));
 const familySeen=new Set(); const forms=[];
 for(const item of candidates){
   if(familySeen.has(item.familyId)) continue; const mi=byModel.get(item.contentId); if(!mi){reasons.push(`${item.contentId}:missing-model`);continue;}
   const graphemes=mi.features?.graphemeCount??[...item.text].length; if(graphemes<block.minimumGraphemes){reasons.push(`${item.contentId}:capacity`);continue;}
   const specific=blockSpecific(block,item); if(specific){reasons.push(`${item.contentId}:${specific}`);continue;}
   if((mi.textDifficulty?.availableModelWeight??0)<0.9){reasons.push(`${item.contentId}:typability`);continue;}
   familySeen.add(item.familyId); forms.push({formId:`${block.blockId}-form-${String(forms.length+1).padStart(2,'0')}`,contentId:item.contentId,familyId:item.familyId,sourceId:item.sourceId,partition:'diagnostic',graphemeCount:graphemes,contentHash:item.contentHash,difficultyIndex:mi.textDifficulty.difficultyIndex,relativeDifficultyPercentile:mi.textDifficulty.relativeDifficultyPercentile,availableModelWeight:mi.textDifficulty.availableModelWeight});
 }
 const selected=forms.slice(0,2); const matched=matchPair(selected); if(selected.length>=2&&!matched) reasons.push('matched-variant-policy-failed');
 formSets.push({blockId:block.blockId,status:selected.length>=2&&matched?'ready':'draft',forms:selected,reasons});
}
const allReady=formSets.every(s=>s.status==='ready');
const artifact={artifactVersion:1,blueprintVersion:blueprint.blueprintVersion,formVersion:1,matchPolicyVersion:blueprint.matchingPolicy.version,language:corpus.language,partition:'diagnostic',status:allReady?'ready':'draft',bindings:{corpusId:corpus.corpusId,corpusVersion:corpus.corpusVersion,corpusChecksum:corpusManifest.buildChecksum,indexChecksum:model.indexChecksum,typabilityModelVersion:model.modelVersion,typabilityFeatureVersion:model.featureVersion,typabilityReferenceVersion:model.referenceVersion,typabilityReferenceChecksum:modelManifest.referenceChecksum,diagnosticTypabilityChecksum:modelChecksum},sourceInventory:{approvedDiagnosticItems:corpus.items.length,families:new Set(corpus.items.map(i=>i.familyId)).size,maximumSourceItemGraphemes:Math.max(0,...corpus.items.map(i=>[...i.text].length)),totalSourceGraphemes:corpus.items.reduce((s,i)=>s+[...i.text].length,0)},reasons:allReady?[]:['One or more canonical diagnostic form sets are not release-ready.'],formSets};
createPracticeAssessmentDiagnosticRegistry({artifacts:[artifact]});
if(artifact.status!=='ready'&& !validateOnly) console.warn(JSON.stringify(formSets.filter(s=>s.status!=='ready'),null,2));
const next=JSON.stringify(artifact,null,2)+'\n';
if(validateOnly){if(await readFile(outputFile,'utf8')!==next)throw new Error('PL19 assessment diagnostic artifact is stale; rebuild required');console.log(`PL19 assessment diagnostics valid: ${artifact.status}`);} else {await mkdir(path.dirname(outputFile),{recursive:true});const temp=`${outputFile}.tmp-${process.pid}`;await writeFile(temp,next,'utf8');await rename(temp,outputFile);await rm(temp,{force:true});console.log(`PL19 assessment diagnostics built: ${artifact.status}`);}
if(!allReady) process.exitCode=1;
