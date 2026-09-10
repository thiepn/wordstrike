import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { PRACTICE_ABILITY_CHANNELS } from "../js/practiceLab/practiceAbilityConstants.js";
import { getPracticeAbilityChannelPolicy } from "../js/practiceLab/practiceAbilityPolicy.js";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS } from "../js/practiceLab/practiceConstants.js";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";
import { getPracticeExperiment } from "../js/practiceLab/practiceExperimentCatalog.js";
import { PRACTICE_LAB_PUBLIC_ENABLED } from "../js/practiceLab/practiceFeatureGate.js";
import {
  PRACTICE_NUMBERS_COMMERCE_PERCENT_SYMBOLS,
  PRACTICE_NUMBERS_IDENTIFIER_SYMBOLS,
  PRACTICE_NUMBERS_OPERATOR_SYMBOLS,
  PRACTICE_PUNCTUATION_CHARACTER_SET,
  PRACTICE_SPECIAL_DOMAIN_ACCUMULATOR_VERSION,
  PRACTICE_SPECIAL_DOMAIN_ANNOTATION_VERSION,
} from "../js/practiceLab/practiceSpecialDomainConstants.js";
import {
  PRACTICE_PUNCTUATION_CAPITALS_DEFAULT_PRACTICE_DURATION_MS,
  PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS,
  PRACTICE_PUNCTUATION_CAPITALS_VERSION,
  PRACTICE_PUNCTUATION_CAPITALS_POLICY_VERSION,
  PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_SCHEMA_VERSION,
  PRACTICE_PUNCTUATION_CAPITALS_CHECK_SCHEMA_VERSION,
  PRACTICE_PUNCTUATION_CAPITALS_ANALYSIS_VERSION,
  PRACTICE_PUNCTUATION_CAPITALS_RESULT_VERSION,
} from "../js/practiceLab/practicePunctuationCapitalsConstants.js";
import {
  PRACTICE_NUMBERS_SYMBOLS_DEFAULT_PRACTICE_DURATION_MS,
  PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS,
  PRACTICE_NUMBERS_SYMBOLS_VERSION,
  PRACTICE_NUMBERS_SYMBOLS_POLICY_VERSION,
  PRACTICE_NUMBERS_SYMBOLS_PRACTICE_SCHEMA_VERSION,
  PRACTICE_NUMBERS_SYMBOLS_CHECK_SCHEMA_VERSION,
  PRACTICE_NUMBERS_SYMBOLS_ANALYSIS_VERSION,
  PRACTICE_NUMBERS_SYMBOLS_RESULT_VERSION,
} from "../js/practiceLab/practiceNumbersSymbolsConstants.js";
import { getPracticePunctuationCapitalsAvailability } from "../js/practiceLab/practicePunctuationCapitalsAvailability.js";
import { getPracticeNumbersSymbolsAvailability } from "../js/practiceLab/practiceNumbersSymbolsAvailability.js";
import { selectPracticeSpecialDomainForm, buildPracticeSpecialDomainPlan, buildPracticeSpecialDomainContentPlan } from "../js/practiceLab/practiceSpecialDomainPlan.js";
import { createPracticeSpecialDomainAccumulator } from "../js/practiceLab/practiceSpecialDomainAccumulator.js";
import { buildPracticeSpecialDomainAbilityMeasurement } from "../js/practiceLab/practiceSpecialDomainAbilityMeasurement.js";
import { createPracticePunctuationCapitalsExperiment, createPracticePunctuationCapitalsCheckDescriptor } from "../js/practiceLab/practicePunctuationCapitalsExperiment.js";
import { createPracticeNumbersSymbolsExperiment, createPracticeNumbersSymbolsCheckDescriptor } from "../js/practiceLab/practiceNumbersSymbolsExperiment.js";
import { hashPracticeSpecialDomainAnnotations } from "../js/practiceLab/practiceSpecialDomainForms.js";

