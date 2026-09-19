import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePracticeText } from '../js/practiceLab/practiceTextAnalysis.js';
import { hashPracticeContent } from '../js/practiceLab/practiceIds.js';
import { buildPracticeWeakKeysTrainingPlan, buildPracticeWeakKeysContentPlan } from '../js/practiceLab/practiceWeakKeysGenerator.js';

const TARGETS = ['echo','east','edit','gear','pear','fear','near','wear','meat','lean','late','fine','rope','hope','tape','same','dome','Eagle','Eager','Else','Edge','Even','Enter','Event','Ever'];
const NEUTRAL = ['calm','soft','kind','bold','dark','loud','warm','pink','fast','slow','tall','thin','tiny','vast','cool','fair','mild'];
const context = {contextId:'practice-context_case-regression-12345678',fingerprint:'case-regression',dataLocale:'en',keyboardLayout:'qwerty',inputMethod:'physical',hardwareProfileId:null};
const binding = {corpusId:'case-regression',corpusVersion:1,indexVersion:1,manifestHash:'fixture-manifest'};

function fixture() {
  const items=[], annotations=new Map(), summaries=new Map(), refs=[];
  for(const [i,word] of TARGETS.entries()) {
    // "Echo" has no lowercase e in source; its generated form does contain e.
    const text=`${word} ${NEUTRAL[i % NEUTRAL.length]} Echo`;
    const item={contentId:`case-content-${i}`,familyId:`case-family-${i}`,sourceId:`source-${i}`,language:'en',corpusVersion:1,partition:'training',contentType:'sentence',text,contentHash:hashPracticeContent(text),reviewStatus:'approved',metadata:{tags:['fixture']}};
    const analysis=analyzePracticeText({text,language:'en'});
    const occurrences=analysis.keyOccurrences.filter(o=>o.target==='e');
    items.push(item);
    annotations.set(item.contentId,{...analysis,...item,corpusId:binding.corpusId});
    refs.push({contentId:item.contentId,familyId:item.familyId,count:occurrences.length,positions:occurrences.map(o=>o.startIndex)});
    for(const entry of analysis.words){
      const key=entry.lexicalKey;
      if(!summaries.has(key))summaries.set(key,{entityType:'word',entityKey:key,lexicalKey:key,contents:[]});
      summaries.get(key).contents.push({contentId:item.contentId,familyId:item.familyId,count:1,positions:[entry.startIndex]});
    }
  }
  const guard=q=>{assert.equal(q.partition,'training');assert.equal(q.purpose,'training');};
  const targetIndex={
    async getTargetContentRefs(q){guard(q);return refs;},
    async getTargetWordRefs(q){guard(q);return [...summaries.keys()].filter(key=>key.includes('e'));},
    async getWordSummary(q){guard(q);return summaries.get(q.lexicalKey);},
    async getContentAnnotations(q){guard(q);return annotations.get(q.contentId);},
  };
  return {items,targetIndex};
}

for(const seed of ['a','b','c','d'])test(`normalized target and neutral spelling preserve exact quotas (${seed})`,async()=>{
  const {items,targetIndex}=fixture();
  const plan=await buildPracticeWeakKeysTrainingPlan({sessionId:`practice-session_case-${seed}-12345678`,context,targetIndex,contentItems:items,corpusBinding:binding,entityKey:'e',targetSource:'manual',language:'en'});
  let generated=0;
  for(const phase of plan.phases)for(const unit of phase.units){
    if(unit.kind!=='generated-word-sequence')continue;
    generated++;
    const text=unit.wordKeys.join(' ');
    const count=analyzePracticeText({text,language:'en'}).keyOccurrences.filter(o=>o.target==='e').length;
    assert.equal(count,unit.targetOpportunityCount,`wrong count for ${text}`);
  }
  assert.ok(generated>0);
  const content=buildPracticeWeakKeysContentPlan({plan,contentItems:items});
  assert.deepEqual(content.metadata.weakKeys.phaseRanges.map(p=>p.targetPositions.length),[8,24,20,20,8]);
});
