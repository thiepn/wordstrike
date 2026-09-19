import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPracticeSessionHarness} from './practiceSessionFixtures.js';
import {createPracticeSessionEngine} from '../js/practiceLab/practiceSessionEngine.js';
import {buildPracticeSpecialDomainPlan,buildPracticeSpecialDomainContentPlan} from '../js/practiceLab/practiceSpecialDomainPlan.js';
import {createPracticeNumbersSymbolsExperiment} from '../js/practiceLab/practiceNumbersSymbolsExperiment.js';
import {createPracticeEntityResolver} from '../js/practiceLab/practiceEntityResolver.js';
import {validatePracticeEntityKey} from '../js/practiceLab/practiceValidation.js';
const formData=JSON.parse(fs.readFileSync(new URL('../data/practice/numbers-symbols/en-v1/WS-NUMSYM-PRACTICE-EN-1.forms.json',import.meta.url)));
test('numeric identifiers retain key evidence without generating invalid lexical word records',()=>{
 const text='hello 123 rateab3 offsetaz-4 café mother-in-law';
 const resolver=createPracticeEntityResolver({contentPlan:{text,metadata:{language:'en'}},profileId:'practice-profile_fixture',contextId:'practice-context_fixture'});
 const words=new Set();
 for(let index=0;index<Array.from(text).length;index++){
  const entities=resolver.resolveAtPosition(index);
  assert.ok(entities.some(e=>e.entityType==='key'),'all transcription characters retain key evidence');
  for(const entity of entities.filter(e=>e.entityType==='word')){
   assert.ok(validatePracticeEntityKey('word',entity.entityKey).valid);
   words.add(entity.entityKey);
  }
 }
 assert.ok(words.has('hello'));assert.ok(words.has('café'));
 assert.ok(!words.has('123')&&!words.has('rateab3')&&!words.has('offsetaz-4'));
});
for(const form of formData.forms)test(`Numbers & Symbols ${form.formId} completes and commits exactly once`,async()=>{
 const h=await createPracticeSessionHarness({suffix:'numbers-save-'+form.formId.toLowerCase()});
 const formSet={manifest:{formSetId:formData.formSetId,formSetVersion:formData.formSetVersion},forms:formData.forms};
 const plan=buildPracticeSpecialDomainPlan({sessionId:h.sessionId,profileId:h.profileId,contextId:h.contextId,experimentId:'numbers-symbols',flow:'practice',durationMs:300000,formSet,form});
 const contentPlan=buildPracticeSpecialDomainContentPlan({plan,form,sourceType:'numbers-symbols-training'});
 const experiment=createPracticeNumbersSymbolsExperiment({plan,form,contentPlan});
 const engine=createPracticeSessionEngine({repository:h.repository,sessionId:h.sessionId,profileId:h.profileId,contextId:h.contextId,clock:h.time.clock,wallClock:h.time.wallClock,scheduler:h.time.scheduler});
 try{
  await engine.prepare({experiment,configuration:{timingMode:'on-start',correctionBehavior:'allow',flow:'practice',policyVersion:1,durationMs:300000},contentPlan});
  await engine.start();
  for(const char of form.text.slice(0,432)){
   assert.ok(engine.handleInput(h.input(char===' '?'space':'character',char)).accepted);
   await h.time.advance(500,{runTimers:false});
  }
  await h.time.advance(90000,{runTimers:false});
  assert.ok((await engine.tick()).completed);
  const result=await engine.complete('time-complete');
  assert.equal(result.summary.status,'completed');
  assert.equal((await h.repository.listSessionSummaries()).length,1);
  assert.equal((await h.repository.getPracticeProfile()).totalCompletedSessions,1);
  for(const stat of await h.repository.listSkillStats())assert.ok(validatePracticeEntityKey(stat.entityType,stat.entityKey).valid);
 }finally{await engine.destroy();}
});