const readJson=(p)=>JSON.parse(fs.readFileSync(p,"utf8"));
const punctCheck=readJson("data/practice/punctuation-capitals/en-v1/WS-PUNCT-CHECK-EN-1.forms.json");
const punctPractice=readJson("data/practice/punctuation-capitals/en-v1/WS-PUNCT-PRACTICE-EN-1.forms.json");
const numCheck=readJson("data/practice/numbers-symbols/en-v1/WS-NUMSYM-CHECK-EN-1.forms.json");
const numPractice=readJson("data/practice/numbers-symbols/en-v1/WS-NUMSYM-PRACTICE-EN-1.forms.json");
const provenance=readJson("data/practice/provenance/sources.json");

test("PL30 prerequisite channels and record versions remain stable inside the PL31 DB9 envelope",()=>{
  assert.ok(PRACTICE_ABILITY_CHANNELS.includes("punctuation"));
  assert.ok(PRACTICE_ABILITY_CHANNELS.includes("numbers-symbols"));
  assert.equal(PRACTICE_DATABASE_VERSION,8);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary,13);
  assert.equal(PRACTICE_RECORD_VERSIONS.abilityState,1);
  assert.equal(PRACTICE_RECORD_VERSIONS.learningState,1);
  assert.equal(PRACTICE_RECORD_VERSIONS.reviewItem,3);
  assert.equal(PRACTICE_RECORD_VERSIONS.performanceState,1);
  assert.equal(PRACTICE_RECORD_VERSIONS.coachPlan,1);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION,10);
  assert.equal(PRACTICE_LAB_PUBLIC_ENABLED,false);
});

test("PL30 v1 versions and durations are frozen",()=>{
  assert.deepEqual([
    PRACTICE_PUNCTUATION_CAPITALS_VERSION,PRACTICE_PUNCTUATION_CAPITALS_POLICY_VERSION,
    PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_SCHEMA_VERSION,PRACTICE_PUNCTUATION_CAPITALS_CHECK_SCHEMA_VERSION,
    PRACTICE_PUNCTUATION_CAPITALS_ANALYSIS_VERSION,PRACTICE_PUNCTUATION_CAPITALS_RESULT_VERSION,
  ],[1,1,1,1,1,1]);
  assert.deepEqual([
    PRACTICE_NUMBERS_SYMBOLS_VERSION,PRACTICE_NUMBERS_SYMBOLS_POLICY_VERSION,
    PRACTICE_NUMBERS_SYMBOLS_PRACTICE_SCHEMA_VERSION,PRACTICE_NUMBERS_SYMBOLS_CHECK_SCHEMA_VERSION,
    PRACTICE_NUMBERS_SYMBOLS_ANALYSIS_VERSION,PRACTICE_NUMBERS_SYMBOLS_RESULT_VERSION,
  ],[1,1,1,1,1,1]);
  assert.equal(PRACTICE_SPECIAL_DOMAIN_ANNOTATION_VERSION,1);
  assert.equal(PRACTICE_SPECIAL_DOMAIN_ACCUMULATOR_VERSION,1);
  assert.deepEqual(PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS,[120000,300000,480000]);
  assert.deepEqual(PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS,[120000,300000,480000]);
  assert.equal(PRACTICE_PUNCTUATION_CAPITALS_DEFAULT_PRACTICE_DURATION_MS,300000);
  assert.equal(PRACTICE_NUMBERS_SYMBOLS_DEFAULT_PRACTICE_DURATION_MS,300000);
});

test("catalog activates exactly the two separate PL30 surfaces",()=>{
  const punct=getPracticeExperiment("punctuation-capitals");
  const nums=getPracticeExperiment("numbers-symbols");
  assert.equal(punct.status,"preview");
  assert.equal(nums.status,"preview");
  assert.equal(punct.requiresPracticeData,false);
  assert.equal(nums.requiresPracticeData,false);
  assert.equal(punct.supportsSoftwareKeyboard,true);
  assert.equal(nums.supportsSoftwareKeyboard,true);
  assert.match(punct.description,/standardized Check/);
  assert.match(nums.description,/Numbers & Symbols Check/);
  assert.equal(getPracticeExperiment("special-characters"),null);
});

