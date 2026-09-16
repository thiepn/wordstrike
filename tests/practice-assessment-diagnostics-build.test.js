import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {createPracticeAssessmentDiagnosticRegistry} from '../js/practiceLab/practiceAssessmentDiagnostics.js';
import {resolvePracticeAssessmentDiagnosticContent} from '../js/practiceLab/practiceAssessmentContent.js';
import {createPracticeEntityResolver} from '../js/practiceLab/practiceEntityResolver.js';
import {getPracticeAssessmentMinimumFormGraphemes,PRACTICE_ASSESSMENT_BLOCKS} from '../js/practiceLab/practiceAssessmentConstants.js';
const read=async p=>JSON.parse(await readFile(new URL('../data/practice/'+p,import.meta.url),'utf8'));
test('PL19 release diagnostics regenerate exactly',()=>assert.match(execFileSync(process.execPath,['scripts/buildPracticeAssessmentDiagnostics.mjs','--validate'],{encoding:'utf8'}),/valid: ready/));
test('All eight diagnostic sets have two capacity-safe hash-verified composite variants',async()=>{
 const artifact=await read('assessment/en-v1/diagnostic-forms-v1.manifest.json');const corpus=await read('diagnostic/en-v1.json');const registry=createPracticeAssessmentDiagnosticRegistry({artifacts:[artifact]});
 assert.equal(artifact.status,'ready');assert.equal(artifact.formSets.length,8);
 for(const set of artifact.formSets){assert.equal(registry.isBlockReady('en',set.blockId),true);assert.ok(set.forms.length>=2);const block=PRACTICE_ASSESSMENT_BLOCKS.find(b=>b.blockId===set.blockId);for(const form of set.forms){assert.ok(form.graphemeCount>=getPracticeAssessmentMinimumFormGraphemes(block.durationMs));assert.ok(form.contentIds.length>1);const loaded=await resolvePracticeAssessmentDiagnosticContent({form,items:corpus.items});assert.equal([...loaded.text].length,form.graphemeCount);const resolver=createPracticeEntityResolver({contentPlan:{text:loaded.text,metadata:{evidenceSegments:loaded.evidenceSegments}},profileId:'p',contextId:'c'});for(const segment of loaded.evidenceSegments){assert.deepEqual(resolver.resolveAtPosition(segment.startIndex).filter(e=>['bigram','trigram'].includes(e.entityType)),[]);assert.equal(resolver.isEvidenceBoundary(segment.startIndex),true);}
 await assert.rejects(resolvePracticeAssessmentDiagnosticContent({form:{...form,contentIds:[...form.contentIds].reverse()},items:corpus.items}),/mismatch/);
 const corrupted=corpus.items.map(i=>i.contentId===form.contentIds[0]?{...i,text:i.text+'!'}:i);await assert.rejects(resolvePracticeAssessmentDiagnosticContent({form,items:corrupted}),/mismatch/);
 }}
});