test("PL30 source provenance is display-approved WordStrike-original",()=>{
  for(const id of ["ws-original-en-punctuation-capitals-v1","ws-original-en-numbers-symbols-v1"]){
    const row=provenance.sources.find(x=>x.sourceId===id);
    assert.ok(row);
    assert.equal(row.sourceType,"wordstrike-original");
    assert.equal(row.usageApproval,"practice-display-approved");
    assert.match(row.sourceChecksum,/^sha256-/);
  }
});

test("Punctuation Check forms lock exact category quota, spread, boundaries, and sentence capitals",()=>{
  assert.equal(punctCheck.forms.length,6);
  for(const form of punctCheck.forms){
    assert.equal(form.partition,"diagnostic");
    assert.ok(form.metrics.graphemeCount>=1800&&form.metrics.graphemeCount<=2100);
    assert.equal(form.metrics.primaryOpportunityCount,180);
    assert.deepEqual(form.metrics.categoryCounts,{
      "capital-letter":54,comma:32,"terminal-mark":32,"colon-semicolon":14,"quote-apostrophe":26,"bracket-dash":22,
    });
    assert.ok(form.metrics.sentenceCapitalCount>=32);
    assert.ok(form.metrics.postPunctuationBoundaryCount>=60);
    assert.ok(form.metrics.regionalPrimaryCounts.every(x=>x>=15));
    assert.ok(Math.max(...form.metrics.regionalPrimaryCounts)<=2*Math.min(...form.metrics.regionalPrimaryCounts)*1.5);
    for(const key of ["capital-letter","comma","terminal-mark","quote-apostrophe"])assert.ok(form.metrics.categoryRegionCounts[key]>=6);
    for(const key of ["colon-semicolon","bracket-dash"])assert.ok(form.metrics.categoryRegionCounts[key]>=4);
  }
});

test("Numbers Check forms lock quotas, digit balance, symbol coverage, runs, and mixed tokens",()=>{
  assert.equal(numCheck.forms.length,6);
  const expectedSymbols=[...PRACTICE_NUMBERS_OPERATOR_SYMBOLS,...PRACTICE_NUMBERS_IDENTIFIER_SYMBOLS,...PRACTICE_NUMBERS_COMMERCE_PERCENT_SYMBOLS].sort();
  for(const form of numCheck.forms){
    assert.equal(form.partition,"diagnostic");
    assert.ok(form.metrics.graphemeCount>=1800&&form.metrics.graphemeCount<=2100);
    assert.equal(form.metrics.primaryOpportunityCount,180);
    assert.deepEqual(form.metrics.categoryCounts,{digit:118,"operator-symbol":22,"identifier-symbol":18,"commerce-percent-symbol":22});
    assert.ok(Object.values(form.metrics.digitCounts).every(x=>x>=8&&x<=18));
    assert.deepEqual(Object.keys(form.metrics.symbolCounts).sort(),expectedSymbols);
    for(const [symbol,count] of Object.entries(form.metrics.symbolCounts)){
      const minimum="+-*/=".includes(symbol)?3:4;
      assert.ok(count>=minimum,`${symbol} coverage`);
    }
    assert.ok(form.metrics.digitRunCount>=24);
    assert.ok(form.metrics.digitRunLengthCounts["2"]>=8);
    assert.ok(form.metrics.digitRunLengthCounts["3"]>=8);
    assert.ok(form.metrics.digitRunLengthCounts["4"]>=4);
    assert.ok(form.metrics.digitRunLengthCounts["5-6"]>=4);
    assert.ok(form.metrics.mixedPracticalTokenCount>=24);
    assert.ok(form.metrics.maximumExactMixedTokenRepeats<=2);
    assert.ok(form.metrics.regionalPrimaryCounts.every(x=>x>=15));
    for(const key of ["operator-symbol","identifier-symbol","commerce-percent-symbol"])assert.ok(form.metrics.categoryRegionCounts[key]>=6);
    assert.doesNotMatch(form.text,/\b(?:\d[ -]?){10,}\b/);
    assert.doesNotMatch(form.text,/(solve|calculate|what is|answer the equation)/i);
  }
});

test("Practice pools have 8-minute capacity and engineering mixes",()=>{
  for(const form of punctPractice.forms){
    assert.equal(form.partition,"training");
    assert.ok(form.metrics.graphemeCount>=17600);
    const total=form.metrics.primaryOpportunityCount;
    const targets={"capital-letter":.30,comma:.18,"terminal-mark":.18,"colon-semicolon":.08,"quote-apostrophe":.14,"bracket-dash":.12};
    for(const [key,target] of Object.entries(targets))assert.ok(Math.abs(form.metrics.categoryCounts[key]/total-target)<=.04);
  }
  for(const form of numPractice.forms){
    assert.equal(form.partition,"training");
    assert.ok(form.metrics.graphemeCount>=17600);
    const total=form.metrics.primaryOpportunityCount;
    const targets={digit:.65,"operator-symbol":.12,"identifier-symbol":.10,"commerce-percent-symbol":.13};
    for(const [key,target] of Object.entries(targets))assert.ok(Math.abs(form.metrics.categoryCounts[key]/total-target)<=.05);
  }
});

test("annotation hashes are content-bound and validate deterministically",async()=>{
  const form=punctCheck.forms[0];
  assert.equal(await hashPracticeSpecialDomainAnnotations(form.annotations),form.annotations.annotationHash);
  const changed={...form.annotations,formHash:"sha256-changed"};
  assert.notEqual(await hashPracticeSpecialDomainAnnotations(changed),form.annotations.annotationHash);
});

test("selection and plan construction are target-blind and immutable",()=>{
  const formSet={manifest:{formSetId:punctCheck.formSetId,formSetVersion:punctCheck.formSetVersion},forms:punctCheck.forms};
  const first=selectPracticeSpecialDomainForm({sessionId:"practice-session_abcdefgh",contextLanguage:"en",formSet,selectionVersion:1});
  const second=selectPracticeSpecialDomainForm({sessionId:"practice-session_abcdefgh",contextLanguage:"en",formSet,selectionVersion:1});
  assert.equal(first.formId,second.formId);
  const plan=buildPracticeSpecialDomainPlan({sessionId:"practice-session_abcdefgh",profileId:"practice-profile_abcdefgh",contextId:"practice-context_abcdefgh",language:"en",experimentId:"punctuation-capitals-check",flow:"check",formSet,form:first,annotationVersion:1});
  assert.deepEqual(plan.targetEntities,[]);
  assert.equal(plan.resumable,false);
  const content=buildPracticeSpecialDomainContentPlan({plan,form:first,sourceType:"punctuation-capitals-diagnostic"});
  assert.deepEqual(content.targetEntities,[]);
  assert.equal(content.completion.mode,"content");
  assert.equal(content.metadata.partition,"diagnostic");
});

test("availability is layout-neutral but fails closed for genuinely missing characters",()=>{
  const ready={forms:[{}]};
  for(const keyboardLayout of ["qwerty","qwertz","azerty"]){
    const p=getPracticePunctuationCapitalsAvailability({context:{language:"en",keyboardLayout},practiceFormSet:ready,checkFormSet:ready,inputCapability:{fullTextInput:true}});
    const n=getPracticeNumbersSymbolsAvailability({context:{language:"en",keyboardLayout},practiceFormSet:ready,checkFormSet:ready,inputCapability:{fullTextInput:true}});
    assert.equal(p.practiceAvailable,true);
    assert.equal(n.checkAvailable,true);
  }
  const n=getPracticeNumbersSymbolsAvailability({context:{language:"en"},practiceFormSet:ready,checkFormSet:ready,inputCapability:{canProduceExpectedGrapheme:(value)=>value!=="@"}});
  assert.equal(n.practiceAvailable,false);
  assert.ok(n.reasons.includes("NUMBERS_SYMBOLS_INPUT_INCOMPATIBLE"));
});

test("Practice and Check descriptors preserve role, target, correction, and ability isolation",()=>{
  const pPractice=createPracticePunctuationCapitalsExperiment();
  const pCheck=createPracticePunctuationCapitalsCheckDescriptor();
  const nPractice=createPracticeNumbersSymbolsExperiment();
  const nCheck=createPracticeNumbersSymbolsCheckDescriptor();
  assert.equal(pPractice.abilityChannel,null);
  assert.equal(nPractice.abilityChannel,null);
  assert.equal(pCheck.abilityChannel,"punctuation");
  assert.equal(nCheck.abilityChannel,"numbers-symbols");
  assert.deepEqual(pPractice.supportedCompletionModes,["duration"]);
  assert.deepEqual(pCheck.supportedCompletionModes,["content"]);
  for(const descriptor of [pPractice,pCheck,nPractice,nCheck]){
    assert.equal(descriptor.defaultCorrectionBehavior,"allow");
    assert.equal(descriptor.resumable,false);
    assert.equal(descriptor.performanceMeasurementKind,null);
    assert.equal(descriptor.retentionMeasurementKind,null);
  }
});

test("streaming accumulator pools first-pass counts and reuses PL9 content classes without wrong strings",()=>{
  const annotations={
    version:1,formHash:"x",annotationHash:"y",
    primary:[
      {expectedIndex:0,domain:"punctuation-capitals",category:"capital-letter"},
      {expectedIndex:1,domain:"punctuation-capitals",category:"comma"},
    ],
    derived:{"sentence-capital":[{startIndex:0,endIndex:1,kind:"sentence-capital"}],"post-punctuation-boundary":[]},
  };
  const acc=createPracticeSpecialDomainAccumulator({annotations,primaryCategories:["capital-letter","comma"]});
  acc.recordProcessedInput({type:"character",textPosition:0,isFirstAttempt:true,correctness:"correct",latencyFromPriorInsertionMs:null,timingSegmentId:1});
  acc.recordProcessedInput({type:"character",textPosition:1,isFirstAttempt:true,correctness:"incorrect",latencyFromPriorInsertionMs:100,timingSegmentId:1});
  acc.recordProcessedInput({type:"backspace",textPosition:1,isFirstAttempt:null,correctness:null,timingSegmentId:1});
  acc.recordProcessedInput({type:"character",textPosition:1,isFirstAttempt:false,correctness:"correct",latencyFromPriorInsertionMs:100,timingSegmentId:1});
  acc.recordClosedErrorEpisode({primaryPosition:1,contentClass:"punctuation"});
  const snap=acc.getSnapshot();
  assert.equal(snap.domainOpportunityCount,2);
  assert.equal(snap.domainFirstPassCorrectCount,1);
  assert.equal(snap.domainFirstPassAccuracy,.5);
  assert.equal(snap.categories.comma.firstPassAccuracy,0);
  assert.equal(snap.categories.comma.primaryErrorEpisodeCount,1);
  assert.equal(snap.contentErrorClasses.punctuation,1);
  assert.equal(JSON.stringify(snap).includes("entered"),false);
  assert.equal(JSON.stringify(snap).includes("expected"),false);
});

test("PL30 ability admission uses 60% domain + 70% overall floors and exactly protocol-specific channel policy",()=>{
  const policyP=getPracticeAbilityChannelPolicy("punctuation");
  const policyN=getPracticeAbilityChannelPolicy("numbers-symbols");
  assert.equal(policyP.minimumAccuracy,60);
  assert.equal(policyN.minimumAccuracy,60);
  assert.equal(policyP.maximumDurationMs,420000);
  assert.equal(policyN.maximumDurationMs,420000);
  const foundation={
    normalization:{sessionSummary:{textDifficulty:{status:"full",difficultyIndex:.5,availableModelWeight:.95}}},
    latency:{sessionSummary:{fluentMedianMs:100,fluentMadMs:10,interruptionRate:0,coverage:{scope:"complete-session"}}},
  };
  const session={status:"completed",completionReason:"content-complete",wpm:72,rawWpm:75,activeDurationMs:180000,typedCharacterCount:1900};
  const good={domainOpportunityCount:180,domainFirstPassAccuracy:.60,overallFirstPassAccuracy:.70};
  const result=buildPracticeSpecialDomainAbilityMeasurement({accumulatorSnapshot:good,session,foundationAnalysis:foundation,channel:"punctuation",protocol:"punctuation-capitals-check"});
  assert.ok(result);
  assert.equal(result.accuracy,60);
  assert.equal(result.difficultyModelStatus,"full");
  assert.equal(result.difficultyAdjustmentLog,.03*.5*.95);
  assert.equal(buildPracticeSpecialDomainAbilityMeasurement({accumulatorSnapshot:{...good,domainFirstPassAccuracy:.599},session,foundationAnalysis:foundation,channel:"punctuation",protocol:"punctuation-capitals-check"}),null);
  assert.equal(buildPracticeSpecialDomainAbilityMeasurement({accumulatorSnapshot:{...good,overallFirstPassAccuracy:.699},session,foundationAnalysis:foundation,channel:"punctuation",protocol:"punctuation-capitals-check"}),null);
});

test("PL10 out-of-domain ability path sets A_d=0 and adds the 0.04 protocol uncertainty term",()=>{
  const foundation={
    normalization:{sessionSummary:{textDifficulty:{status:"insufficient",difficultyIndex:null,availableModelWeight:0}}},
    latency:{sessionSummary:{fluentMedianMs:100,fluentMadMs:10,interruptionRate:0,coverage:{scope:"complete-session"}}},
  };
  const session={status:"completed",completionReason:"content-complete",wpm:60,rawWpm:63,activeDurationMs:200000,typedCharacterCount:1900};
  const snap={domainOpportunityCount:180,domainFirstPassAccuracy:.9,overallFirstPassAccuracy:.95};
  const result=buildPracticeSpecialDomainAbilityMeasurement({accumulatorSnapshot:snap,session,foundationAnalysis:foundation,channel:"numbers-symbols",protocol:"numbers-symbols-check"});
  assert.ok(result);
  assert.equal(result.difficultyAdjustmentLog,0);
  assert.equal(result.adjustedWpm,60);
  assert.equal(result.difficultyModelStatus,"protocol-matched-only");
  assert.ok(result.measurementSigmaLog>=.05&&result.measurementSigmaLog<=.25);
});

test("PL30 source contains no combined score or physical-technique grading implementation",()=>{
  const source=[
    fs.readFileSync("js/practiceLab/practicePunctuationCapitalsExperiment.js","utf8"),
    fs.readFileSync("js/practiceLab/practiceNumbersSymbolsExperiment.js","utf8"),
    fs.readFileSync("js/practiceLab/practiceSpecialDomainSessionHost.js","utf8"),
  ].join("\n");
  assert.doesNotMatch(source,/special.?character.?score/i);
  assert.doesNotMatch(source,/correct Shift|wrong Shift|right Shift for left/i);
  assert.doesNotMatch(source,/numeracy score|math skill/i);
  assert.doesNotMatch(source,/submit.*leaderboard|leaderboardId|personalBest|updatePersonalBest/i);
});

test("PL30 pure modules have no import-time fetch, storage writes, timers, or listeners",async()=>{
  const script=`
    let fetches=0,timers=0,listeners=0,writes=0,opens=0;
    globalThis.fetch=()=>{fetches++;throw new Error("fetch");};
    globalThis.setTimeout=()=>{timers++;throw new Error("timer");};
    globalThis.addEventListener=()=>{listeners++;};
    globalThis.localStorage={setItem(){writes++;},getItem(){return null;}};
    globalThis.indexedDB={open(){opens++;throw new Error("db");}};
    await import("./js/practiceLab/practiceSpecialDomainConstants.js");
    await import("./js/practiceLab/practiceSpecialDomainAnnotations.js");
    await import("./js/practiceLab/practiceSpecialDomainAccumulator.js");
    await import("./js/practiceLab/practiceSpecialDomainAbilityMeasurement.js");
    await import("./js/practiceLab/practicePunctuationCapitalsPolicy.js");
    await import("./js/practiceLab/practiceNumbersSymbolsPolicy.js");
    if(fetches||timers||listeners||writes||opens)process.exit(2);
  `;
  const {spawnSync}=await import("node:child_process");
  const out=spawnSync(process.execPath,["--input-type=module","-e",script],{cwd:process.cwd(),encoding:"utf8"});
  assert.equal(out.status,0,out.stderr||out.stdout);
});
